import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { EvidenceChip } from "../../../EvidenceChip.tsx";
import { ledger } from "../ledger.ts";
import { GRAMMAR } from "../grammar.ts";
import { getReplay, getServerReplay, subscribeReplay, setReplay, replayMonths, replayInterval, stepReplay, timelapse, REPLAY_SPEEDS, type ReplaySpeed } from "../timelapse.ts";

export const layer = { id: "replay", order: 60 };
const sources = new Map(GRAMMAR.map((rule) => [rule.id, rule.ledgerRow(rule.source(ledger), ledger).sourceFile]));

export default function Replay() {
  const asOf = useSyncExternalStore(subscribeReplay, getReplay, getServerReplay);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [months] = useState(() => replayMonths(new Date()));
  const end = months.at(-1)!;
  const features = useMemo(() => asOf === null ? [] : timelapse(ledger, asOf), [asOf]);

  useEffect(() => () => setReplay(null), []);
  useEffect(() => {
    if (!playing || reducedMotion || asOf === null) return;
    const timer = window.setInterval(() => {
      const current = getReplay();
      if (current === null || current === end) { setPlaying(false); return; }
      setReplay(stepReplay(current, 1, end));
    }, replayInterval(speed));
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, asOf, end, speed]);

  function backToNow() { setPlaying(false); setReplay(null); }
  return (
    <section
      aria-label="Replay ledger"
      data-replay-month={asOf ?? ""}
      data-replay-playing={playing && !reducedMotion && asOf !== null}
      className="pointer-events-auto absolute left-3 top-14 z-10 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-line bg-card/95 p-3 text-sm backdrop-blur"
      onKeyDown={(event) => {
        if (asOf === null || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        if ((event.target as HTMLElement).tagName === "SELECT") return;
        event.preventDefault();
        event.stopPropagation();
        setPlaying(false);
        setReplay(stepReplay(asOf, event.key === "ArrowLeft" ? -1 : 1, end));
      }}
    >
      {asOf === null ? (
        <button type="button" onClick={() => { setReplay(months[0]); setPlaying(!reducedMotion); }}>Replay from 2017</button>
      ) : (
        <>
          <h2 className="mb-2 text-accent">REPLAY {asOf}, not live</h2>
          <label className="block">Replay month
            <input className="w-full" type="range" min={0} max={months.length - 1} value={months.indexOf(asOf)} aria-label="Replay month" aria-valuetext={asOf}
              onChange={(event) => { setPlaying(false); setReplay(months[Number(event.target.value)]); }} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={reducedMotion} onClick={() => { if (asOf === end) setReplay(months[0]); setPlaying(!playing); }}>{playing && !reducedMotion ? "Pause replay" : "Play replay"}</button>
            <label>Speed <select aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value) as ReplaySpeed)}>
              {REPLAY_SPEEDS.map((value) => <option key={value} value={value}>{value}x</option>)}
            </select></label>
            <button type="button" onClick={backToNow}>Back to now</button>
          </div>
          {reducedMotion && <p className="mt-2 text-zinc-400">Use ArrowLeft and ArrowRight to step one month.</p>}
          <details className="mt-2">
            <summary>Records at this month</summary>
            <ul className="max-h-40 overflow-auto">
              {features.map((feature) => <li key={feature.id} data-replay-feature={feature.id} data-cadence={feature.cadence} className="mt-2">
                {feature.label}
                {feature.cadence === "undated" ? <EvidenceChip file={sources.get(feature.rule) ?? feature.rule} source={feature.rule} cadence="undated" /> : <span className="ml-2 text-zinc-400">{feature.date}</span>}
              </li>)}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
