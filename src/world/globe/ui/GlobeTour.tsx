import { useEffect, useMemo } from "react";
import { EvidenceChip } from "../../../EvidenceChip.tsx";
import { PUNE } from "../../../lib/sky.ts";
import { experience } from "../../../data/profile/experience.ts";
import { fleetStats, storeApps } from "../../../data/store.ts";
import { openSource, upstreamMergedPRs } from "../../../data/profile/openSource.ts";
import { liveDotsLabel } from "../globeRows.ts";
import { usePresenceGeo } from "../presenceGeo.ts";
import { useGlobe } from "../globeStore.ts";

/** LANE L5 (navigation and UI) owns this file. */

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

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
        <p className="mb-2">{fleetStats.installFloor.toLocaleString("en-US")} installs, as a floor across the fleet:</p>
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

export default function GlobeTour(_props: { tier: 1 | 2 | 3 }) {
  const tourStep = useGlobe((s) => s.tourStep);
  const setTourStep = useGlobe((s) => s.setTourStep);
  const flyTo = useGlobe((s) => s.flyTo);
  const setView = useGlobe((s) => s.setView);
  const select = useGlobe((s) => s.select);
  const presence = usePresenceGeo();

  const running = tourStep !== null;
  const step = running ? Math.max(0, Math.min(STOPS.length - 1, tourStep!)) : 0;

  useEffect(() => {
    if (tourStep === null) return;
    // The tour owns the camera and this same on-screen band; a stale
    // Inspector card from before the tour started has nowhere non-
    // overlapping left to sit (measured via screenshot QA at 1024x768 and
    // 390x844 -- Inspector.tsx's own card collided with this one no matter
    // which of the two was pushed lower). Closing it here is simpler and
    // more honest than chasing pixel offsets between two independent cards.
    select(null);
    STOPS[step].enter({ flyTo, setView });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flyTo/setView/select are stable store actions
  }, [tourStep]);

  useEffect(() => {
    if (!running) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") setTourStep(null);
      else if (e.key === "ArrowRight") setTourStep(Math.min(STOPS.length - 1, step + 1));
      else if (e.key === "ArrowLeft") setTourStep(Math.max(0, step - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [running, step, setTourStep]);

  const stopBody = useMemo(() => STOPS[step].body({ presence }), [step, presence]);

  if (!running) {
    return (
      <button
        type="button"
        onClick={() => setTourStep(0)}
        // Top-anchored, under the HUD row and the time scrubber (both live
        // above y=44 at every required breakpoint) rather than bottom-
        // anchored off GlobePanel: a bottom anchor plus this card's own
        // variable height (up to 4 employer lines) is what collided with
        // the scrubber (measured via screenshot QA at 1440x900).
        className="pointer-events-auto absolute left-1/2 top-44 z-20 -translate-x-1/2 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Take the tour
      </button>
    );
  }

  return (
    <div
      data-globe-tour
      role="dialog"
      aria-label="Guided tour"
      className="pointer-events-auto absolute left-1/2 top-44 z-30 max-h-[min(48vh,360px)] w-[min(90vw,340px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-line bg-ink/85 p-3 font-mono text-xs text-zinc-300 backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">{STOPS[step].title}</h2>
        <button
          type="button"
          onClick={() => setTourStep(null)}
          className="rounded-full border border-line px-2 py-0.5 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Exit
        </button>
      </div>

      <div className="mb-3 text-xs leading-relaxed">{stopBody}</div>

      <div className="mb-2 flex items-center justify-center gap-1.5" aria-hidden>
        {STOPS.map((s, i) => (
          <span
            key={s.title}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: i === step ? "var(--color-signal)" : "#3f3f46" }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setTourStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="rounded-full border border-line px-2 py-1 text-xs disabled:opacity-30 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Back
        </button>
        <span className="text-xs text-muted">
          {step + 1} / {STOPS.length}
        </span>
        <button
          type="button"
          onClick={() => (step === STOPS.length - 1 ? setTourStep(null) : setTourStep(step + 1))}
          className="rounded-full border border-line px-2 py-1 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {step === STOPS.length - 1 ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
