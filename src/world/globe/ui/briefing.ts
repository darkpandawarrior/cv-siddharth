import type { LiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";
import type { FeedItem } from "../feed.ts";
import type { Selection } from "../globeStore.ts";
import { formatQuakeTime } from "../layers/quakeTimeFormat.ts";
import { formatTimeAgo } from "../layers/quake.ts";
import { parseQuakes } from "../layers/quake.ts";
import { parseEonetEvents } from "../layers/eonet.ts";
import { parseVolcanoResponse } from "../layers/volcano.ts";
import { parseLaunches, formatCountdown, getCachedLaunches } from "../layers/launches.ts";
import { parseLatestKp } from "../layers/aurora.ts";
import { feedItemSelection } from "./feedItemSelection.ts";
export const briefingNumber = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export type BriefingKind = "measured" | "reported" | "computed" | "scheduled";
export interface BriefingCard { item: FeedItem; kind: BriefingKind; selection: Selection }
export interface Unavailable { source: string; reason: string; satellites?: boolean }
export interface BriefingInput {
  nowMs: number; quakes: LiveSignalSnapshot<unknown>; eonet: LiveSignalSnapshot<unknown>;
  gvp: LiveSignalSnapshot<unknown>; kp: LiveSignalSnapshot<unknown>;
  iss: Selection | null; satelliteReason: string; launches: LiveSignalSnapshot<unknown>;
}
const DAY = 86_400_000;
const clean = (text: string) => text.replaceAll("—", ",");
const located = (lat: number, lon: number) => Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
const inWindow = (at: number, now: number, age: number) => Number.isFinite(at) && at <= now && now - at <= age;
/** Read HazardLayer's fresh session cache; opening this surface never fetches. */
export function briefingLaunchSnapshot(nowMs: number, storage: Pick<Storage, "getItem" | "setItem"> | undefined, failed = false): LiveSignalSnapshot<unknown> {
  return { data: storage && !failed ? getCachedLaunches(storage, nowMs) : null, error: failed, nextPollAt: null };
}
function missing(s: LiveSignalSnapshot<unknown>, rows: boolean, window: string): string {
  if (s.error) return "Latest request failed";
  if (s.data === null) return "Waiting for the shared feed";
  return rows ? `Stale or outside ${window}` : "No usable observations in the loaded feed";
}
/** Fixed editorial order; units cannot honestly share a severity ranking. */
export function buildBriefing(input: BriefingInput): { cards: BriefingCard[]; unavailable: Unavailable[] } {
  const { nowMs } = input;
  const cards: BriefingCard[] = [], unavailable: Unavailable[] = [];
  const add = (item: FeedItem, kind: BriefingKind, selection = feedItemSelection(item, nowMs)) => {
    cards.push({ item: { ...item, title: clean(item.title), detail: clean(item.detail), source: clean(item.source) }, kind, selection: { ...selection, title: clean(selection.title), source: clean(selection.source), rows: selection.rows.map(row => ({ ...row, value: clean(row.value) })) } });
  };
  const quakes = input.quakes.error ? [] : parseQuakes(input.quakes.data) ?? [];
  const q = quakes.filter(q => inWindow(q.timeMs, nowMs, DAY) && located(q.lat, q.lon) && Number.isFinite(q.mag) && Number.isFinite(q.depthKm)).sort((a, b) => b.mag - a.mag || b.timeMs - a.timeMs)[0];
  if (q) add({ id: `quake:${q.id}`, kind: "quake", title: `M${briefingNumber(q.mag)} ${q.place}`, detail: `${briefingNumber(q.depthKm)} km depth · strongest loaded quake in 24 h`, whenMs: q.timeMs, source: "USGS", live: false, focus: { kind: "latlon", lat: q.lat, lon: q.lon }, severity: "warn" }, "measured", {
    id: `quake-${q.id}`, kind: "quake", title: `M ${briefingNumber(q.mag)}, ${q.place}`, source: "USGS, observed earthquake", live: false, focus: { kind: "latlon", lat: q.lat, lon: q.lon },
    rows: [{ label: "Magnitude", value: briefingNumber(q.mag) }, { label: "Place", value: q.place }, { label: "Depth", value: `${briefingNumber(q.depthKm)} km` }, { label: "Time", value: formatQuakeTime(nowMs, q.timeMs) }],
  });
  else unavailable.push({ source: "USGS", reason: missing(input.quakes, quakes.length > 0, "24 h") });
  const events = input.eonet.error ? [] : parseEonetEvents(input.eonet.data) ?? [];
  const volcanoes = input.gvp.error ? [] : parseVolcanoResponse(input.gvp.data) ?? [];
  const reports: FeedItem[] = [
    ...events.filter(e => inWindow(e.dateMs, nowMs, 30 * DAY) && located(e.lat, e.lon)).map(e => ({ id: `eonet:${e.id}`, kind: (e.category === "wildfires" ? "wildfire" : e.category === "volcanoes" ? "volcano" : "storm") as FeedItem["kind"], title: e.title, detail: e.category, whenMs: e.dateMs, source: `NASA EONET (${e.sourceId})`, live: false, focus: { kind: "latlon" as const, lat: e.lat, lon: e.lon }, severity: "warn" as const })),
    ...volcanoes.filter(v => inWindow(v.at, nowMs, 14 * DAY)).map(v => ({ id: `gvp:${v.id}:${v.week}`, kind: "volcano" as const, title: `${v.name} (${v.country})`, detail: `${v.week}: ${v.summary}`, whenMs: v.at, source: "Smithsonian GVP / USGS weekly report", live: false, ...(v.lat !== null && v.lon !== null && located(v.lat, v.lon) ? { focus: { kind: "latlon" as const, lat: v.lat, lon: v.lon } } : {}), severity: "warn" as const })),
  ];
  const newest = reports.sort((a, b) => b.whenMs - a.whenMs)[0];
  if (newest) {
    const event = events.find(e => `eonet:${e.id}` === newest.id);
    const volcano = volcanoes.find(v => `gvp:${v.id}:${v.week}` === newest.id);
    const selection: Selection = event ? {
      id: `eonet-${event.id}`, kind: "eonet", title: event.title, source: `NASA EONET (${event.sourceId})`, live: false, focus: newest.focus,
      rows: [{ label: "Category", value: event.category === "wildfires" ? "Wildfire" : event.category === "volcanoes" ? "Volcano" : "Severe Storm" }, { label: "Date", value: formatTimeAgo(nowMs, event.dateMs) }, ...(event.track && event.track.length > 1 ? [{ label: "Track points", value: briefingNumber(event.track.filter(p => p.dateMs <= nowMs).length) }] : []), { label: "Source", value: event.sourceUrl }],
    } : volcano ? {
      id: `gvp:${volcano.id}`, kind: "volcano", title: newest.title, source: newest.source, live: false, focus: newest.focus,
      rows: [{ label: "Report week", value: volcano.week }, { label: "Published", value: new Date(volcano.at).toISOString() }, { label: "Summary", value: volcano.summary }, { label: "Source", value: "https://volcano.si.edu/reports_weekly.cfm" }],
    } : feedItemSelection(newest, nowMs);
    add(newest, "reported", selection);
  }
  if (!reports.some(e => e.id.startsWith("eonet:"))) unavailable.push({ source: "NASA EONET", reason: missing(input.eonet, events.length > 0, "30 d") });
  if (!reports.some(e => e.id.startsWith("gvp:"))) unavailable.push({ source: "Smithsonian GVP / USGS", reason: missing(input.gvp, volcanoes.length > 0, "14 d") });
  const kp = input.kp.error ? null : parseLatestKp(input.kp.data);
  const at = kp ? Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(kp.timeIso) ? kp.timeIso : `${kp.timeIso.replace(" ", "T")}Z`) : NaN;
  if (kp && Number.isFinite(kp.kp) && kp.kp >= 0 && kp.kp <= 9 && inWindow(at, nowMs, 6 * 3_600_000)) add({ id: `kp:${kp.timeIso}`, kind: "aurora", title: `Kp ${briefingNumber(kp.kp)}`, detail: "Latest planetary geomagnetic index · no single fly-to point", whenMs: at, source: "NOAA SWPC", live: false, severity: "info" }, "measured");
  else unavailable.push({ source: "NOAA SWPC", reason: missing(input.kp, kp !== null, "6 h") });
  if (input.iss) add({ id: input.iss.id, kind: "satellite", title: "ISS orbital position", detail: "Computed from CelesTrak TLE using SGP4", whenMs: nowMs, source: input.iss.source, live: false, focus: input.iss.focus, severity: "info" }, "computed", { ...input.iss, live: false });
  else unavailable.push({ source: "CelesTrak ISS", reason: input.satelliteReason, satellites: true });
  const launches = input.launches.error ? [] : Array.isArray(input.launches.data) ? input.launches.data as import("../layers/launches.ts").Launch[] : parseLaunches(input.launches.data, nowMs) ?? [];
  const launch = launches.find(l => l.netMs > nowMs && located(l.lat, l.lon));
  if (launch) add({ id: `launch:${launch.id}`, kind: "launch", title: launch.name, detail: `${launch.provider} · ${launch.padName} · ${formatCountdown(nowMs, launch.netMs)}`, whenMs: launch.netMs, source: "Launch Library 2", live: false, focus: { kind: "latlon", lat: launch.lat, lon: launch.lon }, severity: "info" }, "scheduled", {
    id: `launch-${launch.id}`, kind: "launch", title: launch.name, source: "Launch Library 2, cached 30 min", live: false, focus: { kind: "latlon", lat: launch.lat, lon: launch.lon },
    rows: [{ label: "Provider", value: launch.provider }, { label: "NET", value: new Date(launch.netMs).toISOString() }, { label: "Countdown", value: formatCountdown(nowMs, launch.netMs) }, { label: "Pad", value: `${launch.padName}${launch.locationName ? `, ${launch.locationName}` : ""}` }],
  });
  else unavailable.push({ source: "Launch Library 2", reason: missing(input.launches, launches.length > 0, "the upcoming schedule") });
  return { cards, unavailable };
}
