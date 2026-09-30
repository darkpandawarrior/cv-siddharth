import type { HistorySnapshot } from "./eventStripHistory.ts";

export interface EventBin { start: number; end: number; records: number[]; covered: boolean }
/** Half-open bins over the actual slider window. A gap may contain known
 * records; only complete eligible source coverage can establish zero. */
export function eventBins(snapshot: HistorySnapshot, start: number, end: number, minMag: number, count = 7): EventBin[] {
  if (![start, end, minMag].every(Number.isFinite) || end <= start || !Number.isInteger(count) || count < 1 || count > 64) throw new RangeError("Invalid event strip window");
  const bins = Array.from({ length: count }, (_, i) => {
    const a = start + (end - start) * i / count;
    const b = start + (end - start) * (i + 1) / count;
    const spans = snapshot.sources.filter((source) => source.minMag <= minMag).sort((x, y) => x.start - y.start);
    let through = a;
    for (const source of spans) if (source.start <= through) through = Math.max(through, source.end);
    return { start: a, end: b, records: [] as number[], covered: through >= b };
  });
  const history = snapshot.history;
  if (history) for (let i = 0; i < history.times.length; i++) {
    const time = history.times[i];
    if (time >= start && time < end && history.mag[i] >= minMag) bins[Math.min(count - 1, Math.floor((time - start) / (end - start) * count))].records.push(i);
  }
  return bins;
}
