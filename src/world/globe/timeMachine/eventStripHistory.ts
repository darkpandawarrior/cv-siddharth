import { parseUsgsHistory, type UsgsHistory } from "./usgsHistory.ts";

export interface HistorySource { start: number; end: number; minMag: number }
export interface HistorySnapshot { history: UsgsHistory | null; sources: HistorySource[]; fetchedAt: number }
const DAY = 86_400_000;
const FEEDS = [{ name: "4.5_month", days: 30, minMag: 4.5 }, { name: "2.5_week", days: 7, minMag: 2.5 }];
let pending: Promise<HistorySnapshot> | undefined;

/** Shared with the replay renderer: one request per feed, immutable snapshot.
 * USGS-produced earthquake data are public domain; visualization computed here. */
export function loadReplaySnapshot(): Promise<HistorySnapshot> {
  return pending ??= Promise.all(FEEDS.map(async (feed) => {
    try {
      const response = await fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed.name}.geojson`);
      if (!response.ok) return null;
      const json = await response.json();
      if (!parseUsgsHistory(json)) return null;
      const generated = json?.metadata?.generated;
      // Missing source time means unknown coverage, never a zero-event window.
      const source = typeof generated === "number" && Number.isFinite(generated)
        ? { start: generated - feed.days * DAY, end: generated, minMag: feed.minMag } : null;
      return { json, source };
    } catch { return null; }
  })).then((results) => {
    const valid = results.filter((result) => result !== null);
    return { history: valid.length ? parseUsgsHistory(...valid.map((result) => result.json)) : null,
      sources: valid.flatMap((result) => result.source ? [result.source] : []), fetchedAt: Date.now() };
  });
}
