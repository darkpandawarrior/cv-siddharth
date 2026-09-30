import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { debounce, distanceAndBearing, rateLimit } from "../exploreMath.ts";
import { placeSelection, pointSelection, searchPlaces, type Place } from "../exploreApi.ts";
import { canvasState, surfaceClicks, surfacePicker } from "../exploreCanvas.ts";
import { useExplore } from "../exploreState.ts";
import { simTime, useGlobe } from "../globeStore.ts";
import type { LatLon } from "../geoMath.ts";
import { askGlobeLLM } from "../copilot/askLLM.ts";
import { buildGlobeContext } from "../copilot/context.ts";
import { executeActions } from "../copilot/execute.ts";
import { parseIntent } from "../copilot/intents.ts";
import type { GlobeAction } from "../copilot/actions.ts";
import { buildUndo, describeActions, EXAMPLE_CHIPS } from "./oneBox.ts";
import { pickSurprise } from "./surpriseMe.ts";
import ExploreMeasure from "./exploreMeasure.tsx";

declare global { interface Window { __W11_POINT__?: (point: LatLon) => void } }
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const buttonClass = "min-h-11 whitespace-nowrap rounded-lg px-2 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent aria-pressed:bg-white/10";

const PHONE_QUERY = "(max-width: 639px)";
const subscribePhone = (notify: () => void) => {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

// LANE X2 ("ONE BOX"): a place-search result and the box's own leading
// command/ask row share one keyboard-navigable list, so both live behind a
// single discriminated type instead of two parallel index spaces.
type TopRow = { kind: "surprise"; label: string } | { kind: "run"; label: string; actions: GlobeAction[] } | { kind: "ask"; text: string };
type Row = TopRow | { kind: "example"; text: string } | { kind: "place"; place: Place };

/** No network call, no store import: safe to run on every keystroke. */
function classify(query: string): TopRow | null {
  const text = query.trim();
  if (!text) return null;
  if (/^surprise me[.!]?$/i.test(text)) return { kind: "surprise", label: "Surprise me with a real place" };
  const actions = parseIntent(text);
  return actions ? { kind: "run", label: `Run: ${describeActions(actions)}`, actions } : { kind: "ask", text };
}

/** Lazy DOM surface. Tiers share five results; only the measurement's
 * fixed vertex cap changes. No background geolocation/weather requests. */
export default function ExploreBar({ tier, layoutRef }: { tier: 1 | 2 | 3; layoutRef: (el: HTMLDivElement | null) => void }) {
  const host = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const register = useCallback((el: HTMLDivElement | null) => { host.current = el; layoutRef(el); }, [layoutRef]);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [focused, setFocused] = useState(false);
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ text: string; undo: GlobeAction[]; restore?: () => void } | null>(null);
  const searchAbort = useRef<AbortController | null>(null), pointAbort = useRef<AbortController | null>(null);
  const scheduler = useRef<ReturnType<typeof debounce<string>> | null>(null);
  const allowAsk = useRef(rateLimit(3000));
  const askToken = useRef(0);
  const mode = useExplore(s => s.mode), points = useExplore(s => s.points);
  const view = useGlobe(s => s.view);
  const sheet = useGlobe(s => s.sheet);


  const topRow = useMemo(() => classify(query), [query]);
  const examples = phone && focused && !query && !answer;
  const rows: Row[] = useMemo(() => examples
    ? EXAMPLE_CHIPS.map((text): Row => ({ kind: "example", text }))
    : [...(topRow ? [topRow] : []), ...results.map((place): Row => ({ kind: "place", place }))], [examples, topRow, results]);

  useEffect(() => {
    const root = host.current?.closest("[data-globe-root]");
    if (!root) return;
    const find = () => setCanvas(root.querySelector("canvas"));
    find();
    const observer = new MutationObserver(find);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scheduler.current = debounce(async (value: string) => {
      const controller = new AbortController(); searchAbort.current = controller;
      setMessage("Searching…");
      try {
        const places = await searchPlaces(value, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
        if (!controller.signal.aborted) { setResults(places); setMessage(places.length ? "" : "No places found"); }
      } catch { if (!controller.signal.aborted) setMessage("Search unavailable. Try again."); }
    });
    return () => { scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort(); };
  }, []);

  const clear = () => {
    scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
    askToken.current++;
    setQuery(""); setResults([]); setActive(-1); setMessage(""); setAsking(false); setAnswer(null);
    useExplore.getState().setMode(null);
  };

  // "/" and Cmd/Ctrl-K both focus this box; Esc clears/closes.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "/" && !typing(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); input.current?.focus(); }
      if (event.key === "Escape") {
        scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
        askToken.current++;
        setFocused(false);
        setQuery(""); setResults([]); setActive(-1); setMessage(""); setAsking(false); setAnswer(null);
        useExplore.getState().setMode(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); useExplore.getState().setMode(null); };
  }, []);

  // Cmd/Ctrl-K: CommandPalette.tsx already claims this globally on a plain
  // (bubble-phase) window listener with no target check at all - see its
  // own file header. Taking it everywhere here would fight that palette, so
  // this only fires when focus already sits inside the globe root, and does
  // so from the CAPTURE phase (which always runs before a same-target bubble
  // listener regardless of mount order) so `stopPropagation` reliably keeps
  // the palette's own handler from also toggling open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const root = host.current?.closest("[data-globe-root]");
      if (!root || !root.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    if (!canvas) return;
    const allow = rateLimit(1000);
    const click = async (point: LatLon) => {
      const current = useExplore.getState(), globe = useGlobe.getState();
      if (globe.view !== "orbit") return;
      if (current.mode === "measure") { current.addPoint(point); return; }
      if (current.mode !== "here" || !allow()) return;
      pointAbort.current?.abort();
      const controller = new AbortController(); pointAbort.current = controller;
      const previous = globe.selected;
      setMessage("Looking up this point…");
      const selection = await pointSelection(point, simTime(globe.timeOffsetMin), AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), globe.timeOffsetMin !== 0);
      if (!controller.signal.aborted) {
        setMessage("");
        const latest = useGlobe.getState();
        if (latest.timeOffsetMin === globe.timeOffsetMin && latest.selected === previous && latest.view === "orbit") {
          latest.select(selection); latest.setSheet("inspector");
        }
      }
    };
    const unclick = surfaceClicks(canvas, surfacePicker(canvas, () => canvasState(canvas)), point => void click(point));
    if (window.__W11_TEST__) window.__W11_POINT__ = point => void click(point);
    return () => { unclick(); pointAbort.current?.abort(); delete window.__W11_POINT__; };
  }, [canvas]);

  /** Free, instant, no network - straight through execute.ts's own store
   *  writer. Snapshots BEFORE applying so the undo restores the real prior
   *  value (see oneBox.ts's buildUndo header for why a plain flip is wrong). */
  const runCommand = (actions: GlobeAction[]) => {
    const before = { layers: useGlobe.getState().layers, timeOffsetMin: useGlobe.getState().timeOffsetMin };
    const summary = executeActions(actions);
    setAnswer({ text: summary, undo: buildUndo(actions, before) });
  };

  /** The LLM fallback (brief: "calls copilot/askLLM.ts ... with a thinking
   *  state, then the narrate text and the list of applied actions"). The
   *  three-line fallback-text shape below intentionally mirrors
   *  execute.ts's own runGlobeAsk rather than importing it: that entry point
   *  returns a single string with no actions, and no undo can be built
   *  without them - reaching into execute.ts for a second export was the
   *  brief's offered escape hatch, but it isn't needed since askGlobeLLM and
   *  executeActions are already public exports this file can call directly. */
  const runAsk = async (text: string) => {
    if (!allowAsk.current()) { setMessage("Ask the globe is limited to one question every 3 seconds. Try again in a moment."); return; }
    const token = ++askToken.current;
    setAsking(true); setAnswer(null); setMessage("");
    const before = { layers: useGlobe.getState().layers, timeOffsetMin: useGlobe.getState().timeOffsetMin };
    const { actions, narrate } = await askGlobeLLM(text, buildGlobeContext());
    if (token !== askToken.current) return; // query changed or box closed while the request was in flight
    const summary = actions.length ? executeActions(actions) : "";
    const label = narrate
      ? (summary ? `${narrate} (${summary})` : narrate)
      : (summary || "I didn't catch a command in that. Try \"fly to Tokyo\" or \"show quakes above 5\".");
    setAsking(false);
    setAnswer({ text: label, undo: actions.length ? buildUndo(actions, before) : [] });
  };

  const runRow = (row: Row) => {
    setFocused(false);
    if (row.kind === "example") {
      const command = classify(row.text);
      if (command) runRow(command);
      return;
    }
    scheduler.current?.cancel(); searchAbort.current?.abort();
    if (row.kind === "surprise") { runSurprise(); return; }
    if (row.kind === "place") { choose(row.place); return; }
    setResults([]);
    if (row.kind === "run") { setQuery(""); setActive(-1); void runCommand(row.actions); return; }
    void runAsk(row.text);
  };

  /** LANE P1 (wave 7): "Surprise me" -- flies to a real, currently
   *  interesting place computed from data this page already loaded (see
   *  surpriseMe.ts's own header for the exact sources and why each counts
   *  as "already loaded"), and says why it picked it. Snapshots the prior
   *  focus/selection first so a single Undo can put the view back. */
  const runSurprise = () => {
    scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
    askToken.current++;
    setAsking(false); setQuery("");
    useExplore.getState().setMode(null);
    setResults([]); setActive(-1); setMessage(""); setAnswer(null);
    const before = { focus: useGlobe.getState().focus, selected: useGlobe.getState().selected, view: useGlobe.getState().view };
    const result = pickSurprise();
    if (!result) { setMessage("No source is available for Surprise me right now. Try again in a moment."); return; }
    const store = useGlobe.getState();
    store.setView("orbit");
    store.flyTo(result.selection.focus ?? null);
    store.select(result.selection);
    store.setSheet("inspector");
    setAnswer({ text: `Surprise: ${result.reason}.`, undo: [], restore: before.focus ? () => { store.flyTo(before.focus); store.select(before.selected); store.setView(before.view); } : undefined });
  };

  const undoLast = () => {
    if (!answer) return;
    if (answer.restore) answer.restore();
    else executeActions(answer.undo);
    setAnswer(null);
  };

  const applyQuery = (value: string) => {
    setQuery(value); setResults([]); setActive(-1); setMessage(""); setAnswer(null); setAsking(false);
    searchAbort.current?.abort(); scheduler.current?.cancel(); askToken.current++;
    if (value.trim().length >= 3 && classify(value)?.kind !== "surprise") scheduler.current?.schedule(value.trim());
  };

  const choose = (place: Place) => {
    scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
    const store = useGlobe.getState(), selection = placeSelection(place, simTime(store.timeOffsetMin));
    store.setView("orbit"); store.flyTo(selection.focus!); store.select(selection); store.setSheet("inspector");
    setQuery(place.name); setResults([]); setActive(-1); setMessage("");
  };
  const toggle = (next: "here" | "measure" | "pin") => {
    scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
    setResults([]); setMessage("");
    useExplore.getState().setMode(mode === next ? null : next);
  };
  const measurement = points.length === 2 ? distanceAndBearing(points[0], points[1]) : null;
  return (
    <div ref={register} data-explore-bar className={`${sheet ? "compact:!hidden" : ""} pointer-events-auto absolute left-[var(--globe-explore-left,50%)] top-[var(--globe-explore-top,var(--globe-top-offset,6.5rem))] max-h-[var(--globe-explore-max-h)] z-10 w-[calc(100%-32px)] max-w-[min(377px,calc(var(--globe-explore-room-w,100%)-32px))] -translate-x-1/2 rounded-xl glass-panel p-1 font-mono text-xs text-zinc-200 overflow-y-auto`}>
      {mode === "pin" && <div className="flex items-center justify-between gap-2 px-2">
        <p className="text-zinc-200">Tap, click or Enter to pin.</p>
        <button type="button" className={buttonClass} aria-label="Pin points" aria-pressed="true" onClick={() => toggle("pin")}>Done pinning</button>
      </div>}
      <div className={mode === "pin" ? "hidden" : "flex flex-wrap items-center"}>
        <input ref={input} type="search" role="combobox" aria-label="Search places or ask the globe" aria-autocomplete="list" aria-controls="explore-results" aria-expanded={rows.length > 0} aria-activedescendant={active >= 0 ? `explore-result-${active}` : undefined}
          placeholder="Search or ask" value={query} className="h-11 min-w-0 flex-1 basis-[calc(100%-48px)] rounded-lg bg-transparent px-2 outline-offset-2 focus-visible:outline focus-visible:outline-accent"
          onFocus={() => { setFocused(true); setActive(-1); }}
          onBlur={() => { setFocused(false); setActive(-1); }}
          onChange={event => applyQuery(event.target.value)}
          onKeyDown={event => {
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && rows.length) {
              event.preventDefault(); setActive(i => (i + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
            } else if (event.key === "Enter" && rows.length) { event.preventDefault(); runRow(rows[active < 0 ? 0 : active]); }
          }} />
        <button type="button" className={buttonClass} onClick={clear} aria-label="Clear exploration">×</button>
        <button type="button" className={buttonClass} aria-pressed={mode === "here"} disabled={view !== "orbit"} onClick={() => toggle("here")}>What's here</button>
        <button type="button" className={buttonClass} aria-pressed={mode === "measure"} disabled={view !== "orbit"} onClick={() => toggle("measure")}>Measure</button>
        {mode !== "pin" && <button type="button" className={buttonClass} aria-label="Pin points" aria-pressed={false} disabled={view !== "orbit"} onClick={() => toggle("pin")}>Pin</button>}
        {!query && !answer && <button type="button" className={buttonClass} onClick={runSurprise}>Surprise me</button>}
      </div>
      {mode !== "pin" && focused && !query && !answer && <div className="hidden compact:!hidden flex-wrap gap-1 border-t border-line px-2 py-1.5 sm:flex">
        {EXAMPLE_CHIPS.map(chip => (
          <button key={chip} type="button" onClick={() => { applyQuery(chip); input.current?.focus(); }}
            className="rounded-full border border-line px-2 py-1 text-xs text-zinc-400 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            {chip}
          </button>
        ))}
      </div>}
      {mode !== "pin" && rows.length > 0 && <ul id="explore-results" role="listbox" aria-label="Commands and places" className="max-h-52 overflow-y-auto border-t border-line py-1">
        {rows.map((row, i) => <li key={row.kind === "place" ? `${row.place.lat}:${row.place.lon}:${i}` : `${row.kind}:${i}`} id={`explore-result-${i}`} role="option" aria-selected={i === active} className={i === active ? "rounded-lg bg-white/10" : ""}>
          <button type="button" tabIndex={-1} onPointerDown={event => event.preventDefault()} onClick={() => runRow(row)} className="min-h-11 w-full px-2 py-2 text-left hover:text-accent">
            {row.kind === "place"
              ? <><span className="block truncate">{row.place.name}</span><span className="block truncate text-zinc-400">{row.place.country} · {row.place.type}</span></>
              : row.kind === "example" ? <span className="block truncate">{row.text}</span>
              : (row.kind === "run" || row.kind === "surprise")
                ? <span className="block truncate">{row.label}</span>
                : <><span className="block truncate">Ask the globe</span><span className="block truncate text-zinc-400">"{row.text}"</span></>}
          </button>
        </li>)}
      </ul>}
      <div role="status" aria-live="polite" className={mode === "pin" ? "hidden" : undefined}>
        {asking && <p data-onebox-thinking className="px-2 py-1">Thinking…</p>}
        {!asking && answer && <p data-onebox-answer className="flex items-start justify-between gap-2 px-2 py-1">
          <span>{answer.text}</span>
          {(answer.restore || answer.undo.length > 0) && <button type="button" onClick={undoLast} className="shrink-0 whitespace-nowrap rounded-lg px-1 text-zinc-400 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Undo</button>}
        </p>}
        {!asking && !answer && message && <p className="px-2 py-1">{message}</p>}
        {mode === "here" && !message && <p className="px-2 py-1">Click the globe to look up a point</p>}
        {mode === "measure" && <p data-measure-result className="px-2 py-1">
          {measurement ? `${measurement.km.toFixed(1)} km · ${measurement.nauticalMiles.toFixed(1)} nm · ${measurement.bearing === null ? "bearing undefined" : `${measurement.bearing.toFixed(1)}° initial`}` : points.length ? "Choose the second point" : "Choose two points"}
        </p>}
      </div>
      <p className={mode === "pin" || (!results.length && !answer && !message) ? "hidden" : "px-2 pt-1 text-zinc-400"}><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:text-accent">© OpenStreetMap contributors (ODbL)</a></p>
      <ExploreMeasure canvas={canvas} tier={tier} />
    </div>
  );
}
