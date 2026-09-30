import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Color, type InterleavedBuffer } from "three";
// LANE P1 (wave 7): the border line only -- Line2/LineSegmentsGeometry/
// LineMaterial (three-stdlib, already used declaratively at layers/
// SatelliteLayer.tsx) instead of plain LineSegments/LineBasicMaterial, for a
// crisp resolution-independent border width instead of the browser's
// clamped ~1px hairline. Everything else in this file (picking, hover,
// selection, presence/quake data) is unchanged -- see the effect below for
// exactly which lines moved.
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from "three-stdlib";
import { useLiveSignal, getLiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";
import { readColor } from "../../../themeColorThree.ts";
import { centroids } from "../centroids.ts";
import { countryAt, inCountry, type CountryIndex } from "../countryData.ts";
import { loadCountries } from "../countryLoad.ts";
import { surfaceClicks, surfacePicker } from "../exploreCanvas.ts";
import { localTime } from "../exploreMath.ts";
import { useExplore } from "../exploreState.ts";
import { GLOBE_RADIUS, latLonToXyz, type LatLon } from "../geoMath.ts";
import { hoverPoint, simTime, useGlobe } from "../globeStore.ts";
import { usePresenceGeo } from "../presenceGeo.ts";
import { parseQuakes, QUAKE_POLL_MS } from "./quake.ts";

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
// Same screen-space weight the old plain-GL line rendered at (a browser
// clamps LineBasicMaterial's own `linewidth` to ~1px regardless of the value
// set), just crisp now instead of blurry on a high-DPI display.
const BORDER_LINE_WIDTH_PX = 1;
declare global {
  interface Window {
    __W11_TEST__?: boolean;
    __W11_COUNTRY__?: { pick: (point: LatLon) => void; hover: (point: LatLon) => void; parseMs: number; vertices: number };
  }
}

/** All tiers: one LineSegments draw call, 110m data, no per-frame work.
 * Highlight changes vertex colours in that same draw call. Picking uses
 * the worker's 5° index, never one mesh/raycast per country. */
export default function CountryLayer(_props: { tier: 1 | 2 | 3 }) {
  const get = useThree(s => s.get);
  const [index, setIndex] = useState<CountryIndex | null>(null);
  const counts = usePresenceGeo();
  const countsRef = useRef(counts);
  const selectRef = useRef<((id: number) => void) | null>(null);
  const quakes = useLiveSignal<unknown>(QUAKES_URL, QUAKE_POLL_MS);
  const offset = useGlobe(s => s.timeOffsetMin);

  useEffect(() => {
    let active = true;
    useGlobe.getState().setStatus("countries", { state: "loading", detail: "Natural Earth 110m" });
    loadCountries().then(value => {
      if (active) { setIndex(value); useGlobe.getState().setStatus("countries", { state: "snapshot", detail: "Natural Earth 110m · public domain" }); }
    }).catch(() => { if (active) useGlobe.getState().setStatus("countries", { state: "failed", detail: "Boundaries unavailable; toggle to retry" }); });
    return () => { active = false; useGlobe.getState().setStatus("countries", undefined); };
  }, []);

  useEffect(() => {
    if (!index) return;
    const { scene, gl, invalidate } = get();
    const canvas = gl.domElement, root = canvas.closest<HTMLElement>("[data-globe-root]");
    const positions: number[] = [], ranges: [number, number][] = [];
    // Subdivide only long coarse edges so every chord stays above the sphere.
    for (const country of index.countries) {
      const start = positions.length / 3;
      for (const polygon of country.polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))) || 1;
        for (let j = 0; j < steps; j++) for (const t of [j / steps, (j + 1) / steps]) {
          const p = latLonToXyz(a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t);
          positions.push(p.x * (GLOBE_RADIUS + 0.018), p.y * (GLOBE_RADIUS + 0.018), p.z * (GLOBE_RADIUS + 0.018));
        }
      }
      ranges.push([start, positions.length / 3]);
    }
    // LineSegmentsGeometry.setPositions expects exactly the flat, consecutive
    // (start.xyz, end.xyz)-per-segment layout the loop above already built
    // for GL_LINES -- unchanged from before this lane's edit.
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const base = new Color("#637e8b"), bright = readColor("--color-probe", "#5ee6ff");
    // One RGB triple per "vertex" slot, same flat/paired layout and same
    // total length as `positions` -- setColors wraps THIS Float32Array
    // directly in its InstancedInterleavedBuffer (three-stdlib's own
    // LineSegmentsGeometry.setColors: `array instanceof Float32Array` is
    // used as-is, never copied), so mutating `colourArray` in place below
    // and flagging the buffer's own `needsUpdate` reaches the GPU with no
    // reallocation on every hover move -- the same trick the old
    // BufferAttribute.setXYZ() calls did.
    const colourArray = new Float32Array(positions.length);
    for (let i = 0; i < colourArray.length; i += 3) colourArray.set([base.r, base.g, base.b], i);
    geometry.setColors(colourArray);
    const colourBuffer = (geometry.attributes.instanceColorStart as unknown as { data: InterleavedBuffer }).data;
    const material = new LineMaterial({ vertexColors: true, toneMapped: false, linewidth: BORDER_LINE_WIDTH_PX });
    material.resolution.set(canvas.clientWidth, canvas.clientHeight);
    const borders = new LineSegments2(geometry, material);
    borders.name = "P1 country borders (LineSegments2)";
    scene.add(borders); invalidate();
    const tooltip = document.createElement("div");
    tooltip.setAttribute("role", "tooltip"); tooltip.dataset.countryTooltip = "";
    tooltip.className = "pointer-events-none absolute z-20 rounded-lg glass-panel px-2 py-1 font-mono text-xs text-zinc-100";
    tooltip.hidden = true; root?.appendChild(tooltip);
    let highlighted = -1;
    const paint = (id: number, x = 16, y = 150) => {
      if (id !== highlighted) {
        for (const [target, colour] of [[highlighted, base], [id, bright]] as const) if (target >= 0) {
          const [start, end] = ranges[target];
          for (let i = start; i < end; i++) colourArray.set([colour.r, colour.g, colour.b], i * 3);
        }
        colourBuffer.needsUpdate = true; highlighted = id; invalidate();
      }
      tooltip.hidden = id < 0;
      if (id >= 0) {
        tooltip.textContent = index.countries[id].name;
        tooltip.style.left = `${Math.max(8, Math.min(x + 13, (root?.clientWidth ?? 390) - tooltip.offsetWidth - 8))}px`;
        tooltip.style.top = `${Math.max(8, Math.min(y + 13, (root?.clientHeight ?? 844) - 36))}px`;
      }
    };
    const choose = (id: number) => {
      if (id < 0) return;
      const c = index.countries[id];
      const centre = centroids.find(p => p.iso2 === c.iso);
      const store = useGlobe.getState(), now = simTime(store.timeOffsetMin);
      const raw = getLiveSignalSnapshot<unknown>(QUAKES_URL);
      const list = raw.error ? null : parseQuakes(raw.data);
      const count = list?.filter(q => q.timeMs <= now.getTime() && now.getTime() - q.timeMs <= 86_400_000 && inCountry(q, c)).length;
      store.select({
        id: `country:${id}`, kind: "country", title: c.name, live: false,
        rows: [
          { label: "ISO code", value: c.iso === "-99" ? "Not assigned" : c.iso },
          { label: "Visitors now", value: store.timeOffsetMin ? "Unavailable in time travel" : c.iso === "-99" ? "Unavailable" : String(countsRef.current[c.iso] ?? 0) },
          { label: "Quakes / 24h", value: store.timeOffsetMin ? "Unavailable in time travel" : count == null ? "USGS unavailable" : String(count) },
          { label: "Local time", value: centre ? localTime(now, centre.lon) : "Centroid unavailable" },
          { label: "Boundaries", value: "Natural Earth 110m (coarse)" },
        ],
        source: "Natural Earth (public domain); playhtml live presence counts; USGS all-day feed; solar time",
        ...(centre ? { focus: { kind: "latlon" as const, lat: centre.lat, lon: centre.lon, distance: 18 } } : {}),
      });
      store.setSheet("inspector");
    };
    selectRef.current = choose;
    const pick = surfacePicker(canvas, get);
    const available = () => !useExplore.getState().mode && useGlobe.getState().view === "orbit";
    // LANE V4 (hover readout): this handler already runs the exact
    // point-in-polygon test HoverReadout also wants -- publish the id here
    // (module-level ref, not React state) so it can reuse this frame's
    // answer instead of loading a second copy of the Natural Earth index.
    const move = (event: PointerEvent) => {
      if (!available() || event.buttons) { paint(-1); hoverPoint.countryId = -1; return; }
      const point = pick(event.clientX, event.clientY), box = root?.getBoundingClientRect();
      const id = point ? countryAt(index, point) : -1;
      hoverPoint.countryId = id;
      paint(id, event.clientX - (box?.left ?? 0), event.clientY - (box?.top ?? 0));
    };
    const leave = () => { paint(-1); hoverPoint.countryId = -1; };
    canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerleave", leave);
    const unclick = surfaceClicks(canvas, pick, point => { if (available()) choose(countryAt(index, point)); });
    const unmode = useExplore.subscribe(() => paint(-1));
    const tick = setInterval(() => {
      const selection = useGlobe.getState().selected;
      if (selection?.kind === "country") choose(Number(selection.id.slice(8)));
    }, 60_000);
    if (window.__W11_TEST__) window.__W11_COUNTRY__ = {
      pick: point => { if (available()) choose(countryAt(index, point)); },
      hover: point => paint(countryAt(index, point)), parseMs: index.parseMs, vertices: colourArray.length / 3,
    };
    // LineMaterial draws in screen-space pixels, so its `resolution` uniform
    // has to track the canvas's own CSS size -- the old LineBasicMaterial
    // had no such dependency (a browser's raw GL line width is resolution-
    // independent to begin with, just clamped to ~1px, which is the whole
    // reason this lane swapped it out).
    const onResize = () => { material.resolution.set(canvas.clientWidth, canvas.clientHeight); invalidate(); };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);
    return () => {
      clearInterval(tick); unclick(); unmode(); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerleave", leave);
      resizeObserver.disconnect();
      tooltip.remove(); scene.remove(borders); geometry.dispose(); material.dispose(); invalidate();
      selectRef.current = null; delete window.__W11_COUNTRY__; hoverPoint.countryId = -1;
    };
  }, [get, index]);

  useEffect(() => {
    countsRef.current = counts;
    const selected = useGlobe.getState().selected;
    if (selected?.kind === "country") selectRef.current?.(Number(selected.id.slice(8)));
  }, [counts, quakes, offset]);
  return null;
}
