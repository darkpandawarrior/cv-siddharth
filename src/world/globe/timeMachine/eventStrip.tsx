import { useEffect, useMemo, useState } from "react";
import { useGlobe } from "../globeStore.ts";
import { loadReplaySnapshot, type HistorySnapshot } from "./eventStripHistory.ts";
import { eventBins } from "./eventStripModel.ts";
import { MIN_OFFSET_MIN, MAX_OFFSET_MIN } from "./rangeModel.ts";

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export default function EventStrip({ onSelect }: { onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HistorySnapshot | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [minimum, setMinimum] = useState(4.5);
  const filter = useGlobe((s) => s.filters.quakeMinMag);
  const minMag = Math.max(minimum, filter ?? minimum);
  useEffect(() => {
    let alive = true;
    loadReplaySnapshot().then((value) => { if (alive) setSnapshot(value); });
    return () => { alive = false; };
  }, []);
  const bins = useMemo(() => snapshot ? eventBins(snapshot, snapshot.fetchedAt + MIN_OFFSET_MIN * 60_000, snapshot.fetchedAt + MAX_OFFSET_MIN * 60_000, minMag) : [], [snapshot, minMag]);
  const total = bins.reduce((sum, bin) => sum + bin.records.length, 0);
  const maximum = Math.max(1, ...bins.map((bin) => bin.records.length));
  const history = snapshot?.history;
  const bin = selected === null ? null : bins[selected];
  const handleChoose = (index: number, wallNow: number) => {
    onSelect();
    setSelected(index);
    useGlobe.getState().setTimeOffset((bins[index].start - wallNow) / 60_000);
  };
  return <details data-event-strip onToggle={(event) => setOpen(event.currentTarget.open)} className="w-full min-w-0 basis-full rounded-xl border border-line bg-zinc-950 p-2 text-xs text-zinc-300" aria-label="USGS replay event density">
    <summary className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg ${focus}`}>
      <span className="text-sm font-semibold text-zinc-100">USGS quake history</span><span>{snapshot ? history ? "Explore bins ▾" : "Unavailable" : "Loading…"}</span>
    </summary>
    {open && <>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-zinc-100"><span className="font-normal text-zinc-300">{snapshot ? history ? `${total} loaded record${total === 1 ? "" : "s"}` : "unavailable" : "loading"}</span></h3>
      <label className="flex items-center gap-1">Min M
        <select aria-label="Minimum earthquake magnitude" value={minimum} onChange={(e) => { setMinimum(Number(e.target.value)); setSelected(null); }} className={`h-11 rounded-lg border border-line bg-zinc-900 px-2 ${focus}`}>
          <option value={4.5}>4.5+</option><option value={2.5}>2.5+</option>
        </select>
      </label>
    </div>
    <p className="text-zinc-300">Computed bins · M{minMag}+ · USGS public domain</p>
    {snapshot && <p className="text-zinc-400">{history ? "Snapshot fetched" : "Request completed"} {stamp(snapshot.fetchedAt)} UTC</p>}
    {!snapshot ? <p role="status" className="py-3">Loading historical records, not zero events.</p> : !history ? <p role="status" className="py-3 text-amber-200">USGS history unavailable. Counts are unknown.</p> : <>
      <p className="mt-1 text-zinc-400">Source range: {snapshot.sources.length ? snapshot.sources.map((s) => `M${s.minMag}+ ${day(s.start)} to ${day(s.end)} UTC`).join("; ") : "unknown"}</p>
      <div className="mt-2 flex gap-1 overflow-x-auto" aria-label="Replay bins">
        {bins.map((item, index) => <button key={item.start} type="button" data-event-bin={index} aria-pressed={selected === index}
          aria-label={`${day(item.start)} to ${day(item.end)} UTC, ${item.records.length} loaded quakes, ${item.covered ? "covered" : "gap, incomplete coverage"}`}
          onClick={() => handleChoose(index, Date.now())} onKeyDown={(event) => {
            const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!delta) return;
            event.preventDefault(); event.stopPropagation();
            const buttons = event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>("button");
            buttons[Math.max(0, Math.min(bins.length - 1, index + delta))].focus();
          }} className={`relative flex h-12 min-w-11 flex-1 flex-col items-center justify-end overflow-hidden rounded-lg border pb-1 ${focus} ${selected === index ? "border-accent bg-accent/20 text-accent" : "border-line hover:border-accent"}`}>
          <span aria-hidden className={`absolute inset-x-1 bottom-5 rounded-sm ${item.covered ? "bg-amber-300/30" : "bg-zinc-500/30"}`} style={{ height: `${Math.max(2, item.records.length / maximum * 20)}px`, backgroundImage: item.covered ? undefined : "repeating-linear-gradient(135deg, transparent 0 3px, #a1a1aa 3px 4px)" }} />
          <span className="relative font-semibold">{item.covered ? item.records.length : "?"}</span><span className="relative">{day(item.start).split(" ")[0]}</span>
        </button>)}
      </div>
      <p className="mt-1 text-zinc-400">{day(bins[0].start)} to {day(bins[bins.length - 1].end)} UTC · striped ? = gap</p>
      <p className="sr-only">Arrow keys move focus between bins. Enter selects.</p>
      {bin && <div data-event-records className="mt-2 border-t border-line pt-2" aria-live="polite">
        <p className="font-semibold text-zinc-100">{day(bin.start)} to {day(bin.end)} UTC · {bin.records.length} loaded {bin.records.length === 1 ? "match" : "matches"}</p>
        {!bin.covered && <p className="text-amber-200">Incomplete source coverage. Known records only.</p>}
        {!bin.records.length && <p className="py-2">{bin.covered ? "No matching records in this covered bin." : "No loaded matches; this is not a zero-event count."}</p>}
        <ul className="max-h-16 overflow-y-auto">
          {bin.records.map((i) => <li key={history.id[i]} className="flex items-center justify-between gap-2 border-b border-line py-2">
            <div className="min-w-0"><p className="break-words text-zinc-100">M{history.mag[i].toFixed(1)} · {history.place[i]}</p><p className="text-zinc-400">USGS · {stamp(history.times[i])} UTC</p></div>
            <button type="button" className={`h-11 shrink-0 rounded-lg border border-line px-2 hover:text-accent ${focus}`} onClick={() => {
              const store = useGlobe.getState();
              store.setTimeOffset((history.times[i] - Date.now()) / 60_000);
              store.flyTo({ kind: "latlon", lat: history.lat[i], lon: history.lon[i] });
              store.setSheet(null);
            }}>Fly to</button>
          </li>)}
        </ul>
      </div>}
    </>}
    </>}
  </details>;
}
