import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, GripVertical, Maximize2, Minimize2 } from "lucide-react";
import { projects } from "./data/profile.ts";
import { useLivePaint } from "./lib/livePaint.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { FitImage } from "./DeviceWall.tsx";

/**
 * One codebase, re-framed across form factors — running, not described.
 *
 * The claim this whole site makes is that a single Kotlin/Compose codebase
 * adapts across phone, foldable, tablet, desktop and TV. Every portfolio
 * asserts that in a bullet. This one hands you the running build and a real
 * width control, and the layout genuinely re-flows because the frame really is
 * a different viewport — Compose Multiplatform is doing the adapting live, not
 * a carousel of screenshots pretending to.
 *
 * NOTHING IS GATED. The section is complete and readable before anything
 * boots: the copy, the width control and the app rail all work against a still
 * poster. That is deliberate — `docs/SIDOS-VISION.md`'s first non-negotiable is
 * "content-forward, never gated. No 'click to launch to see anything.'" The
 * live build is an upgrade on top of a section that already says its piece.
 *
 * PERFORMANCE. Each build is ~14 MB of Wasm, so it boots ONLY on an explicit
 * click, never on scroll — unlike DeviceWall's LiveEmbed, which auto-boots in
 * view because it sits deep inside a project page a visitor chose to open.
 * Exactly one iframe is ever mounted: switching apps swaps its src, resizing
 * only changes the frame around it, so a re-frame costs no reload and the
 * running app keeps its state while it re-lays-out.
 *
 * ── WHY THE FRAME IS SCALED RATHER THAN FLUID ────────────────────────────
 * This section used to size the device with `width: 100%; max-width: 22rem`
 * and friends, which meant the frame only reached its nominal width when the
 * page had room for it. On a 500px-wide viewport, pressing "TV" produced a
 * 352px-wide frame still captioned "expanded · 10-foot" — the app inside was
 * laid out COMPACT while the UI claimed it was showing a television. The one
 * section whose entire job is to prove adaptive layout was lying on every
 * phone, and it was cut off besides.
 *
 * The device now takes its width and height in real dp and never gives them
 * up; a CSS transform scales the whole frame down to whatever space is going.
 * A transform does not change the layout viewport, so the iframe still gets
 * 1280x720 CSS pixels and Compose still branches on `expanded` — the visitor
 * sees it smaller, not different. That is the only arrangement where the
 * demonstration stays honest on a small screen.
 */

/** Android's real window size classes, keyed off width in dp. */
const CLASSES = [
  { id: "compact", label: "compact", note: "< 600dp", color: "var(--color-probe)", max: 600 },
  { id: "medium", label: "medium", note: "600 – 840dp", color: "var(--color-accent)", max: 840 },
  { id: "expanded", label: "expanded", note: "> 840dp", color: "var(--color-signal)", max: Infinity },
] as const;

const classOf = (dp: number) => CLASSES.find((c) => dp < c.max)!;

/** The draggable range. 320dp is the narrowest phone worth supporting; 1440dp
 *  is a desktop wide enough that nothing further changes. */
const MIN_DP = 320;
const MAX_DP = 1440;

type Form = {
  id: string;
  label: string;
  /** Real dp, handed to the app as real CSS pixels. Never a percentage. */
  w: number;
  h: number;
  /** Corner radius of the bezel, in px — a phone is round, a TV is not. */
  radius: number;
};

/**
 * Widths are the devices these classes were drawn for, not decorative numbers:
 * a Pixel 8 really is 412dp wide and a Pixel Fold really does open to 674dp,
 * which is what puts it either side of the 600dp line the code branches on.
 */
const FORMS: Form[] = [
  { id: "phone", label: "Phone", w: 412, h: 892, radius: 34 },
  { id: "foldable", label: "Foldable", w: 674, h: 841, radius: 20 },
  { id: "tablet", label: "Tablet", w: 1024, h: 768, radius: 18 },
  { id: "desktop", label: "Desktop", w: 1280, h: 800, radius: 10 },
  { id: "tv", label: "TV", w: 1280, h: 720, radius: 6 },
];

/**
 * Names are cut at the first separator: `profile.ts` carries full descriptive
 * titles which are right on a project card and far too long for a chip in a
 * row of four. This used to split on `" — "` alone, and the portfolio entry is
 * punctuated with a COLON ("cv-siddharth: this site, and its Compose
 * Multiplatform twin") — so that one chip rendered its whole 60-character
 * title and blew the row out to two lines beside three short siblings.
 */
const chipName = (name: string) => name.split(/\s*[—–:]\s+/)[0].trim();

/**
 * What to show before the build boots — one poster per ORIENTATION.
 *
 * A screenshot OF THE APP, not the project's marketing hero. The hero is a
 * 1000x370 banner authored for the card grid; letterboxed into a 9/19.5 phone
 * it becomes a thin strip floating in a black rectangle six times its height,
 * which is what "shows wrong previews" was describing — it reads as a failed
 * load rather than a poster.
 *
 * One capture is not enough either, and that was the second half of the same
 * bug. The frame here swings from 412x892 to 1280x720, so whichever single
 * shot is picked, FitImage honestly letterboxes it in most forms: the web
 * target's landscape capture left the phone frame two-thirds black. Two are
 * kept instead — the best portrait and the best landscape the registry has —
 * and the frame's own aspect chooses.
 *
 * `deviceFrame` already records which is which, so nothing new is hand-kept.
 * PaymentsLab's Web target ships `screens: []`, and portfolio has only a web
 * capture, so each side falls back to any capture at all and finally to the
 * hero rather than rendering an empty frame.
 */
const PORTRAIT_FRAMES = new Set(["phone", "widget"]);

function postersFor(p: (typeof projects)[number]) {
  const pick = (portrait: boolean) =>
    p.targets?.find(
      (t) => t.screens.length > 0 && PORTRAIT_FRAMES.has(t.deviceFrame) === portrait,
    )?.screens[0];
  const any = p.targets?.find((t) => t.screens.length > 0)?.screens[0];
  const path = (shot?: string) =>
    shot ? `/projects/${p.slug}/screenshots/${shot}` : `/projects/_heroes/${p.slug}.png`;
  return { portrait: path(pick(true) ?? any), landscape: path(pick(false) ?? any) };
}

/** The apps with a real web build, straight from the project registry. */
const APPS = projects.flatMap((p) => {
  const target = p.targets?.find((t) => t.liveUrl);
  return target?.liveUrl
    ? [{
        slug: p.slug,
        name: chipName(p.name),
        url: target.liveUrl,
        // Each build gets to wear its own colour in the rail. `portfolio` has
        // no theme block, so it falls back to the site's own accent rather
        // than rendering an undefined custom property.
        accent: p.theme?.accent ?? "var(--color-accent)",
        ...postersFor(p),
      }]
    : [];
});

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Where a dp value sits along the ruler, 0–1. */
const dpToPct = (dp: number) => (dp - MIN_DP) / (MAX_DP - MIN_DP);

export function DeviceMorph() {
  const [size, setSize] = useState({ w: FORMS[0].w, h: FORMS[0].h });
  const [radius, setRadius] = useState(FORMS[0].radius);
  const [app, setApp] = useState(APPS[0]);
  const [booted, setBooted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { painted, gaveUp } = useLivePaint(iframeRef, booted);
  const { goToSection } = useSectionNav();

  // How much room the frame has, so it can be SCALED into the space rather
  // than shrunk into it. Measured, never assumed: the section sits in a
  // max-w-6xl column whose width depends on the viewport and the scrollbar.
  //
  // Width comes from the wrapper, NOT from the stage. The stage's height is
  // derived from the scale below, so observing the stage would feed its own
  // output back into its input — a resize loop. The wrapper is full-width and
  // its width cannot depend on how tall the device turns out to be.
  const [availW, setAvailW] = useState(0);
  useEffect(() => {
    const el = stageRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAvailW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The visitor's OWN viewport, from `window` rather than a rendered box —
  // same reason as above. It feeds two things: the vertical budget for the
  // frame, and the "you are here" marker on the ruler.
  const [viewport, setViewport] = useState({ w: 0, h: 900 });
  useEffect(() => {
    const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /**
   * Full-viewport mode.
   *
   * A 1280dp TV on a 390dp phone is honest but 30% of life size, which is the
   * one case where "shown at 34%" is a fair caption and still not much use.
   * Rather than a second copy of anything, the WHOLE control block goes
   * `position: fixed` — same React subtree, same iframe element, so a build
   * that has already pulled 14 MB of Wasm keeps running and keeps its state
   * while the box around it becomes the window.
   */
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    // Locking the page behind the overlay: without this the body scrolls under
    // a fixed panel, which on iOS leaves the reader stranded somewhere else
    // when they close it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  // Full mode spends the whole viewport minus the control block; inline mode
  // keeps the frame to roughly two-thirds of the fold so the section never
  // swallows the page.
  const budgetH = full
    ? Math.max(200, viewport.h - 250)
    : Math.min(620, viewport.h * 0.68);

  // Never scale UP past 1: a 412dp phone blown up to fill a desktop column
  // would render at the right dp but look like a mockup rather than a device.
  const scale = availW ? Math.min(1, (availW - 8) / size.w, budgetH / size.h) : 0.4;

  const cls = classOf(size.w);
  const activeForm = FORMS.find((f) => f.w === size.w && f.h === size.h);

  const applyForm = (f: Form) => {
    setSize({ w: f.w, h: f.h });
    setRadius(f.radius);
  };

  /** Width from a pointer position along the track. Height is left alone —
   *  dragging the handle is resizing a WINDOW, and a window resize is exactly
   *  what the size classes react to. Pick a preset to change the shape. */
  const widthFromPointer = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
    setSize((s) => ({ ...s, w: Math.round(MIN_DP + pct * (MAX_DP - MIN_DP)) }));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => widthFromPointer(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, widthFromPointer]);

  // Arrow keys nudge, shift jumps — the control is a real slider, so it has to
  // be operable without a pointer. e2e/a11y.spec.ts runs axe over this page
  // with no allowlist.
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 100 : 8;
    const delta = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    setSize((s) => ({ ...s, w: clamp(s.w + delta, MIN_DP, MAX_DP) }));
  };

  /** Zone stops for the ruler's tinted background, as percentages. */
  const zones = useMemo(
    () =>
      CLASSES.map((c, i) => {
        const from = i === 0 ? MIN_DP : CLASSES[i - 1].max;
        const to = Math.min(c.max, MAX_DP);
        return { id: c.id, color: c.color, left: dpToPct(from) * 100, width: (dpToPct(to) - dpToPct(from)) * 100 };
      }),
    [],
  );

  if (!app) return null;

  const poster = size.w / size.h < 1 ? app.portrait : app.landscape;

  return (
    <section id="morph" className="border-t border-line bg-surface">
      <div className="section-y mx-auto max-w-6xl px-6">
        <p className="section-eyebrow mb-2">// one codebase</p>
        <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Resize the device, not the screenshot</h2>
        <p className="mb-8 max-w-2xl text-zinc-400">
          These are the real Kotlin Multiplatform builds, compiled to Wasm and served from this
          domain. Drag the width and the Compose layout re-flows at the same window size classes
          the code branches on.
        </p>

        {/* ── The lab shell ───────────────────────────────────────────────
            Rail, ruler and stage in ONE subtree, so full-viewport mode is a
            change of position on this element and not a second copy of the
            controls rendered somewhere else. React keeps the subtree — and
            therefore the <iframe> and its already-downloaded 14 MB of Wasm —
            mounted across the transition. */}
        <div
          className={
            full
              ? // `safe center` rather than plain `center`: when the controls plus the
                // device are taller than the viewport, ordinary centring pushes the
                // overflow off the TOP of a scroll container, where it cannot be
                // reached. Safe alignment falls back to flex-start in exactly that
                // case, so the rail stays reachable on a short window.
                "fixed inset-0 z-[60] flex flex-col [justify-content:safe_center] gap-3 overflow-y-auto bg-ink/98 p-4 backdrop-blur"
              : ""
          }
        >
        {/* ── The app rail ────────────────────────────────────────────────
            Each build in its own colour rather than four identical grey
            pills. The accent comes from the project's theme block, which is
            the same one its card and its detail page are drawn in, so the
            rail reads as a set of products instead of a set of tabs. */}
        <div className="mb-6 flex flex-wrap gap-2">
          {APPS.map((a) => {
            const active = a.slug === app.slug;
            return (
              <button
                key={a.slug}
                type="button"
                onClick={() => {
                  if (active) return;
                  setApp(a);
                  // A different build means a genuine reload; drop back to the
                  // poster so the boot line is honest about what is happening.
                  setBooted(false);
                }}
                aria-pressed={active}
                style={active ? { borderColor: a.accent, color: a.accent, background: `color-mix(in srgb, ${a.accent} 12%, transparent)` } : undefined}
                // `text-muted`, never text-zinc-500: the muted-on-dark tokens
                // were retired sitewide precisely because they fail AA contrast
                // (3.5–2.2:1), and e2e/a11y.spec.ts enforces color-contrast with
                // no allowlist.
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                  active ? "" : "border-line text-muted hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full transition"
                  style={{ background: a.accent, opacity: active ? 1 : 0.45 }}
                />
                {a.name}
              </button>
            );
          })}
        </div>

        {/* ── The width ruler ─────────────────────────────────────────────
            The control IS the demonstration. A row of preset chips can only
            assert that 600dp and 840dp are where things change; a ruler with
            those thresholds drawn on it, and a readout that flips class as
            you cross them, shows it. The presets survive as snap points
            because "show me a foldable" is still a reasonable thing to want. */}
        <div className="panel rounded-2xl border border-line bg-void/40 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono-os text-2xl font-bold tabular-nums" style={{ color: cls.color }}>
                {size.w}
                <span className="text-base font-normal text-muted">dp</span>
              </span>
              <span className="font-mono-os text-xs text-muted">× {size.h}dp</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                key={cls.id}
                className="font-mono-os rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                style={{ color: cls.color, borderColor: cls.color, background: `color-mix(in srgb, ${cls.color} 10%, transparent)` }}
              >
                {cls.label} · {cls.note}
              </span>
              {/* The escape hatch for the case the caption is otherwise stuck
                  apologising for: a 1280dp target on a 390dp phone is a third
                  of life size until the frame gets the whole window. */}
              <button
                type="button"
                onClick={() => setFull((v) => !v)}
                aria-pressed={full}
                title={full ? "Exit full screen (Esc)" : "Give the device the whole screen"}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-accent"
              >
                {full ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                <span className="hidden sm:inline">{full ? "Exit" : "Full screen"}</span>
              </button>
            </div>
          </div>

          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Device width in dp"
            aria-valuemin={MIN_DP}
            aria-valuemax={MAX_DP}
            aria-valuenow={size.w}
            aria-valuetext={`${size.w}dp, ${cls.label} window size class`}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging(true);
              widthFromPointer(e.clientX);
            }}
            className="relative h-16 cursor-ew-resize touch-none select-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* Zone bands: the size classes as territory, so the thresholds
                are visible before you go looking for them. */}
            <div className="absolute inset-x-0 top-1/2 flex h-2 -translate-y-1/2 overflow-hidden rounded-full">
              {zones.map((z) => (
                <span
                  key={z.id}
                  className="h-full"
                  style={{ width: `${z.width}%`, background: `color-mix(in srgb, ${z.color} 22%, transparent)` }}
                />
              ))}
            </div>
            {/* The two thresholds the framework actually switches on. */}
            {[600, 840].map((dp) => (
              <span
                key={dp}
                aria-hidden
                className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-zinc-500"
                style={{ left: `${dpToPct(dp) * 100}%` }}
              />
            ))}
            {/* Preset snap points, drawn on the ruler they belong to.
                SPANS, not buttons. This element is a `role="slider"` with its
                own tabIndex, and a <button> inside it is a nested interactive
                control — axe flags it `serious`, and e2e/a11y.spec.ts runs axe
                over this page with no allowlist. They stay clickable as a
                pointer shortcut; the keyboard route to the same presets is the
                real button row below, which is reachable and labelled. */}
            {FORMS.map((f) => (
              <span
                key={f.id}
                aria-hidden
                role="presentation"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  applyForm(f);
                }}
                title={`${f.label} — ${f.w}×${f.h}dp`}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-surface bg-zinc-500 transition hover:scale-125 hover:bg-zinc-200"
                style={{ left: `${dpToPct(f.w) * 100}%` }}
              />
            ))}
            {/* ── You are here ────────────────────────────────────────────
                The visitor's OWN window, marked on the same ruler. It costs
                one tick and it turns an abstract lesson about size classes
                into a fact about the screen they are holding — and the page
                they are reading is itself branching on that number, so the
                marker is evidence rather than decoration. Hidden when the
                viewport is off the end of the scale (an ultrawide desktop)
                rather than pinned misleadingly to the last pixel. */}
            {viewport.w >= MIN_DP && viewport.w <= MAX_DP && (
              <span
                className="pointer-events-none absolute flex flex-col items-center"
                style={{
                  left: `${dpToPct(viewport.w) * 100}%`,
                  // Below the bar, clear of the handle and the preset dots,
                  // which all sit on the centre line.
                  top: "calc(50% + 9px)",
                  transform: "translateX(-50%)",
                }}
                title={`Your window is ${viewport.w}dp — ${classOf(viewport.w).label}`}
              >
                <span aria-hidden className="h-3.5 w-px bg-zinc-400" />
                <span className="font-mono-os mt-0.5 whitespace-nowrap text-[9px] uppercase tracking-wider text-muted">
                  you · {viewport.w}
                </span>
              </span>
            )}

            {/* The handle. */}
            {/* No `-translate-*` utilities here. Tailwind v4 emits those as the
                standalone `translate` property, which COMPOSES with an inline
                `transform` rather than being overridden by it — the handle was
                centred twice and floated a full 28px above its own track. The
                inline transform does all of it. */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-ink shadow-lg transition-transform"
              style={{
                left: `${dpToPct(size.w) * 100}%`,
                borderColor: cls.color,
                transform: `translate(-50%, -50%) scale(${dragging ? 1.15 : 1})`,
              }}
            >
              <GripVertical size={13} style={{ color: cls.color }} />
            </span>
          </div>

          {/* Presets as words too. The dots on the ruler are precise but tiny,
              and "Foldable" is what someone is actually looking for. */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {FORMS.map((f) => {
              const active = activeForm?.id === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => applyForm(f)}
                  aria-pressed={active}
                  className={`font-mono-os rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:border-zinc-600 hover:text-zinc-200"
                  }`}
                >
                  {f.label}
                  {/* No `opacity-60` here. Fading the accent to 60% over its
                      own 10% tint measured 3.43:1 against a required 4.5:1 —
                      axe flagged all five of these. The dp number is the
                      informative half of the chip, so it keeps the chip's own
                      colour rather than being dimmed below legibility. */}
                  <span className="ml-1.5 font-normal">{f.w}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── The stage ───────────────────────────────────────────────────
            A fixed band so resizing doesn't shove the page around under the
            reader's cursor. The device is scaled into it, never squeezed:
            see the note at the top of this file for why that distinction is
            the whole point of the section. */}
        <div className="mt-6">
        <div
          ref={stageRef}
          className="relative flex items-center justify-center overflow-hidden"
          // Height follows the device instead of being a fixed tall band. The
          // band was there to stop the page jumping under the reader's cursor,
          // and the transition below does that job without leaving 300px of
          // empty stage under a TV scaled to 34% on a phone.
          style={{
            height: Math.max(200, Math.round(size.h * scale)),
            transition: dragging ? "none" : "height 400ms cubic-bezier(.22,1,.36,1)",
          }}
        >
          <div
            className="device relative shrink-0 overflow-hidden border border-line bg-void shadow-2xl"
            style={{
              width: size.w,
              height: size.h,
              borderRadius: radius,
              transform: `scale(${scale})`,
              // Scale from the middle so the frame stays centred in the stage
              // at every size, and skip the transition mid-drag — a 500ms ease
              // on every pointermove reads as lag rather than polish.
              transformOrigin: "center",
              transition: dragging ? "none" : "width 400ms cubic-bezier(.22,1,.36,1), height 400ms cubic-bezier(.22,1,.36,1), transform 400ms cubic-bezier(.22,1,.36,1), border-radius 400ms",
            }}
          >
            {/* FitImage, not a plain <img>: it letterboxes rather than crops
                once a capture is more than 20% off the frame's shape. Same
                component DeviceWall uses for the same reason, and its comment
                records the same bug landing there first ("PaymentsLab" cropped
                down to "mentsLab"). */}
            <FitImage
              src={poster}
              alt=""
              targetAspect={size.w / size.h}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
                painted ? "opacity-0" : "opacity-100"
              }`}
            />

            {booted && (
              <iframe
                ref={iframeRef}
                key={app.slug}
                src={app.url}
                title={`${app.name} — live web build`}
                // `pointer-lock` is not optional for the 3D builds. Pointer
                // Lock is DENIED outright inside an iframe unless the embedder
                // allows it, so without this a visitor can walk around
                // DEADLOCK but can never look around — the mouse simply never
                // gets captured, with no error anywhere.
                allow="fullscreen; pointer-lock"
                className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-700 ${
                  painted ? "opacity-100" : "opacity-0"
                }`}
              />
            )}

            {!booted && (
              <button
                type="button"
                onClick={() => setBooted(true)}
                // A flat scrim, not a bottom-up gradient. The gradient was
                // transparent exactly where this label sits, which was fine
                // while the poster was cropped to a dark edge and unreadable
                // once it started letterboxing a real capture into the middle
                // of the frame.
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 text-sm font-semibold text-zinc-100 transition hover:bg-ink/60 hover:text-accent"
                // The frame is scaled, so an un-scaled label would shrink with
                // it and become unreadable at 0.45. Counter-scaling keeps the
                // one piece of chrome the visitor has to READ at a fixed size.
                style={{ fontSize: `${clamp(14 / scale, 14, 34)}px` }}
              >
                <span
                  className="flex items-center justify-center rounded-full border border-accent/50 bg-ink/80 text-accent"
                  style={{ height: `${clamp(48 / scale, 48, 110)}px`, width: `${clamp(48 / scale, 48, 110)}px` }}
                >
                  <Play size={clamp(18 / scale, 18, 44)} />
                </span>
                Run {app.name} here
                <span className="font-normal opacity-70" style={{ fontSize: `${clamp(11 / scale, 11, 26)}px` }}>
                  ~14 MB Wasm · loads on click
                </span>
              </button>
            )}

            {booted && !painted && !gaveUp && (
              <div
                className="font-mono-os absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-10 text-accent/80"
                style={{ fontSize: `${clamp(12 / scale, 12, 28)}px` }}
              >
                <span className="boot-caret">▍</span> booting {app.name} — first load pulls the ~14&nbsp;MB Wasm…
              </div>
            )}

            {gaveUp && (
              <div
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-10 text-center text-muted"
                style={{ fontSize: `${clamp(12 / scale, 12, 28)}px` }}
              >
                The live build didn't start here — the capture above is the same screen.
              </div>
            )}
          </div>
        </div>
        </div>
        </div>

        <p className="kicker mt-4 text-center">
          {app.name} · {activeForm?.label ?? "custom"} · {size.w}×{size.h}dp · {cls.label}
          {scale < 0.99 && <span className="text-muted"> · shown at {Math.round(scale * 100)}%</span>}
        </p>

        {/* SurfaceWall (#surfaces) makes this exact claim again, further down
            the page, with its own device-frame grid — and the two used to have
            no link between them, so a visitor who saw one had no reason to
            know the other existed. This is the forward half of that pair;
            SurfaceWall carries the matching link back up. */}
        <p className="mt-3 text-center">
          <button
            type="button"
            onClick={() => goToSection("surfaces")}
            className="kicker-accent transition hover:opacity-80"
          >
            Same one codebase, across every route on this site →
          </button>
        </p>
      </div>
    </section>
  );
}
