import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Picture } from "./Picture.tsx";
import { compareSets } from "./data/compareSets.ts";
import { bandFor, clampPosition, clipFor, evenPositions, percentAt } from "./compareGeometry.ts";

export type CompareLayer = {
  /** Original raster path; Picture picks up the avif/webp siblings. */
  src: string;
  /** Shown in the band and read out by assistive tech. Keep it short — it sits over the image. */
  label: string;
};

type Props = {
  layers: CompareLayer[];
  /** What the reader is comparing, e.g. "Expenses". Used for alt text and the aria labels. */
  subject: string;
  className?: string;
  /**
   * Frame aspect ratio. Deliberately *not* the full 9:19.5 of the phone screenshots underneath:
   * at full height the frame runs past 1,500px and the reader has to scroll to compare, which
   * defeats a side-by-side. Cropping to the top with `object-top` keeps the status bar, title,
   * tabs and first cards — which is exactly where the treatments differ — and drops the empty
   * tail of a half-filled list, which is identical in all of them anyway.
   */
  aspect?: string;
};

/**
 * Slide-to-compare viewer for two or more versions of the same view.
 *
 * All versions are on screen at once, separated by draggable dividers, rather than swapped one at
 * a time. That is the point: design directions are chosen by *comparison*, and a control that
 * shows one option at a time turns comparison into memory. With five directions the reader can
 * park four thin and open the one they are examining, without losing the others as reference.
 *
 * Each divider is a real `role="slider"` with arrow-key support, so this works without a pointer.
 * The clipping is CSS `clip-path` driven by inline percentages, so the frame is already correct on
 * first paint rather than after a layout measurement.
 */
export function Compare({ layers, subject, className = "", aspect = "9 / 13" }: Props) {
  const count = layers.length;
  const [positions, setPositions] = useState(() => evenPositions(count));
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const id = useId();

  // Layer count can change between renders (a different comparison set on the same page).
  // Without this the old divider array sticks around and bands stop matching the images.
  useEffect(() => setPositions(evenPositions(count)), [count]);

  const moveTo = useCallback((index: number, clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPositions((prev) => clampPosition(prev, index, percentAt(clientX, rect)));
  }, []);

  useEffect(() => {
    if (dragging.current === null) return;
    const onMove = (e: PointerEvent) => {
      if (dragging.current === null) return;
      e.preventDefault();
      moveTo(dragging.current, e.clientX);
    };
    const onUp = () => { dragging.current = null; };
    // Listeners on window, not the handle: a fast drag outruns the 1px divider and the gesture
    // would otherwise drop the moment the pointer left it.
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  if (count === 0) return null;
  if (count === 1) {
    return (
      <div className={className}>
        <div className="overflow-hidden rounded-sm border border-line bg-surface" style={{ aspectRatio: aspect }}>
          <Picture src={layers[0].src} alt={`${subject} — ${layers[0].label}`} className="h-full w-full object-cover object-top" />
        </div>
      </div>
    );
  }

  const onKey = (index: number) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const delta =
      e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step
      : e.key === "Home" ? -100 : e.key === "End" ? 100 : 0;
    if (delta === 0) return;
    e.preventDefault();
    setPositions((prev) => clampPosition(prev, index, prev[index] + delta));
  };

  return (
    <figure className={`m-0 ${className}`}>
      <div
        ref={frameRef}
        id={`${id}-frame`}
        className="relative select-none overflow-hidden rounded-sm border border-line bg-surface"
        style={{ aspectRatio: aspect }}
      >
        {layers.map((layer, i) => (
          <div
            key={layer.src}
            className="absolute inset-0"
            // Not a transition: the divider must track the pointer exactly. Easing here reads as
            // input lag rather than polish.
            style={{ clipPath: clipFor(i, positions) }}
          >
            <Picture
              src={layer.src}
              alt={i === 0 ? `${subject} — ${layer.label}` : ""}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ))}

        {positions.map((pos, i) => (
          <div
            key={i}
            role="slider"
            tabIndex={0}
            aria-label={`${subject}: boundary between ${layers[i].label} and ${layers[i + 1].label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            aria-valuetext={`${Math.round(pos)}% — ${layers[i].label} left, ${layers[i + 1].label} right`}
            aria-controls={`${id}-frame`}
            onKeyDown={onKey(i)}
            onPointerDown={(e) => {
              e.preventDefault();
              dragging.current = i;
              (e.currentTarget as HTMLElement).focus();
            }}
            // A 1px line is the visual; the grab target is 24px wide and centred on it, because a
            // 1px pointer target is unusable on touch.
            className="absolute top-0 bottom-0 -ml-3 w-6 cursor-ew-resize touch-none focus:outline-none"
            style={{ left: `${pos}%` }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent" />
            <span className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-surface" />
          </div>
        ))}
      </div>
      {/* Labels sit under the frame, each pinned to its own band and moving with it. They were
          inside the frame first, at bottom-left of a full-frame layer — so all five stacked at the
          same point and four were clipped away, leaving one label that appeared to name the whole
          image. Out here every version stays named, and a band too narrow for its word truncates
          instead of overlapping its neighbour. */}
      <div className="relative mt-1.5 h-4" aria-hidden="true">
        {layers.map((layer, i) => {
          const [start, end] = bandFor(i, positions);
          return (
            <span
              key={layer.src}
              className="absolute overflow-hidden text-center font-mono text-[10px] tracking-wider text-muted uppercase text-ellipsis whitespace-nowrap"
              style={{ left: `${start}%`, width: `${end - start}%` }}
            >
              {layer.label}
            </span>
          );
        })}
      </div>
      <figcaption className="mt-1 flex items-baseline justify-between gap-3 font-mono text-[11px] text-muted">
        <span>{subject}</span>
        <span>{count} versions · drag or arrow-key the dividers</span>
      </figcaption>
    </figure>
  );
}

const prettySet = (s: string) => s.replace(/[-_]+/g, " ");

/**
 * The compare block for a project page. Renders nothing when the project has no comparison sets,
 * so it can sit unconditionally in ProjectDetail and light up for whichever projects gain one.
 *
 * One set at a time, chosen by the rail. Rendering all eight at once would pull ~40 images for a
 * section most readers scroll past, and would bury the comparison it exists to make.
 */
export function CompareSection({ slug }: { slug: string }) {
  const sets = compareSets[slug];
  const names = sets ? Object.keys(sets) : [];
  const [active, setActive] = useState(names[0] ?? "");
  if (!sets || names.length === 0) return null;
  const current = sets[active] ?? sets[names[0]];

  return (
    <section className="border-t border-line">
      <div className="section-y mx-auto max-w-6xl px-6">
        <div className="mb-8">
          <p className="section-eyebrow mb-2 text-xs font-semibold tracking-widest text-accent/70 uppercase">
            // directions
          </p>
          <h2 className="font-display text-h2 font-bold tracking-tight">
            Same screen, <span className="text-muted">{current.length} treatments</span>
          </h2>
          <p className="mt-3 max-w-prose text-sm text-muted">
            Every version is on screen at once. Drag the dividers — or focus one and use the arrow
            keys — to give whichever treatment you are reading more width without losing the others
            as reference.
          </p>
        </div>

        {names.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label={`${slug} comparison sets`}>
            {names.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={name === active}
                onClick={() => setActive(name)}
                className={`rounded-xs border px-3 py-1.5 font-mono text-xs tracking-wide transition-colors ${
                  name === active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-muted hover:border-accent/40 hover:text-text"
                }`}
              >
                {prettySet(name)}
              </button>
            ))}
          </div>
        )}

        <div className="mx-auto max-w-3xl">
          <Compare key={active} layers={current} subject={prettySet(active)} />
        </div>
      </div>
    </section>
  );
}
