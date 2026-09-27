import { useEffect } from "react";
import { useGlobe, type Selection } from "../globeStore.ts";

/** LANE L5 (navigation and UI) owns this file. */

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

  useEffect(() => {
    const seam = window.__GLOBE_TEST_SELECT__;
    if (seam) select(seam);
    // Mount-only: a test arms this global before navigation, and it should
    // never re-fire on a later, unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div
      data-globe-inspector
      role="region"
      aria-live="polite"
      aria-label="Selection details"
      // top-56, not top-20: at top-20 this sat inside the time scrubber's own
      // band on mobile (scrubber stacks below the header there, reaching
      // further down) and, at 1024 width, the scrubber's centred card is wide
      // enough to reach this column too -- both measured via screenshot QA.
      // A fixed offset that clears the scrubber's tallest layout works at
      // every required breakpoint; GlobePanel's own 45%-cap floor still
      // leaves this plenty of room above it.
      className="pointer-events-auto absolute left-4 top-56 z-20 w-[min(88vw,300px)] rounded-2xl border border-line bg-ink/80 p-3 font-mono text-xs text-zinc-300 backdrop-blur"
    >
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

      <dl className="mb-2 grid grid-cols-2 gap-x-2 gap-y-1">
        {selected.rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="truncate text-zinc-500">{row.label}</dt>
            <dd className="truncate text-right text-zinc-200">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mb-3 truncate text-xs text-muted" title={selected.source}>
        {selected.live ? "Live" : "Snapshot"} · {selected.source}
      </p>

      <div className="flex flex-wrap gap-2">
        {selected.focus && (
          <button
            type="button"
            onClick={() => {
              setView("orbit");
              flyTo(selected.focus!);
            }}
            className="rounded-full border border-line px-2 py-1 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Fly to
          </button>
        )}
        {selected.focus?.kind === "entity" && (
          <button
            type="button"
            onClick={() => {
              flyTo(selected.focus!);
              setView("follow");
            }}
            className="rounded-full border border-line px-2 py-1 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Follow
          </button>
        )}
        <button
          type="button"
          onClick={() => select(null)}
          className="rounded-full border border-line px-2 py-1 text-xs hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Close
        </button>
      </div>
    </div>
  );
}
