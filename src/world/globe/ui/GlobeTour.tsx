import { useEffect, useMemo, useRef } from "react";
import { EvidenceChip } from "../../../EvidenceChip.tsx";
import { PUNE } from "../../../lib/sky.ts";
import { experience } from "../../../data/profile/experience.ts";
import { fleetStats, storeApps } from "../../../data/store.ts";
import { openSource, upstreamMergedPRs } from "../../../data/profile/openSource.ts";
import { liveDotsLabel } from "../globeRows.ts";
import { usePresenceGeo } from "../presenceGeo.ts";
import { isTypingTarget, ownsKey } from "./shortcutTarget.ts";
import { useCompare } from "../timeMachine/compareStore.ts";
import { useGlobe } from "../globeStore.ts";

/** LANE L5 (navigation and UI) wrote the stops and the original single
 *  floating dialog. LANE U1 (composition) split the shell into three forms
 *  sharing the same stop content: an idle pill in the shared top row (sm+),
 *  a running card in the shared left slot (sm+, the same slot Inspector
 *  uses - they never show together, since entering a stop already clears
 *  the selection below), and a running bottom sheet on phones (< 640,
 *  opened by Globe.tsx's own Tour icon button via `store.sheet`).
 *
 *  Mounted TWICE by Globe.tsx with a different `slot`, not once: the idle
 *  pill (`slot="row"`) must be a plain flow child of the top bar for
 *  flex-wrap to place it correctly, which means the top bar has to be a
 *  CSS positioned element (so it paints above the WebGL canvas at all,
 *  since an unpositioned sibling of an absolutely-positioned canvas paints
 *  BEHIND it per the CSS painting order, regardless of z-index). But the
 *  running card's `position:absolute` coordinates (`slot="overlay"`) are
 *  meant to resolve against the globe root/stage, not against the top bar -
 *  nesting both forms in one mount would make the card a child of a
 *  positioned top bar and silently resolve its percentages against the
 *  WRONG box. Two mounts, one shared store, no such conflict; the
 *  keyboard/enter effects below only run from the "overlay" instance so
 *  they never double-fire. */

const upstreamRepo = openSource.find((c) => c.org === "career-ops-hq")?.repo ?? "career-ops-hq/career-ops";

interface Stop {
  title: string;
  body: (props: { presence: Record<string, number> }) => React.ReactNode;
  /** Runs once on entering this stop -- flies the camera / switches the
   *  view, per this lane's own brief ("each stop flies the camera"). */
  enter: (actions: { flyTo: ReturnType<typeof useGlobe.getState>["flyTo"]; setView: ReturnType<typeof useGlobe.getState>["setView"] }) => void;
}

// Real data only, read from the site's own data modules (never invented) --
// exactly the "number beside its source file" discipline GlobePanel already
// carries, via the same EvidenceChip.
const STOPS: Stop[] = [
  {
    title: "Pune, the origin",
    body: () => (
      <div>
        <p className="mb-2">Every role on the timeline, in order:</p>
        <ul className="mb-2 space-y-1">
          {experience.map((e) => (
            <li key={e.company} className="truncate">
              {e.role} · {e.company} ({e.period})
            </li>
          ))}
        </ul>
        <EvidenceChip file="profile/experience.ts" source="the career timeline" cadence="manual" />
      </div>
    ),
    enter: ({ flyTo, setView }) => {
      setView("orbit");
      flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon, distance: 18 });
    },
  },
  {
    title: "Reach",
    body: () => (
      <div>
        <p className="mb-2">{fleetStats.installFloor.toLocaleString("en-IN")} installs, as a floor across the fleet:</p>
        <ul className="mb-2 space-y-1">
          {storeApps.map((a) => (
            <li key={a.id} className="truncate">
              {a.name} · {a.installs}
            </li>
          ))}
        </ul>
        <EvidenceChip file="store.ts" source="Play Store listings" cadence="manual" />
      </div>
    ),
    enter: ({ flyTo, setView }) => {
      setView("orbit");
      flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon, distance: 27 });
    },
  },
  {
    title: "Upstream",
    body: () => (
      <div>
        <p className="mb-2">
          {upstreamMergedPRs} merged pull requests upstream, in {upstreamRepo}.
        </p>
        <EvidenceChip file="profile/openSource.ts" source="career-ops-hq on GitHub" cadence="manual" />
      </div>
    ),
    enter: ({ flyTo, setView }) => {
      setView("orbit");
      flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon, distance: 36 });
    },
  },
  {
    title: "The sky over Pune",
    body: () => <p>Standing at Pune, looking up: the real stars, the Moon at its true phase, and anything overhead right now.</p>,
    enter: ({ flyTo, setView }) => {
      flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon });
      setView("ground");
    },
  },
  {
    title: "Visitors right now",
    body: ({ presence }) => <p>{liveDotsLabel(presence)}, live on this page.</p>,
    enter: ({ flyTo, setView }) => {
      setView("orbit");
      flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon, distance: 20 });
    },
  },
  {
    title: "The pulse",
    body: () => <p>CI runs, pushes and downloads rise over Pune as they happen, capped and never invented when the feed is down.</p>,
    enter: ({ flyTo, setView }) => {
      setView("orbit");
      flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon, distance: 20 });
    },
  },
];

export default function GlobeTour({ slot }: { tier: 1 | 2 | 3; slot: "row" | "overlay" }) {
  const tourStep = useGlobe((s) => s.tourStep);
  const setTourStep = useGlobe((s) => s.setTourStep);
  const flyTo = useGlobe((s) => s.flyTo);
  const setView = useGlobe((s) => s.setView);
  const select = useGlobe((s) => s.select);
  const sheet = useGlobe((s) => s.sheet);
  const setSheet = useGlobe((s) => s.setSheet);
  const presence = usePresenceGeo();

  const desktopDialog = useRef<HTMLDivElement>(null);
  const phoneDialog = useRef<HTMLDivElement>(null);
  const running = tourStep !== null;
  const step = running ? Math.max(0, Math.min(STOPS.length - 1, tourStep!)) : 0;

  // Both effects below own real side effects (flying the camera, a global
  // keydown listener) - gated to the "overlay" instance only, so mounting
  // this component twice (see the file docstring) never double-fires them.
  useEffect(() => {
    if (slot !== "overlay" || tourStep === null) return;
    // The tour owns the camera and both its own on-screen slots; a stale
    // Inspector card from before the tour started has nowhere non-
    // overlapping left to sit (they share the same left slot / sheet).
    // Closing it here is simpler and more honest than chasing pixel offsets
    // between two independent cards.
    select(null);
    STOPS[step].enter({ flyTo, setView });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flyTo/setView/select are stable store actions
  }, [tourStep, slot]);

  useEffect(() => {
    if (slot !== "overlay" || !running) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      if (e.key === "Escape") exit();
      else if (e.defaultPrevented || useCompare.getState().state || ownsKey(e.target as HTMLElement | null, e.key)) return;
      else if (e.key === "ArrowRight") setTourStep(Math.min(STOPS.length - 1, step + 1));
      else if (e.key === "ArrowLeft") setTourStep(Math.max(0, step - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exit/setTourStep close over fresh state via the store
  }, [running, step, slot]);

  useEffect(() => {
    if (slot !== "overlay" || !running) return;
    const previous = document.activeElement;
    // The T shortcut sets the tour step; it must also open its phone sheet.
    if (window.innerWidth < 640) setSheet("tour");
    else desktopDialog.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [running, slot, setSheet]);

  useEffect(() => {
    if (slot === "overlay" && running && sheet === "tour" && window.innerWidth < 640) phoneDialog.current?.focus();
  }, [running, sheet, slot]);

  const stopBody = useMemo(() => STOPS[step].body({ presence }), [step, presence]);

  // Fully ends the tour AND releases the phone sheet slot it may have been
  // using — a no-op on desktop, where there is no sheet to close.
  function exit() {
    setTourStep(null);
    setSheet(null);
  }

  const dots = (
    <div className="mb-2 flex items-center justify-center gap-1.5" aria-hidden>
      {STOPS.map((s, i) => (
        <span key={s.title} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: i === step ? "var(--color-signal)" : "#3f3f46" }} />
      ))}
    </div>
  );

  const cardBody = (touchTarget: string) => (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">{STOPS[step].title}</h2>
        <button type="button" onClick={exit} className={`rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget}`}>
          Exit
        </button>
      </div>
      <div className="mb-3 text-xs leading-relaxed">{stopBody}</div>
      {dots}
      {/* Sticky, same reason as Inspector.tsx's own actions row: a narrow
          sm+ width with a wrapped topbar shrinks the card's available
          height (Globe.tsx's --globe-top-offset), which can push Back/Next
          out of the initial scroll view on a longer stop's body text. */}
      <div className="sticky bottom-0 -mx-3 -mb-3 flex items-center justify-between gap-2 rounded-b-2xl glass-panel px-3 pb-3 pt-2">
        <button
          type="button"
          onClick={() => setTourStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className={`rounded-full border border-line px-2 text-xs disabled:opacity-30 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget}`}
        >
          Back
        </button>
        <span className="text-xs text-muted">
          {step + 1} / {STOPS.length}
        </span>
        <button
          type="button"
          onClick={() => (step === STOPS.length - 1 ? exit() : setTourStep(step + 1))}
          className={`rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget}`}
        >
          {step === STOPS.length - 1 ? "Done" : "Next"}
        </button>
      </div>
    </>
  );

  if (slot === "row") {
    // Desktop/tablet (sm+) idle pill only, a plain flow child of the shared
    // top row. Phones get a dedicated icon button from Globe.tsx instead
    // (44px touch target, starts the tour and opens the sheet in one tap).
    // Running state has nothing to show here - the card lives in the
    // "overlay" mount instead.
    if (running) return null;
    return (
      <button
        type="button"
        onClick={() => setTourStep(0)}
        className="pointer-events-auto hidden items-center rounded-full glass-panel px-3 py-1.5 font-mono text-xs text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:inline-flex"
      >
        Take the tour
      </button>
    );
  }

  // slot === "overlay": positioned relative to the globe root/stage, not the
  // top row - see the file docstring for why this has to be a separate
  // mount from the idle pill above.
  return (
    <>
      {/* Desktop/tablet running card - the shared left slot (Inspector's own
          absolute box; they are never both visible, so occupying the exact
          same coordinates never collides). */}
      {running && (
        <div
          data-globe-tour
          ref={desktopDialog}
          tabIndex={-1}
          role="dialog"
          aria-label="Guided tour"
          className="pointer-events-auto absolute inset-x-4 top-20 z-30 hidden max-h-[calc(100%-45%-96px)] w-[288px] overflow-y-auto rounded-2xl glass-panel p-3 font-mono text-xs text-zinc-300 sm:top-[var(--globe-left-slot-top,5rem)] sm:block sm:inset-x-auto sm:left-4 sm:bottom-[var(--globe-facts-reserve,calc(45%+16px))] sm:max-h-[calc(100%-var(--globe-facts-reserve,calc(45%+16px))-var(--globe-left-slot-top,5rem))]"
        >
          {cardBody("py-1")}
        </div>
      )}

      {/* Phone (< 640): a bottom sheet, one of store.sheet's four. */}
      {sheet === "tour" && running && (
        <div
          data-globe-tour-sheet
          ref={phoneDialog}
          tabIndex={-1}
          role="dialog"
          aria-label="Guided tour"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl glass-panel p-4 font-mono text-xs text-zinc-300 sm:hidden"
        >
          {cardBody("min-h-11 min-w-11")}
        </div>
      )}
    </>
  );
}
