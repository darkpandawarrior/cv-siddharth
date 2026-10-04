import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { EvidenceChip } from "../../../EvidenceChip.tsx";
import { buildShareUrl, KNOWN_LANDMARK_IDS, PATH_SHARE_PARAM } from "../../../lib/pathShare.ts";
import { ledger } from "../ledger.ts";
import { shareReplay } from "../shareReplay.ts";
import { setTourStop, tourStops, tourTransition, type TourAction, type TourState } from "../tour.ts";

export const layer = { id: "guided-tour", order: 65 };
const guidedStops = tourStops(ledger);
const idle: TourState = { index: null, playing: false };
const subscribeHydration = () => () => {};

export default function GuidedTour() {
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  return hydrated ? <TourControls /> : null;
}

function TourControls() {
  const reducedMotion = useReducedMotion();
  const [control, setControl] = useState(() => {
    const shared = shareReplay(new URLSearchParams(window.location.search).get(PATH_SHARE_PARAM), ledger);
    return shared.length > 0
      ? { stops: shared, state: tourTransition(idle, "start", shared.length, reducedMotion) }
      : { stops: guidedStops, state: idle };
  });
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const { stops, state } = control;
  const stop = state.index === null ? null : stops[state.index];
  const running = state.playing && !reducedMotion;

  if (reducedMotion && state.playing) {
    setControl({ ...control, state: { ...state, playing: false } });
  }

  const apply = useCallback((action: TourAction) => {
    setControl((current) => ({ ...current, state: tourTransition(current.state, action, current.stops.length, reducedMotion) }));
  }, [reducedMotion]);

  useEffect(() => {
    setTourStop(stop ?? null);
    if (stop) panel.current?.focus();
    return () => setTourStop(null);
  }, [stop]);

  useEffect(() => {
    if (!running || !stop) return;
    const timer = window.setTimeout(() => apply("tick"), (stop.dwellS + stop.transitionS) * 1000);
    return () => window.clearTimeout(timer);
  }, [running, stop, apply]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(window.location.href, stops.map(({ id }) => id).filter((id) => KNOWN_LANDMARK_IDS.has(id))));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Guided tour"
      data-tour-stop={stop?.id ?? ""}
      data-tour-playing={running}
      data-tour-index={state.index ?? ""}
      className="pointer-events-auto absolute bottom-36 left-3 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-line bg-card/95 p-3 text-sm backdrop-blur sm:bottom-16"
      onKeyDown={(event) => {
        if (!stop || !["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
        if (event.key === "Enter" && (event.target as HTMLElement).closest("button,a,input,select,textarea")) return;
        event.preventDefault();
        event.stopPropagation();
        apply(event.key === "ArrowLeft" ? "previous" : "next");
      }}
    >
      {stop ? <>
        <p aria-live="polite" aria-atomic="true" className="mb-2 text-accent">
          {stop.label}
          <EvidenceChip file={stop.sourceFile} source={stop.kind === "grammar" ? stop.id : stop.sourceFile === "systemGraph.ts" ? "system graph" : "landmark-facet"} stamp={ledger.generatedAt} cadence="weekly" />
        </p>
        <p className="mb-2 text-xs text-zinc-400">{reducedMotion ? "Use ArrowLeft and ArrowRight to step through cuts." : "Enter to continue. ArrowLeft returns to the previous stop."}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={state.index === 0} onClick={() => apply("previous")}>Previous stop</button>
          <button type="button" disabled={state.index === stops.length - 1} onClick={() => apply("next")}>Next stop</button>
          <button type="button" disabled={reducedMotion || state.index === stops.length - 1} onClick={() => apply("toggle")}>{running ? "Pause tour" : "Play tour"}</button>
          <button type="button" onClick={() => apply("stop")}>Exit tour</button>
          <button type="button" onClick={copy}>{copied ? "Path link copied" : "Copy landmark path"}</button>
        </div>
        {stops.some(({ kind }) => kind === "grammar") && <p className="mt-2 text-xs text-zinc-400">Fleet and PR stones are included in Guided only.</p>}
      </> : <button type="button" onClick={() => {
        setCopied(false);
        setControl({ stops: guidedStops, state: tourTransition(idle, "start", guidedStops.length, reducedMotion) });
      }}>Guided</button>}
    </section>
  );
}
