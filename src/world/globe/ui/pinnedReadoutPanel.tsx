import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { canvasState, surfaceClicks, surfacePicker } from "../exploreCanvas.ts";
import { useExplore } from "../exploreState.ts";
import { hoverPoint, simTime, useGlobe } from "../globeStore.ts";
import type { LatLon } from "../geoMath.ts";
import { getLiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";
import type { WindResponse } from "../../../../api/_lib/wind-handler.ts";
import { pinnedMeteors, pinnedValues, utc, type PinnedValue } from "./pinnedReadout.ts";

const QUAKES = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const button = "min-h-11 min-w-11 rounded-lg px-2 text-zinc-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
export default function PinnedReadoutPanel({ canvas, extras }: { canvas: HTMLCanvasElement | null; extras: (point: LatLon) => PinnedValue[] }) {
  const pins = useExplore(s => s.pins);
  const offset = useGlobe(s => s.timeOffsetMin);
  const sheet = useGlobe(s => s.sheet);
  const view = useGlobe(s => s.view);
  const [, setClock] = useState(0);
  useEffect(() => {
    if (!pins.length) return;
    const id = setInterval(() => setClock(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [pins.length]);
  useEffect(() => {
    if (!canvas) return;
    const oldTab = canvas.getAttribute("tabindex"), oldLabel = canvas.getAttribute("aria-label");
    canvas.setAttribute("tabindex", "0");
    const focusClasses = ["focus-visible:outline", "focus-visible:outline-2", "focus-visible:outline-accent", "focus-visible:-outline-offset-2"].filter(c => !canvas.classList.contains(c));
    canvas.classList.add(...focusClasses);
    canvas.setAttribute("aria-label", "Globe surface. Enter pins the hovered point, or the centre of the globe. Escape removes pins.");
    const pick = surfacePicker(canvas, () => canvasState(canvas));
    const pin = (point: LatLon) => {
      const mode = useExplore.getState().mode;
      if (useGlobe.getState().view === "orbit" && (!mode || mode === "pin")) useExplore.getState().pin(point);
    };
    // Pointer pinning is opt-in: a pointerup must not mount a panel over
    // a marker's click or the second half of a native zoom gesture.
    const detach = surfaceClicks(canvas, pick, point => {
      if (useExplore.getState().mode === "pin") pin(point);
    });
    // Pin mode owns canvas clicks, including clicks over scene markers.
    const capture = (event: MouseEvent) => {
      if (useExplore.getState().mode === "pin") event.stopPropagation();
    };
    canvas.addEventListener("click", capture, true);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && useExplore.getState().pins.length) {
        const target = event.target;
        if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        useExplore.getState().clearPins();
        if (target instanceof HTMLElement && target.closest("[data-pinned-readouts]")) canvas.focus();
      }
      if (event.key === "Enter" && event.target === canvas) {
        event.preventDefault();
        const box = canvas.getBoundingClientRect();
        const point = hoverPoint.current ?? pick(box.left + box.width / 2, box.top + box.height / 2);
        if (point) pin(point);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      canvas.classList.remove(...focusClasses);
      canvas.removeEventListener("click", capture, true);
      detach(); window.removeEventListener("keydown", key);
      if (oldTab === null) canvas.removeAttribute("tabindex"); else canvas.setAttribute("tabindex", oldTab);
      if (oldLabel === null) canvas.removeAttribute("aria-label"); else canvas.setAttribute("aria-label", oldLabel);
    };
  }, [canvas]);
  const minute = Math.floor(simTime(offset).getTime() / 60000);
  const meteors = useMemo(() => pins.map(point => pinnedMeteors(point, new Date(minute * 60000))), [pins, minute]);
  const root = canvas?.closest<HTMLElement>("[data-globe-root]");
  if (!root || !pins.length || sheet || view !== "orbit") return null;
  // The timer triggers reads of existing shared stores, never a poller.
  const at = simTime(offset);
  const wind = getLiveSignalSnapshot<WindResponse>("/api/wind");
  const quakes = getLiveSignalSnapshot<unknown>(QUAKES);
  const columns = pins.map((point, i) => ({ point, values: pinnedValues(point, at, wind.data, quakes.data, wind.error, quakes.error), extras: [...extras(point), meteors[i]] }));
  return createPortal(<section data-pinned-readouts aria-label="Pinned point comparison" className={`pointer-events-auto flex flex-col fixed bottom-4 left-1/2 z-50 sm:z-30 ${pins.length === 1 ? "max-h-[min(32vh,calc(var(--globe-sheet-max-h,100vh)-16px))]" : "max-h-[min(40vh,calc(var(--globe-sheet-max-h,100vh)-16px))]"} w-[calc(100%-32px)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/20 bg-zinc-950 p-3 text-zinc-100 shadow-2xl sm:absolute sm:bottom-6 sm:max-h-[min(60vh,calc(var(--globe-sheet-max-h,100vh)-24px))]`}>
    <div className="shrink-0 flex items-center justify-between gap-2 bg-zinc-950 pb-2">
      <div><h2 className="text-base font-semibold">{pins.length === 2 ? "Compare points" : "Point pinned"}</h2><p role="status" className="text-xs text-zinc-300">{pins.length === 2 ? "Remove a point to choose another. Esc clears both." : "Choose a second point. Scroll for readings."}</p></div>
      <button className={button} aria-label="Close pinned readouts" onClick={() => { useExplore.getState().clearPins(); canvas?.focus(); }}>×</button>
    </div>
    <div data-pin-scroll className="min-h-0 overflow-y-auto">
    <p data-pin-time className="mb-2 mt-1 font-mono text-xs text-zinc-300">Viewing {utc(at.getTime())}</p>
    {offset !== 0 && <p className="mb-2 text-xs text-zinc-300">Sun and solar time recompute. Weather remains a dated snapshot.</p>}
    <div className={`grid gap-3 ${pins.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {columns.map(({ point, values, extras: extra }, i) => <article key={`${point.lat}:${point.lon}`} data-pinned-point tabIndex={0} aria-label={`Pinned point ${i === 0 ? "A" : "B"}`} className="min-w-0 rounded-xl border border-white/15 bg-white/5 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <div className="flex items-center justify-between gap-1"><span className="text-sm font-semibold text-accent">Point {i === 0 ? "A" : "B"}</span><button className={button} aria-label={`Remove point ${i === 0 ? "A" : "B"}`} onClick={() => { useExplore.getState().removePin(i); canvas?.focus(); }}>×</button></div>
        <p className="mb-2 font-mono text-xs text-zinc-300">{point.lat.toFixed(2)}°, {point.lon.toFixed(2)}°<span className="block">Globe surface selection</span></p>
        <dl className={pins.length === 1 ? "grid grid-cols-2 gap-4" : "space-y-4"}>{values.map(row => <div key={row.label}><dt className="text-xs text-zinc-300">{row.label}</dt><dd className="mt-0.5 text-sm font-medium"><span data-pin-value={row.label}>{row.value}</span><span className="mt-1 block text-xs font-normal text-zinc-300">{row.source}</span><span className="block text-xs font-normal text-zinc-300">{row.time}</span></dd></div>)}</dl>
        <details className="mt-3 border-t border-white/15"><summary className={`${button} flex cursor-pointer items-center text-xs`}>More readings</summary><dl className="space-y-3">{extra.map(row => <div key={row.label}><dt className="text-xs text-zinc-300">{row.label}</dt><dd className="text-sm"><span data-pin-value={row.label}>{row.value}</span><span className="block text-xs text-zinc-300">{row.source}</span><span className="block text-xs text-zinc-300">{row.time}</span></dd></div>)}</dl></details>
      </article>)}
    </div>
    </div>
  </section>, root);
}
