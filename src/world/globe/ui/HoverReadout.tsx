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
import { parseQuakes, type Quake } from "../layers/quake.ts";
import { buildWindField, sampleWind, type WindField } from "../layers/windField.ts";
import type { WindResponse } from "../../../../api/_lib/wind-handler.ts";
import { nearestQuakeWithin, windLabel } from "./hoverReadout.ts";

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
 * Zero network requests per hover: the ONE real fetch here is the Natural
 * Earth country boundary index, loaded once via loadCountries()'s
 * module-level singleton promise (shared with CountryLayer.tsx even when
 * that layer is off) the first time the pointer lands on the globe, never
 * per pointer move afterward.
 *
 * Hidden while dragging, over other UI, or off the globe: all three fall
 * out of the architecture rather than needing their own checks --
 * `surfaceHover` reports `null` for a held button or a miss, and a DOM
 * overlay sitting on top of the canvas (LayerPanel, Inspector, ExploreBar)
 * simply intercepts the pointer event before the canvas ever sees it.
 */

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const CHIP_OFFSET = 14;
const CHIP_W_GUESS = 210;
const CHIP_H_GUESS = 96;

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

interface Readout { country: string; time: string; wind: string | null; quake: string | null }
interface Chip { x: number; y: number; readout: Readout }

const _windSample = { u: 0, v: 0 };

export default function HoverReadout() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [chip, setChip] = useState<Chip | null>(null);
  const frameRef = useRef<number | null>(null);
  const indexRef = useRef<CountryIndex | null>(null);
  const windCache = useRef<{ data: WindResponse | null; field: WindField | null }>({ data: null, field: null });
  const quakeCache = useRef<{ raw: unknown; quakes: Quake[] | null }>({ raw: undefined, quakes: null });
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
    if (!point || useExplore.getState().mode || globe.view !== "orbit") { setChip(null); lastChipRef.current = null; return; }

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

    const readout: Readout = { country, time: localTime(simTime(globe.timeOffsetMin), point.lon), wind, quake };
    const box = root?.getBoundingClientRect();
    const x = Math.max(8, Math.min(point.clientX - (box?.left ?? 0) + CHIP_OFFSET, (box?.width ?? 1440) - CHIP_W_GUESS - 8));
    const y = Math.max(8, Math.min(point.clientY - (box?.top ?? 0) + CHIP_OFFSET, (box?.height ?? 900) - CHIP_H_GUESS - 8));
    const last = lastChipRef.current;
    if (!last || last.x !== x || last.y !== y || last.readout.country !== readout.country
      || last.readout.time !== readout.time || last.readout.wind !== readout.wind || last.readout.quake !== readout.quake) {
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
      scheduleFrame();
    };
    const detach = surfaceHover(canvas, pick, onMove);
    if (window.__W11_TEST__) window.__V4_HOVER__ = { move: (point) => onMove({ ...point, clientX: 0, clientY: 0 }), leave: () => onMove(null) };
    return () => {
      detach();
      hoverPoint.current = null;
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      delete window.__V4_HOVER__;
    };
  }, [canvas, scheduleFrame]);

  if (!root || !chip) return null;
  return createPortal(
    <div
      data-hover-readout
      aria-hidden
      style={{ left: chip.x, top: chip.y }}
      className="pointer-events-none absolute z-20 w-52 rounded-lg border border-line bg-ink/70 px-2 py-1.5 font-mono text-xs leading-snug text-zinc-100 backdrop-blur"
    >
      <div data-hover-country>{chip.readout.country}</div>
      <div data-hover-time>{chip.readout.time}</div>
      {chip.readout.wind && <div data-hover-wind>{chip.readout.wind}</div>}
      {chip.readout.quake && <div data-hover-quake>{chip.readout.quake}</div>}
    </div>,
    root,
  );
}
