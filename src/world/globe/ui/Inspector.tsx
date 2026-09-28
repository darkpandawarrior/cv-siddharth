import { useEffect } from "react";
import { useGlobe, type Selection } from "../globeStore.ts";

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

export default function Inspector(_props: { tier: 1 | 2 | 3 }) {
  const selected = useGlobe((s) => s.selected);
  const select = useGlobe((s) => s.select);
  const flyTo = useGlobe((s) => s.flyTo);
  const setView = useGlobe((s) => s.setView);
  const sheet = useGlobe((s) => s.sheet);
  const setSheet = useGlobe((s) => s.setSheet);

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

  const actions = (touchTarget: string) => (
    <div className="flex flex-wrap gap-2">
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
        className="pointer-events-auto absolute inset-x-4 top-20 z-30 hidden max-h-[calc(100%-45%-96px)] w-[288px] overflow-y-auto rounded-2xl border border-line bg-ink/80 p-3 font-mono text-xs text-zinc-300 backdrop-blur sm:block sm:inset-x-auto sm:left-4 sm:bottom-[calc(45%+16px)] sm:max-h-none"
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
