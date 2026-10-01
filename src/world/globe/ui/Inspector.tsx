import { lazy, Suspense, useEffect, useState } from "react";
import { localGuide } from "../../../data/profile/localGuide.ts";
import { guideReviewSelection } from "../layers/guideReviewSelection.ts";
import GuideLightbox from "./GuideLightbox.tsx";
import { useGlobe, type Selection } from "../globeStore.ts";
import { useKpSpark, useQuakeRegionSpark, type SparkSeries } from "./sparkSeries.ts";

// LANE V7 (wave 7, "How it's built" panel): its own chunk, loaded only once
// a visitor opens it -- never in the eager Globe chunk (check-budget.mjs).
const HowItsBuilt = lazy(() => import("./HowItsBuilt.tsx"));

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
function Spark({ series }: { series: SparkSeries & { kind?: "histogram" } }) {
  const coords = sparkCoords(series.values);
  const last = coords[coords.length - 1];
  const maxCount = Math.max(1, ...series.values);
  const barWidth = SPARK_W / series.values.length;
  const points = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  return (
    <div className="mb-2">
      <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="block" role="img" aria-label={series.label}>
        {series.kind === "histogram" ? series.values.map((value, i) => {
          const height = Math.max(0, value) / maxCount * (SPARK_H - 2);
          return <rect key={i} x={i * barWidth} y={SPARK_H - height} width={Math.max(0, barWidth - 1)} height={height} fill="var(--color-probe)"><title>{`${i}:00 IST: ${value} events`}</title></rect>;
        }) : <>
        <polyline points={points} fill="none" stroke="var(--color-probe)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r={2} fill="var(--color-probe)" />
        </>}
      </svg>
      <p className="truncate text-xs text-muted" title={series.label}>
        {series.label}
      </p>
    </div>
  );
}

const KP_KINDS = new Set(["quake", "density", "fire", "satellite", "launch", "aurora", "moon", "planet"]);

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

  // WAVE 7 LANE V7: a plain open/closed flag, not selection-filtered -- most
  // Selection.kind values (quake, guide-place, satellite, ...) name an
  // INSTANCE, not one of the handful of shader/data layers this panel can
  // honestly show (see howItsBuiltData.ts's own "could not wire" note), so
  // there is no clean instance-to-layer mapping to filter on without editing
  // files outside this lane's scope. The panel always lists every layer it
  // knows, organised per layer inside itself.
  const [showBuild, setShowBuild] = useState(false);
  const [lightbox, setLightbox] = useState<{ selectionId: string; index: number } | null>(null);

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
    if (typeof window === "undefined" || getComputedStyle(document.documentElement).getPropertyValue("--globe-compact").trim() !== "1") return;
    if (selected) setSheet("inspector");
    else if (useGlobe.getState().sheet === "inspector") setSheet(null);
  }, [selected, setSheet]);

  const selectionId = selected?.id;
  useEffect(() => {
    if (selectionId === undefined) return;
    const prior = document.activeElement;
    return () => {
      // A replacement already has its own focused opener. Leave it focused
      // so the next effect captures it instead of the previous selection's.
      const nextId = useGlobe.getState().selected?.id;
      if ((nextId === undefined || nextId === selectionId) && prior instanceof HTMLElement && prior.isConnected) prior.focus({ preventScroll: true });
    };
  }, [selectionId]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || (e.target instanceof Element && e.target.closest("dialog[open]"))) return;
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, select]);

  if (!selected) return null;

  // A real flex-column sibling below the scrollable body, not a `sticky`
  // overlay inside it: `sticky bottom-0` floats on TOP of whatever content
  // is last in the scroll flow, so opening a tall "How it's built" panel
  // (WAVE 7 LANE V7) covered its first lines on first open, before any
  // manual scroll -- verifier-caught desktop overlap defect. Giving this row
  // its own flex slot outside the `overflow-y-auto` div means it occupies
  // real layout space instead of floating over it, so nothing it sits above
  // can ever render underneath it.
  const actions = (touchTarget: string) => (
    <div className="flex shrink-0 flex-wrap gap-2 rounded-b-2xl glass-panel px-3 pb-3 pt-2">
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

      {(selected.kind === "guide-place" || selected.kind === "guide-review") && <div className="mb-3 text-xs">
        <p>{localGuide.label}</p>
        <a href={localGuide.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline">My Google Maps profile</a>
      </div>}
      {selected.guide?.review && <section className="mb-3" aria-label="Review text">
        {selected.guide.review.text.length > 220 ? <><p>{selected.guide.review.text.slice(0, 220)}...</p><details key={selected.id}><summary className="min-h-11 cursor-pointer py-3">More</summary><p className="whitespace-pre-wrap">{selected.guide.review.text}</p></details></> : <p className="whitespace-pre-wrap">{selected.guide.review.text || "No written review"}</p>}
      </section>}
      {selected.guide?.places && <section className="mb-3" aria-label="Reviewed places in this city">
        <h3 className="mb-1">Reviewed public places</h3>
        {selected.guide.places.length === 0 && <p>No located reviews in this city.</p>}
        <ul>{selected.guide.places.map((review) => <li key={review.id}><button type="button" onClick={() => { select(guideReviewSelection(review)); setView("orbit"); }} className="min-h-11 w-full rounded px-2 py-2 text-left hover:text-accent focus-visible:outline focus-visible:outline-accent">{review.name} · {review.rating} / 5 · {review.month}</button></li>)}</ul>
      </section>}

      {(() => {
        // An explicit `selected.spark` (globeStore.ts's own additive field —
        // some future selector setting a real series directly) always wins
        // over what this file derives on its own; the derived one only
        // fills in when nothing was provided.
        const sparks: (SparkSeries & { kind?: "histogram" })[] = [];
        if (selected.spark && selected.spark.length > 0) sparks.push({ values: selected.spark, label: selected.sparkLabel ?? selected.source, kind: selected.sparkKind });
        else if (regionSpark) sparks.push(regionSpark);
        // Kp is geomagnetic activity: it belongs beside space and hazard
        // selections, never beside an owner card or a Maps place.
        if (kpSpark && KP_KINDS.has(selected.kind)) sparks.push(kpSpark);
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
              {m.src ? <button type="button" aria-label={`Open photo ${i + 1}: ${m.alt}`} onClick={() => setLightbox({ selectionId: selected.id, index: i })} className="rounded-md focus-visible:outline focus-visible:outline-accent"><img src={m.src} alt={m.alt} width={96} height={96} loading="lazy" decoding="async" className="h-24 w-24 rounded-md object-cover" /></button> : <p role="img" aria-label={m.alt} className="flex h-24 w-24 items-center justify-center rounded-md border border-line p-2 text-xs">Photo unavailable</p>}
              <figcaption className="mt-1 max-w-24 truncate text-xs text-muted">{m.caption}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="mb-3 truncate text-xs text-muted" title={selected.source}>
        {selected.live ? "Live" : "Snapshot"} · {selected.source}
      </p>

      <button
        type="button"
        onClick={() => setShowBuild((v) => !v)}
        aria-expanded={showBuild}
        data-how-its-built-toggle
        className="mb-2 rounded-full border border-line px-2 py-0.5 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {showBuild ? "Hide how it's built" : "How it's built"}
      </button>
      {showBuild && (
        <Suspense fallback={<p className="mb-2 text-xs text-muted">Loading...</p>}>
          <HowItsBuilt />
        </Suspense>
      )}
    </>
  );

  const viewerPhotos = selected.media?.filter((photo) => photo.src) ?? [];
  const viewed = lightbox && lightbox.selectionId === selected.id ? selected.media?.[lightbox.index] : undefined;
  const viewedIndex = viewed ? viewerPhotos.findIndex((photo) => photo.src === viewed.src) : -1;
  return (
    <>
      {viewedIndex >= 0 && <GuideLightbox photos={viewerPhotos} index={viewedIndex} onClose={() => setLightbox(null)} onChange={(index) => setLightbox({ selectionId: selected.id, index: selected.media!.indexOf(viewerPhotos[index]) })} />}
      {/* Desktop/tablet (sm+): the shared left slot. */}
      <div
        data-globe-inspector
        role="region"
        aria-live="polite"
        aria-label="Selection details"
        className="pointer-events-auto absolute inset-x-4 top-20 z-30 hidden max-h-[calc(100%-45%-96px)] w-[288px] flex-col overflow-hidden rounded-2xl glass-panel font-mono text-xs text-zinc-300 sm:top-[var(--globe-left-slot-top,5rem)] sm:flex sm:inset-x-auto sm:left-4 sm:bottom-[var(--globe-facts-reserve,calc(45%+16px))] sm:max-h-[calc(100%-var(--globe-facts-reserve,calc(45%+16px))-var(--globe-left-slot-top,5rem))]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{body}</div>
        {actions("py-1")}
      </div>

      {/* Phone (< 640): a bottom sheet, opened by the selection itself. */}
      {sheet === "inspector" && (
        <div
          data-globe-inspector-sheet
          role="region"
          aria-live="polite"
          aria-label="Selection details"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex max-h-[70vh] flex-col rounded-t-2xl glass-panel font-mono text-xs text-zinc-300 sm:hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
          {actions("min-h-11 min-w-11")}
        </div>
      )}
    </>
  );
}
