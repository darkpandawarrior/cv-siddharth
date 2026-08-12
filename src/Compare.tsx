import { useEffect, useRef, useState } from "react";
import { Picture } from "./Picture.tsx";
import { compareSets } from "./data/compareSets.ts";
import { clampPosition, percentAt } from "./compareGeometry.ts";

export type CompareOption = {
  /** Shown on the toggle. Keep it short — these sit in a row. */
  label: string;
  /** The light face, and the only one that has to exist. */
  light: string;
  /** The dark counterpart, when the treatment ships one. */
  dark?: string;
};

type Props = {
  options: CompareOption[];
  /** What is being compared, e.g. "Approvals". Used for the aria labels. */
  subject: string;
  className?: string;
  /**
   * Frame size in CSS px, near the capture's natural width on purpose.
   *
   * NOT an aspect ratio. Forcing one wider than the screenshot's own made `object-cover` scale to
   * cover the width — a 411px capture across a 768px frame is a 1.9x magnification, so the reader
   * got a huge crop of the middle of the layout instead of a screen they could read. At natural
   * width the crop is purely vertical: title, tabs and first cards stay, the empty tail of a
   * half-filled list goes.
   */
  frameWidth?: number;
  frameHeight?: number;
};

/**
 * Pick a treatment with the toggle; drag to compare its light and dark faces.
 *
 * This replaced an N-way wipe that split one screen into five vertical bands. Two things were wrong
 * with that. Judging a whole design direction through an 80px-wide slice is not judging it — you
 * need one filling the frame. And a divider is only legible when the two sides differ in ONE
 * dimension: light against dark of the same treatment reads instantly, five different treatments
 * against each other just reads as a broken image.
 *
 * So the axis with many discrete values gets a toggle, and the axis with exactly two gets the drag.
 */
export function Compare({
  options,
  subject,
  className = "",
  frameWidth = 420,
  frameHeight = 560,
}: Props) {
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);

  // A different set can arrive on the same page (the section's own picker). Without this the old
  // index sticks and the toggle highlights a treatment that is not on screen.
  useEffect(() => {
    setActive(0);
    setPos(50);
  }, [options]);

  if (options.length === 0) return null;
  const current = options[Math.min(active, options.length - 1)];
  const hasDark = Boolean(current.dark);

  const moveTo = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(clampPosition([pos], 0, percentAt(clientX, rect))[0]);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const delta =
      e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step
      : e.key === "Home" ? -100 : e.key === "End" ? 100 : 0;
    if (delta === 0) return;
    e.preventDefault();
    setPos(clampPosition([pos], 0, pos + delta)[0]);
  };

  return (
    <figure className={`m-0 ${className}`}>
      {options.length > 1 && (
        <div className="mb-4 flex flex-wrap justify-center gap-2" role="tablist" aria-label={`${subject} treatments`}>
          {options.map((o, i) => (
            <button
              key={o.light}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`rounded-xs border px-3 py-1.5 font-mono text-xs tracking-wide transition-colors ${
                i === active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-muted hover:border-accent/40 hover:text-text"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={frameRef}
        className="relative mx-auto touch-pan-y overflow-hidden rounded-sm border border-line bg-surface select-none"
        style={{ width: frameWidth, height: frameHeight, maxWidth: "100%" }}
      >
        <Picture
          src={current.light}
          alt={`${subject} — ${current.label}, light`}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />

        {hasDark && (
          <>
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
            >
              {/* absolute inset-0, exactly like the light layer. `h-full` alone resolves against
                  the <picture> element Picture wraps the img in, which is inline and has no height,
                  so the dark face rendered at zero height and the frame just looked light. */}
              <Picture
                src={current.dark!}
                alt={`${subject} — ${current.label}, dark`}
                className="absolute inset-0 h-full w-full object-cover object-top"
              />
            </div>

            <div
              role="slider"
              tabIndex={0}
              aria-label={`${subject}, ${current.label}: reveal light or dark`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pos)}
              aria-valuetext={`${Math.round(pos)}% — light left, dark right`}
              onKeyDown={onKey}
              // Pointer capture on the handle, not window listeners. The previous version attached
              // them in an effect guarded on a ref, and setting a ref does not re-render — so the
              // listeners were never attached and dragging never worked at all, on any divider.
              // Capture also keeps the gesture alive when the pointer outruns a 1px line, which is
              // what those window listeners were reaching for.
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                e.currentTarget.focus();
                moveTo(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) moveTo(e.clientX);
              }}
              onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
              // 1px line, 32px grab target — a 1px target is unusable on touch and fiddly with a
              // mouse, which is the other half of why this felt undraggable.
              className="absolute top-0 bottom-0 -ml-4 w-8 cursor-ew-resize touch-none focus:outline-none"
              style={{ left: `${pos}%` }}
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent" />
              <span className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent bg-surface font-mono text-[10px] text-accent">
                ↔
              </span>
            </div>

            <span className="pointer-events-none absolute bottom-2 left-2 rounded-xs border border-glass-border bg-glass px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-text uppercase backdrop-blur-sm">
              light
            </span>
            <span className="pointer-events-none absolute right-2 bottom-2 rounded-xs border border-glass-border bg-glass px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-text uppercase backdrop-blur-sm">
              dark
            </span>
          </>
        )}
      </div>

      <figcaption className="mx-auto mt-2 flex max-w-md items-baseline justify-between gap-3 font-mono text-[11px] text-muted">
        <span>{current.label}</span>
        <span>
          {hasDark
            ? "drag or arrow-key the divider"
            : /* Said, not hidden: this treatment is single-mode, so there is nothing to wipe. */
              "single mode — no dark counterpart"}
        </span>
      </figcaption>
    </figure>
  );
}

const prettySet = (s: string) => s.replace(/[-_]+/g, " ");

/**
 * The compare block for a project page. Renders nothing when the project has no comparison sets, so
 * it can sit unconditionally in ProjectDetail and light up for whichever projects gain one.
 */
export function CompareSection({ slug }: { slug: string }) {
  const sets = compareSets[slug];
  const names = sets ? Object.keys(sets) : [];
  const [activeSet, setActiveSet] = useState(names[0] ?? "");
  if (!sets || names.length === 0) return null;
  const current = sets[activeSet] ?? sets[names[0]];

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
            Pick a treatment to see it whole. Where one ships a dark counterpart, drag the divider to
            compare the two faces of it — same layout, same content, only the light changes.
          </p>
        </div>

        {names.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label={`${slug} comparison sets`}>
            {names.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={name === activeSet}
                onClick={() => setActiveSet(name)}
                className={`rounded-xs border px-3 py-1.5 font-mono text-xs tracking-wide transition-colors ${
                  name === activeSet
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-muted hover:border-accent/40 hover:text-text"
                }`}
              >
                {prettySet(name)}
              </button>
            ))}
          </div>
        )}

        <Compare key={activeSet} options={current} subject={prettySet(activeSet)} />
      </div>
    </section>
  );
}
