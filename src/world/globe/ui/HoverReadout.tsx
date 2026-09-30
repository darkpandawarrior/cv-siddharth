import { fetchTide, tideLabel, loadStations, nearestStationWithin, type TideReading, type TideStation } from "../layers/tides.ts";
import { fetchCape, capeLabel, type CapeReading } from "../layers/cape.ts";
import { activeShowers, radiantRiseTime, meteorShowerLine } from "../layers/meteors.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { countryAt, type CountryIndex } from "../countryData.ts";
import { loadCountries } from "../countryLoad.ts";
import { canvasState, surfaceHover, surfacePicker } from "../exploreCanvas.ts";
import { localTime } from "../exploreMath.ts";
import { useExplore } from "../exploreState.ts";
import type { LatLon } from "../geoMath.ts";
import { hoverPoint, simTime, useGlobe } from "../globeStore.ts";
import { getLiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";
import { airQualityLabel, fetchAirQuality, type AirQualityReading } from "../layers/airQuality.ts";
import { fetchFlood, floodLabel, type FloodReading } from "../layers/flood.ts";
import { fetchMarine, marineLabel, type MarineReading } from "../layers/marine.ts";
import { parseQuakes, type Quake } from "../layers/quake.ts";
import { buildWindField, sampleWind, type WindField } from "../layers/windField.ts";
import type { WindResponse } from "../../../../api/_lib/wind-handler.ts";
import PinnedReadoutPanel from "./pinnedReadoutPanel.tsx";
import { modelObservationTime, utc, type PinnedValue } from "./pinnedReadout.ts";
import { allowHoverFetch, type HoverFetchHost, nearestQuakeWithin, windLabel } from "./hoverReadout.ts";

/**
 * WAVE 7 LANE V4 (hover readout, Windy-picker pattern): on desktop pointer
 * hover, a small glass chip follows the cursor showing what's already in
 * memory -- country (the worker's 5deg index, same as CountryLayer.tsx),
 * local time (solar approximation -- there is no reverse-geocoded time zone
 * at hover time, and getting one would cost a network request per hover),
 * wind (layers/windField.ts's sampleWind, read from the SAME shared
 * useLiveSignal store WindLayer.tsx already polls -- getLiveSignalSnapshot
 * is a pure read, never a subscription, so this never starts a second
 * poller) and the nearest quake within 300km (the USGS all-day feed, same
 * shared-store read CountryLayer.tsx's own inspector row already uses).
 *
 * Country data and NOAA station data load once. Model/tide requests are
 * throttled per settled hover cell with short-lived caches; pointer movement
 * never launches a request per frame.
 *
 * Hidden while dragging, over other UI, or off the globe: all three fall
 * out of the architecture rather than needing their own checks --
 * `surfaceHover` reports `null` for a held button or a miss, and a DOM
 * overlay sitting on top of the canvas (LayerPanel, Inspector, ExploreBar)
 * simply intercepts the pointer event before the canvas ever sees it.
 */

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const CHIP_OFFSET = 14;
// LANE S3: widened/heightened from the pre-S3 210x96 guess -- up to three
// more wrapping rows (marine/air-quality/flood) now share the chip.
const CHIP_W_GUESS = 248;
const CHIP_H_GUESS = 360;

declare global {
  interface Window {
    /** e2e seam (the W11 pattern -- CountryLayer.tsx's own
     *  `window.__W11_COUNTRY__`): feeds a lat/lon straight in, bypassing the
     *  screen-to-globe raycast, so content assertions don't depend on the
     *  camera's exact projection. Only installed under `__W11_TEST__`. */
    __V4_HOVER__?: { move: (point: LatLon) => void; leave: () => void };
  }
}

function fieldFromWindResponse(data: WindResponse | null): WindField | null {
  if (!data?.connected || !data.grid) return null;
  return buildWindField(data.grid, data.u, data.v);
}

interface Readout {
  country: string;
  time: string;
  wind: string | null;
  quake: string | null;
  marine: string | null;
  airQuality: string | null;
  flood: string | null;
  tide: string | null;
  cape: string | null;
  meteors: string[];
}
interface Chip { x: number; y: number; readout: Readout }

const _windSample = { u: 0, v: 0 };

// Per-cell caches share one rate gate per remote host.
const HOVER_CELL_DEG = 0.5;
const HOVER_SETTLE_MS = 600;

function hoverCellKey(point: LatLon): string {
  return `${Math.round(point.lat / HOVER_CELL_DEG)}:${Math.round(point.lon / HOVER_CELL_DEG)}`;
}

interface CellEntry<T> { data: T | null; at?: number; observedAt?: string | null; failed?: boolean }

/** Settled cells expire after five minutes, failed cells after 30 seconds.
 * Undefined means waiting for a request or its result, never no data. */
function pollCell<T>(cache: Map<string, CellEntry<T>>, key: string, now: number, gates: Map<HoverFetchHost, number>, host: HoverFetchHost, fetcher: (fetchImpl: typeof fetch) => Promise<T | null>): CellEntry<T> | undefined {
  const existing = cache.get(key);
  if (existing && now - (existing.at ?? now) < (existing.failed ? 30000 : 300000)) return existing;
  if (existing) cache.delete(key);
  if (cache.has(`${key}#pending`) || !allowHoverFetch(gates, host, now)) return undefined;
  cache.set(`${key}#pending`, { data: null });
  let observedAt: string | null = null, requestFailed = false;
  const timedFetch: typeof fetch = async (...args) => {
    const response = await fetch(...args).catch(error => { requestFailed = true; throw error; });
    if (!response.ok) { requestFailed = true; throw new Error(`HTTP ${response.status}`); }
    try { observedAt = modelObservationTime(await response.clone().json()); } catch { /* Missing model period stays explicit. */ }
    return response;
  };
  fetcher(timedFetch)
    .then((data) => cache.set(key, { data, at: Date.now(), observedAt, failed: requestFailed }))
    .catch(() => cache.set(key, { data: null, at: Date.now(), failed: true }))
    .finally(() => cache.delete(`${key}#pending`));
  return undefined;
}

export default function HoverReadout() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const pinCount = useExplore(s => s.pins.length);
  const [chip, setChip] = useState<Chip | null>(null);
  const chipElement = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const indexRef = useRef<CountryIndex | null>(null);
  const windCache = useRef<{ data: WindResponse | null; field: WindField | null }>({ data: null, field: null });
  const quakeCache = useRef<{ raw: unknown; quakes: Quake[] | null }>({ raw: undefined, quakes: null });
  const marineCache = useRef(new Map<string, CellEntry<MarineReading>>());
  const airQualityCache = useRef(new Map<string, CellEntry<AirQualityReading>>());
  const floodCache = useRef(new Map<string, CellEntry<FloodReading>>());
  const stations = useRef<TideStation[] | null>(null);
  const stationsFailed = useRef(false);
  const tideCache = useRef(new Map<string, CellEntry<TideReading>>());
  const capeCache = useRef(new Map<string, CellEntry<CapeReading>>());
  const settled = useRef({ key: "", since: 0 });
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const meteorCache = useRef({ key: "", lines: [] as string[] });
  const hoverFetchGates = useRef(new Map<HoverFetchHost, number>());
  const lastChipRef = useRef<Chip | null>(null);
  // Kept current by the effect just below `tick`'s declaration, so the
  // self-rescheduling rAF chain inside `tick` always calls the CURRENT
  // closure instead of capturing itself by name -- referencing `tick` from
  // inside its own useCallback initializer would read it before it's
  // declared (react-hooks/immutability flags this as a real bug: an early
  // access that never sees later reassignments).
  const tickRef = useRef<() => void>(() => {});
  // Derived from `canvas`, not tracked separately -- `.closest` is the same
  // one-call lookup layers/CountryLayer.tsx's own tooltip already uses.
  const root = canvas?.closest<HTMLElement>("[data-globe-root]") ?? null;

  // Same MutationObserver-on-[data-globe-root] discovery ui/ExploreBar.tsx
  // uses: GlobeScene's canvas mounts on its own lazy/hydrate schedule, after
  // this component's first render.
  useEffect(() => {
    const found = document.querySelector<HTMLElement>("[data-globe-root]");
    if (!found) return;
    const find = () => setCanvas(found.querySelector("canvas"));
    find();
    const observer = new MutationObserver(find);
    observer.observe(found, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const tick = useCallback(() => {
    frameRef.current = null;
    const point = hoverPoint.current;
    const globe = useGlobe.getState();
    if (!point || (useExplore.getState().mode && useExplore.getState().mode !== "pin") || globe.view !== "orbit") { setChip(null); lastChipRef.current = null; return; }

    const countryId = globe.layers.countries && hoverPoint.countryId >= 0
      ? hoverPoint.countryId
      : indexRef.current ? countryAt(indexRef.current, point) : -1;
    const country = countryId >= 0
      ? (indexRef.current?.countries[countryId]?.name ?? "International waters")
      : indexRef.current ? "International waters" : "Loading country data…";

    let wind: string | null = null;
    if (globe.layers.wind) {
      const windSnap = getLiveSignalSnapshot<WindResponse>("/api/wind");
      if (windSnap.data !== windCache.current.data) windCache.current = { data: windSnap.data, field: fieldFromWindResponse(windSnap.data) };
      if (windCache.current.field) {
        const w = sampleWind(windCache.current.field, point.lat, point.lon, _windSample);
        const { speed, compass } = windLabel(w.u, w.v);
        wind = compass === "calm" ? "Calm" : `${speed.toFixed(1)} m/s toward ${compass}`;
      }
    }

    const quakeSnap = getLiveSignalSnapshot<unknown>(QUAKES_URL);
    if (quakeSnap.data !== quakeCache.current.raw) quakeCache.current = { raw: quakeSnap.data, quakes: quakeSnap.error ? null : parseQuakes(quakeSnap.data) };
    const nearest = nearestQuakeWithin(quakeCache.current.quakes, point);
    const quake = nearest ? `M${nearest.quake.mag.toFixed(1)} · ${Math.round(nearest.km)} km away` : null;

    const now = Date.now();
    const cellKey = hoverCellKey(point);
    const marineEntry = pollCell(marineCache.current, cellKey, now, hoverFetchGates.current, "marine", fetchImpl => fetchMarine(point.lat, point.lon, fetchImpl));
    const marine = marineEntry ? (marineEntry.data ? `${marineLabel(marineEntry.data)} · Open-Meteo` : marineEntry.failed ? "Marine feed unreachable · Open-Meteo" : "No marine data here · Open-Meteo") : "Marine: loading… · Open-Meteo";
    const airQualityEntry = pollCell(airQualityCache.current, cellKey, now, hoverFetchGates.current, "airQuality", fetchImpl => fetchAirQuality(point.lat, point.lon, fetchImpl));
    const airQuality = airQualityEntry ? (airQualityEntry.data ? `${airQualityLabel(airQualityEntry.data)} · Open-Meteo` : airQualityEntry.failed ? "Air quality feed unreachable · Open-Meteo" : "No air-quality data here · Open-Meteo") : "Air quality: loading… · Open-Meteo";
    const floodEntry = pollCell(floodCache.current, cellKey, now, hoverFetchGates.current, "flood", fetchImpl => fetchFlood(point.lat, point.lon, fetchImpl));
    const flood = floodEntry ? (floodEntry.data ? `${floodLabel(floodEntry.data)} · Open-Meteo` : floodEntry.failed ? "River feed unreachable · Open-Meteo" : "No river data here · Open-Meteo") : "River discharge: loading… · Open-Meteo";

    let tide: string | null = globe.timeOffsetMin === 0 ? "Tides: loading… · NOAA (US coastal coverage)" : null;
    let cape: string | null = globe.timeOffsetMin === 0 ? "CAPE: loading… · Open-Meteo" : null;
    const simulated = simTime(globe.timeOffsetMin);
    if (globe.timeOffsetMin === 0 && now - settled.current.since >= HOVER_SETTLE_MS) {
      const nearStation = stations.current ? nearestStationWithin(stations.current, point) : null;
      if (stationsFailed.current) tide = "NOAA station index unreachable (US coastal coverage)";
      else if (stations.current && !nearStation) tide = "No NOAA tide station within 50 km (US coastal coverage)";
      else if (nearStation) {
        const entry = pollCell(tideCache.current, nearStation.station.id, now, hoverFetchGates.current, "tide", fetchImpl => fetchTide(nearStation.station.id, new Date(now), fetchImpl));
        tide = entry?.data ? `${nearStation.station.name} (${nearStation.km.toFixed(0)} km): ${tideLabel(entry.data)}` : entry?.failed ? "NOAA tide feed unreachable" : entry ? "No tide data here · NOAA" : "Tides: loading… · NOAA";
      }
      const entry = pollCell(capeCache.current, cellKey, now, hoverFetchGates.current, "cape", fetchImpl => fetchCape(point.lat, point.lon, new Date(now), fetchImpl));
      cape = entry?.failed ? "CAPE feed unreachable · Open-Meteo" : entry ? entry.data ? capeLabel(entry.data) : "No current CAPE model reading · Open-Meteo" : "CAPE: loading… · Open-Meteo";
    }
    // Horizon scans happen once per rounded cell and simulated minute,
    // never in the animation-frame loop itself.
    const meteorKey = `${cellKey}:${Math.floor(simulated.getTime() / 60000)}`;
    if (meteorCache.current.key !== meteorKey) meteorCache.current = { key: meteorKey, lines: activeShowers(simulated).map((shower) => meteorShowerLine(shower, radiantRiseTime(shower.raHours, shower.decDeg, point.lat, point.lon, simulated), point.lon)) };
    const readout: Readout = { country, time: localTime(simulated, point.lon), wind, quake, marine, airQuality, flood, tide, cape, meteors: meteorCache.current.lines };
    const box = root?.getBoundingClientRect();
    const x = Math.max(8, Math.min(point.clientX - (box?.left ?? 0) + CHIP_OFFSET, (box?.width ?? 1440) - CHIP_W_GUESS - 8));
    const y = Math.max(8, Math.min(point.clientY - (box?.top ?? 0) + CHIP_OFFSET, (box?.height ?? 900) - (chipElement.current?.offsetHeight ?? CHIP_H_GUESS) - 8));
    const last = lastChipRef.current;
    if (!last || last.x !== x || last.y !== y || last.readout.country !== readout.country
      || last.readout.time !== readout.time || last.readout.wind !== readout.wind || last.readout.quake !== readout.quake
      || last.readout.marine !== readout.marine || last.readout.airQuality !== readout.airQuality || last.readout.flood !== readout.flood || last.readout.tide !== readout.tide || last.readout.cape !== readout.cape || last.readout.meteors !== readout.meteors) {
      const next = { x, y, readout };
      lastChipRef.current = next;
      setChip(next);
    }
    // Keep ticking every frame while genuinely hovering (never faster --
    // frameRef's null-check above still caps this at one rAF in flight):
    // wind/quake come from WindLayer/HazardLayer's own poll, fetched
    // independently of this component, so a one-shot tick on pointer move
    // alone can freeze on a stale "no data yet" readout if that fetch
    // resolves after the point was set and the pointer stopped moving.
    frameRef.current = requestAnimationFrame(() => tickRef.current());
  }, [root]);
  useEffect(() => { tickRef.current = tick; }, [tick]);
  useEffect(() => {
    let active = true, retry: ReturnType<typeof setTimeout> | undefined;
    const run = () => { void loadStations().then((rows) => {
      if (!active) return; stations.current = rows; stationsFailed.current = false;
    }).catch(() => { if (active) { stationsFailed.current = true; retry = setTimeout(run, 30000); } }); };
    run();
    return () => { active = false; clearTimeout(retry); };
  }, []);

  const scheduleFrame = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => tickRef.current());
  }, []);

  // Loaded once regardless of hovering (the module-level singleton promise
  // in countryLoad.ts means this never duplicates layers/CountryLayer.tsx's
  // own fetch when that boundaries layer is also on) -- and re-schedules a
  // frame when it lands, so a chip already showing "Loading..." refreshes
  // with the real name even if the pointer hasn't moved since.
  useEffect(() => {
    let active = true;
    loadCountries().then((value) => { if (active) { indexRef.current = value; scheduleFrame(); } }).catch(() => {});
    return () => { active = false; };
  }, [scheduleFrame]);

  useEffect(() => {
    if (!canvas) return;
    const pick = surfacePicker(canvas, () => canvasState(canvas));
    const onMove = (point: (LatLon & { clientX: number; clientY: number }) | null) => {
      hoverPoint.current = point;
      const key = point ? hoverCellKey(point) : "";
      if (settled.current.key !== key) {
        settled.current = { key, since: Date.now() };
        clearTimeout(settleTimer.current);
        // Settling follows input, independently of paint. Leaving cancels;
        // returning to the same cell re-arms even on a stalled compositor.
        if (point) settleTimer.current = setTimeout(() => {
          settleTimer.current = undefined;
          if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
          tickRef.current();
        }, HOVER_SETTLE_MS);
      }
      scheduleFrame();
    };
    const detach = surfaceHover(canvas, pick, onMove);
    if (window.__W11_TEST__) window.__V4_HOVER__ = { move: (point) => onMove({ ...point, clientX: 0, clientY: 0 }), leave: () => onMove(null) };
    return () => {
      detach();
      clearTimeout(settleTimer.current);
      hoverPoint.current = null;
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      delete window.__V4_HOVER__;
    };
  }, [canvas, scheduleFrame]);

  // Read only the hover's settled caches. Pinning never schedules a request.
  const extras = (point: LatLon): PinnedValue[] => {
    const key = hoverCellKey(point);
    const cached = <T,>(label: string, cache: Map<string, CellEntry<T>>, format: (data: T) => string, source: string): PinnedValue => {
      const entry = cache.get(key);
      const fresh = entry?.at && Date.now() - entry.at < 300000;
      return { label, value: fresh && entry.data ? format(entry.data) : "Unavailable: No cached reading", source: `${source}, sampled model snapshot`, time: entry?.observedAt ? `Model time: ${entry.observedAt}` : "Observation time unavailable" };
    };
    const station = stations.current ? nearestStationWithin(stations.current, point) : null;
    const tide = station ? tideCache.current.get(station.station.id) : null;
    const cape = capeCache.current.get(key);
    return [
      { label: "Country", value: indexRef.current ? indexRef.current.countries[countryAt(indexRef.current, point)]?.name ?? "International waters" : "Unavailable: country index not loaded", source: "Natural Earth, coarse boundary index snapshot", time: "Dataset date unavailable" },
      cached("Marine", marineCache.current, marineLabel, "Open-Meteo (CC BY 4.0)"),
      cached("Air quality", airQualityCache.current, airQualityLabel, "Open-Meteo CAMS (CC BY 4.0)"),
      cached("River discharge", floodCache.current, floodLabel, "Open-Meteo GloFAS (CC BY 4.0)"),
      { label: "Tides", value: tide?.data ? `${station?.station.name}: ${tideLabel(tide.data)}` : "Unavailable: No cached reading (US coastal coverage)", source: "NOAA CO-OPS, station measurement / predicted tide snapshot", time: tide?.data?.water ? `Observed ${tide.data.water.time} UTC` : "Observation time unavailable" },
      { label: "CAPE", value: cape?.data ? capeLabel(cape.data) : "Unavailable: No cached reading", source: "Open-Meteo (CC BY 4.0), model snapshot", time: cape?.data ? `Model time: ${utc(cape.data.at)}` : "Observation time unavailable" },
    ];
  };
  return <>
    <PinnedReadoutPanel canvas={canvas} extras={extras} />
    {root && chip && !pinCount && createPortal(
    <div
      ref={chipElement}
      data-hover-readout
      aria-hidden
      style={{ left: chip.x, top: chip.y }}
      className="pointer-events-none absolute z-20 w-64 rounded-lg glass-panel px-2 py-1.5 font-mono text-xs leading-snug text-zinc-100"
    >
      <div data-hover-country>{chip.readout.country}</div>
      <div data-hover-time>{chip.readout.time}</div>
      {chip.readout.wind && <div data-hover-wind>{chip.readout.wind}</div>}
      {chip.readout.quake && <div data-hover-quake>{chip.readout.quake}</div>}
      {chip.readout.marine && <div data-hover-marine>{chip.readout.marine}</div>}
      {chip.readout.airQuality && <div data-hover-air-quality>{chip.readout.airQuality}</div>}
      {chip.readout.flood && <div data-hover-flood>{chip.readout.flood}</div>}
      {chip.readout.tide && <div data-hover-tide>{chip.readout.tide}</div>}
      {chip.readout.cape && <div data-hover-cape>{chip.readout.cape}</div>}
      {chip.readout.meteors.map((line) => <div data-hover-meteor key={line}>{line}</div>)}
    </div>,
    root,
  )}
  </>;
}
