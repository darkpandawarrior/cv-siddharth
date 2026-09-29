import { useEffect } from "react";
import { useGlobe, type Selection } from "../globeStore.ts";
import { useKpSpark, useQuakeRegionSpark, type SparkSeries } from "./sparkSeries.ts";

/** LANE L5 (navigation and UI) owns the selection contract; LANE U1
 *  (composition) owns this file's layout: the shared left slot on sm+ (the
 *  same box GlobeTour's running card uses - they are never both visible,
 *  since starting the tour clears the selection) and a bottom sheet on
 *  phones, opened automatically by a selection rather than a dedicated icon
 *  button (there is no "Inspector" icon in the top row - selecting IS how
 *  a phone visitor opens it, same as tapping the Pune ring or a future
 *  layer's marker). */

// e2e-only seam (this lane's own brief, task 9): no other lane's layer click
// handlers exist in this worktree yet, so there is no real way to populate
// `selected` for a Playwright run without one. Reading an undefined global is
// a no-op in production -- nobody sets this outside a test -- so this is
// exactly a no-op beyond what a test deliberately arms, per the brief.
declare global {
  interface Window {
    __GLOBE_TEST_SELECT__?: Selection;
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

// WAVE 6 LANE X6 (craft: inspector sparklines). A tiny inline SVG line
// chart, no charting library — a handful of points drawn as one polyline is
// the whole feature. Never invents a series: every caller passes a real
// SparkSeries (sparkSeries.ts's own hooks return `null`, not a fake one,
// when a feed is unreachable or empty) and always names its source in
// `label`, right under the chart, same as every other live number on this
// page (G8).
const SPARK_W = 108;
const SPARK_H = 26;
function sparkCoords(values: number[]): { x: number; y: number }[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // a flat series (all-equal, incl. a single point) draws a flat mid-height line rather than dividing by zero
  const step = values.length > 1 ? SPARK_W / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: values.length > 1 ? i * step : SPARK_W / 2,
    y: SPARK_H - 2 - ((v - min) / range) * (SPARK_H - 4),
  }));
}
function Spark({ series }: { series: SparkSeries }) {
  const coords = sparkCoords(series.values);
  const last = coords[coords.length - 1];
  const points = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  return (
    <div className="mb-2">
      <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="block" role="img" aria-label={series.label}>
        <polyline points={points} fill="none" stroke="var(--color-probe)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r={2} fill="var(--color-probe)" />
      </svg>
      <p className="truncate text-xs text-muted" title={series.label}>
        {series.label}
      </p>
    </div>
  );
}

export default function Inspector(_props: { tier: 1 | 2 | 3 }) {
  const selected = useGlobe((s) => s.selected);
  const select = useGlobe((s) => s.select);
  const flyTo = useGlobe((s) => s.flyTo);
  const setView = useGlobe((s) => s.setView);
  const sheet = useGlobe((s) => s.sheet);
  const setSheet = useGlobe((s) => s.setSheet);

  // Hooks run every render regardless of `selected` (the early return below
  // is after these) — sparkSeries.ts's own hooks already no-op safely on
  // null lat/lon. `quake` selections come from quakeGlyphs.tsx (an
  // individual quake); `density` selections come from this wave's own
  // HexbinLayer.tsx (a hex cell) — both carry a real lat/lon focus a
  // regional trend can honestly be drawn around.
  const regionFocus = selected && (selected.kind === "quake" || selected.kind === "density") && selected.focus?.kind === "latlon" ? selected.focus : null;
  const regionSpark = useQuakeRegionSpark(regionFocus?.lat ?? null, regionFocus?.lon ?? null);
  const kpSpark = useKpSpark();

  useEffect(() => {
    const seam = window.__GLOBE_TEST_SELECT__;
    if (seam) select(seam);
    // Mount-only: a test arms this global before navigation, and it should
    // never re-fire on a later, unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phones have no dedicated "Inspector" icon (unlike Layers/Time/Tour) --
  // a selection IS the open action, and clearing it IS the close action.
  // Desktop ignores `sheet` entirely for this component.
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    if (selected) setSheet("inspector");
    else if (useGlobe.getState().sheet === "inspector") setSheet(null);
  }, [selected, setSheet]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, select]);

  if (!selected) return null;

  // Sticky, not just a trailing block: at a narrow sm+ width with a wrapped
  // topbar (the card's own available height shrinks with it - see
  // Globe.tsx's --globe-top-offset), a long selection's rows can push
  // "Close" out of the initial scroll view entirely. -mx-3/-mb-3 bleeds back
  // out to the card's own edge (its padding is p-3) so the sticky footer's
  // background covers edge to edge instead of leaving a transparent gutter.
  const actions = (touchTarget: string) => (
    <div className="sticky bottom-0 -mx-3 -mb-3 mt-2 flex flex-wrap gap-2 rounded-b-2xl bg-ink/95 px-3 pb-3 pt-2 backdrop-blur">
      {selected.focus && (
        <button
          type="button"
          onClick={() => {
            setView("orbit");
            flyTo(selected.focus!);
          }}
          className={`rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget}`}
        >
          Fly to
        </button>
      )}
      {/* Street-level entry point for lane W3's surface (this lane only ever
          sets store state - the StreetView surface itself belongs to that
          lane). Any selection anchored to a real point on the globe can hand
          off, not just Pune's own ring. */}
      {selected.focus?.kind === "latlon" && (
        <button
          type="button"
          onClick={() => {
            flyTo(selected.focus!);
            setView("street");
          }}
          className={`rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget}`}
        >
          Street level here
        </button>
      )}
      {selected.focus?.kind === "entity" && (
        <button
          type="button"
          onClick={() => {
            flyTo(selected.focus!);
            setView("follow");
          }}
          className={`rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget}`}
        >
          Follow
        </button>
      )}
      <button
        type="button"
        onClick={() => select(null)}
        className={`rounded-full border border-line px-2 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget}`}
      >
        Close
      </button>
    </div>
  );

  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-100">{selected.title}</h2>
        {selected.live && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold tracking-wide"
            style={{ color: "var(--color-signal)", border: "1px solid var(--color-signal)" }}
          >
            LIVE
          </span>
        )}
      </div>

      <dl className="mb-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
        {selected.rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="contents">
            <dt className={row.swatch ? "sr-only" : "truncate text-zinc-500"}>{row.label}</dt>
            <dd className={row.swatch ? "col-span-2 flex items-start gap-2 text-zinc-200" : "truncate text-right text-zinc-200"}>
              {row.swatch && <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: row.swatch }} />}
              <span>{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>

      {(() => {
        // An explicit `selected.spark` (globeStore.ts's own additive field —
        // some future selector setting a real series directly) always wins
        // over what this file derives on its own; the derived one only
        // fills in when nothing was provided.
        const sparks: SparkSeries[] = [];
        if (selected.spark && selected.spark.length > 0) sparks.push({ values: selected.spark, label: selected.sparkLabel ?? selected.source });
        else if (regionSpark) sparks.push(regionSpark);
        if (kpSpark) sparks.push(kpSpark);
        return sparks.map((s, i) => <Spark key={`${s.label}-${i}`} series={s} />);
      })()}

      {selected.media && selected.media.length > 0 && (
        <div
          data-guide-media
          role="group"
          aria-label={`${selected.media.length} photo${selected.media.length === 1 ? "" : "s"}`}
          tabIndex={0}
          className="mb-3 flex gap-2 overflow-x-auto rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {selected.media.map((m, i) => (
            <figure key={`${m.src}-${i}`} className="m-0 shrink-0">
              <img src={m.src} alt={m.alt} width={96} height={96} loading="lazy" decoding="async" className="h-24 w-24 rounded-md object-cover" />
              <figcaption className="mt-1 max-w-24 truncate text-xs text-muted">{m.caption}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="mb-3 truncate text-xs text-muted" title={selected.source}>
        {selected.live ? "Live" : "Snapshot"} · {selected.source}
      </p>
    </>
  );

  return (
    <>
      {/* Desktop/tablet (sm+): the shared left slot. */}
      <div
        data-globe-inspector
        role="region"
        aria-live="polite"
        aria-label="Selection details"
        className="pointer-events-auto absolute inset-x-4 top-20 z-30 hidden max-h-[calc(100%-45%-96px)] w-[288px] overflow-y-auto rounded-2xl border border-line bg-ink/80 p-3 font-mono text-xs text-zinc-300 backdrop-blur sm:top-[var(--globe-top-offset,5rem)] sm:block sm:inset-x-auto sm:left-4 sm:bottom-[calc(45%+16px)] sm:max-h-[calc(100%-45%-16px-var(--globe-top-offset,5rem))]"
      >
        {body}
        {actions("py-1")}
      </div>

      {/* Phone (< 640): a bottom sheet, opened by the selection itself. */}
      {sheet === "inspector" && (
        <div
          data-globe-inspector-sheet
          role="region"
          aria-live="polite"
          aria-label="Selection details"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-line bg-ink/90 p-4 font-mono text-xs text-zinc-300 backdrop-blur sm:hidden"
        >
          {body}
          {actions("min-h-11 min-w-11")}
        </div>
      )}
    </>
  );
}
