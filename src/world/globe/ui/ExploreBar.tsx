import { useEffect, useRef, useState } from "react";
import { debounce, distanceAndBearing, rateLimit } from "../exploreMath.ts";
import { placeSelection, pointSelection, searchPlaces, type Place } from "../exploreApi.ts";
import { canvasState, surfaceClicks, surfacePicker } from "../exploreCanvas.ts";
import { useExplore } from "../exploreState.ts";
import { simTime, useGlobe } from "../globeStore.ts";
import type { LatLon } from "../geoMath.ts";
import ExploreMeasure from "./exploreMeasure.tsx";

declare global { interface Window { __W11_POINT__?: (point: LatLon) => void } }
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const buttonClass = "min-h-9 whitespace-nowrap rounded-lg px-2 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent aria-pressed:bg-white/10";

/** Lazy DOM surface. Tiers share five results; only the measurement's
 * fixed vertex cap changes. No background geolocation/weather requests. */
export default function ExploreBar({ tier }: { tier: 1 | 2 | 3 }) {
  const host = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState("");
  const searchAbort = useRef<AbortController | null>(null), pointAbort = useRef<AbortController | null>(null);
  const scheduler = useRef<ReturnType<typeof debounce<string>> | null>(null);
  const mode = useExplore(s => s.mode), points = useExplore(s => s.points);
  const view = useGlobe(s => s.view);

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
        if (!controller.signal.aborted) { setResults(places); setActive(-1); setMessage(places.length ? "" : "No places found"); }
      } catch { if (!controller.signal.aborted) setMessage("Search unavailable. Try again."); }
    });
    return () => { scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort(); };
  }, []);

  const clear = () => {
    scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
    setQuery(""); setResults([]); setActive(-1); setMessage(""); useExplore.getState().setMode(null);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "/" && !typing(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); input.current?.focus(); }
      if (event.key === "Escape") {
        scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
        setQuery(""); setResults([]); setActive(-1); setMessage(""); useExplore.getState().setMode(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); useExplore.getState().setMode(null); };
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

  const choose = (place: Place) => {
    scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
    const store = useGlobe.getState(), selection = placeSelection(place, simTime(store.timeOffsetMin));
    store.setView("orbit"); store.flyTo(selection.focus!); store.select(selection); store.setSheet("inspector");
    setQuery(place.name); setResults([]); setActive(-1); setMessage("");
  };
  const toggle = (next: "here" | "measure") => {
    scheduler.current?.cancel(); searchAbort.current?.abort(); pointAbort.current?.abort();
    setResults([]); setMessage("");
    useExplore.getState().setMode(mode === next ? null : next);
  };
  const measurement = points.length === 2 ? distanceAndBearing(points[0], points[1]) : null;
  return (
    <div ref={host} data-explore-bar className="pointer-events-auto absolute left-1/2 top-[104px] z-30 w-[calc(100%-32px)] max-w-[377px] -translate-x-1/2 rounded-xl border border-line bg-ink/90 p-2 font-mono text-xs text-zinc-200 backdrop-blur sm:top-[108px]">
      <div className="flex items-center gap-1">
        <input ref={input} type="search" role="combobox" aria-label="Search places" aria-autocomplete="list" aria-controls="explore-results" aria-expanded={results.length > 0} aria-activedescendant={active >= 0 ? `explore-result-${active}` : undefined}
          placeholder="Search places /" value={query} className="h-9 min-w-0 flex-1 rounded-lg bg-transparent px-2 outline-offset-2 focus-visible:outline focus-visible:outline-accent"
          onChange={event => {
            const value = event.target.value; setQuery(value); setResults([]); setActive(-1); setMessage("");
            searchAbort.current?.abort(); scheduler.current?.cancel();
            if (value.trim().length >= 3) scheduler.current?.schedule(value.trim());
          }}
          onKeyDown={event => {
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
              event.preventDefault(); setActive(i => (i + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
            } else if (event.key === "Enter" && results.length) { event.preventDefault(); choose(results[active < 0 ? 0 : active]); }
          }} />
        <button type="button" className={buttonClass} onClick={clear} aria-label="Clear exploration">×</button>
        <button type="button" className={buttonClass} aria-pressed={mode === "here"} disabled={view !== "orbit"} onClick={() => toggle("here")}>What's here</button>
        <button type="button" className={buttonClass} aria-pressed={mode === "measure"} disabled={view !== "orbit"} onClick={() => toggle("measure")}>Measure</button>
      </div>
      {results.length > 0 && <ul id="explore-results" role="listbox" aria-label="Places" className="max-h-52 overflow-y-auto border-t border-line py-1">
        {results.map((place, i) => <li key={`${place.lat}:${place.lon}:${i}`} id={`explore-result-${i}`} role="option" aria-selected={i === active} className={i === active ? "rounded-lg bg-white/10" : ""}>
          <button type="button" tabIndex={-1} className="min-h-11 w-full px-2 py-2 text-left hover:text-accent" onClick={() => choose(place)}>
            <span className="block truncate">{place.name}</span><span className="block truncate text-zinc-400">{place.country} · {place.type}</span>
          </button>
        </li>)}
      </ul>}
      <div role="status" aria-live="polite">
        {message && <p className="px-2 py-1">{message}</p>}
        {mode === "here" && !message && <p className="px-2 py-1">Click the globe to look up a point</p>}
        {mode === "measure" && <p data-measure-result className="px-2 py-1">
          {measurement ? `${measurement.km.toFixed(1)} km · ${measurement.nauticalMiles.toFixed(1)} nm · ${measurement.bearing === null ? "bearing undefined" : `${measurement.bearing.toFixed(1)}° initial`}` : points.length ? "Choose the second point" : "Choose two points"}
        </p>}
      </div>
      <p className="px-2 pt-1 text-zinc-400"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:text-accent">© OpenStreetMap contributors (ODbL)</a></p>
      <ExploreMeasure canvas={canvas} tier={tier} />
    </div>
  );
}
