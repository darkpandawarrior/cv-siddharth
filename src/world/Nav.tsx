import { useEffect, useRef, useState, type JSX } from "react";
import { PLACEMENTS, TERRAIN } from "./worldData.ts";
import { ROOMS } from "../rooms.tsx";
import { telemetry } from "./telemetry.ts";
import { TERMINAL_WHEEL_SPEED } from "./craftPhysics.ts";
import { angleDelta, bearingTo } from "./autopilot.ts";

/** Top of the speed bar, m/s. Above the craft's terminal speed so the bar
 *  never pins. */
const GAUGE_MAX_SPEED = Math.ceil(TERMINAL_WHEEL_SPEED);

/**
 * Wayfinding and instruments — the HUD layer that turns a dark plane into a
 * place you can navigate.
 *
 * Everything here updates every animation frame from the `telemetry` singleton
 * and writes DIRECTLY to DOM style properties. No React state, no re-render:
 * a compass that re-rendered its parent at 60fps would drag World, Hud and
 * every memo boundary under them along with it, which is exactly the cost
 * telemetry.ts exists to avoid. React's only job here is to mount the nodes
 * once; after that these are hand-driven elements.
 *
 * WHAT CHANGED, and why. This file used to render a bearing strip carrying the
 * five nearest rooms — tinted chips, packed into up to three rows because the
 * map is mirrored east/west and they collided constantly — above a panel of
 * six readouts (speed, boost, rooms, artifacts, trip, GPS error, resolve
 * percentage). Together with the world's own floating labels that put roughly
 * two dozen pieces of text on screen at once, none of which answered the only
 * question a first-time visitor actually has: where am I supposed to go?
 *
 * So the strip became ONE waypoint — the next stop, its distance, and an arrow
 * — and the panel lost the three readouts that were instrumentation rather
 * than navigation (one of which, the odometer, had been wired to a ref that was
 * never written and displayed a permanent "0 m"). The rooms you aren't heading
 * for moved to a minimap, where being eight dots on a road is legible in a way
 * eight overlapping labels never were.
 */

// ---------------------------------------------------------------------------
// Waypoint

export type WaypointTarget = { label: string; tint: string; x: number; z: number };

/**
 * The next stop: name, live distance, and an arrow pointing at it.
 *
 * The arrow is the part that matters. Distance alone tells a driver they are
 * 26m from a room and nothing about which way to turn, which is precisely the
 * state the old compass strip left people in once two chips shared a bearing.
 *
 * ROTATION SIGN: `angleDelta` is positive when the target needs a heading
 * increase, and heading increases toward world +X — which is the driver's LEFT
 * (right = forward × up = -X; see autopilot.ts). CSS rotation is clockwise-
 * positive, so a target to the left is a NEGATIVE css rotation. Hence the minus.
 */
export function Waypoint({
  target,
  auto,
}: {
  target: WaypointTarget | null;
  auto: boolean;
}): JSX.Element | null {
  const arrowRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!target) return;
    let raf = 0;
    let shown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const distance = Math.round(Math.hypot(target.x - telemetry.x, target.z - telemetry.z));
      if (distance !== shown && distRef.current) {
        shown = distance;
        distRef.current.textContent = `${distance}m`;
      }
      if (arrowRef.current) {
        const delta = angleDelta(telemetry.heading, bearingTo(telemetry, target));
        arrowRef.current.style.transform = `rotate(${-delta}rad)`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (!target) return null;

  return (
    <div className="pointer-events-none mx-auto flex justify-center">
      <div
        className="flex items-center gap-3 rounded-full border px-4 py-2 backdrop-blur"
        style={{ borderColor: `${target.tint}55`, background: "rgba(10,13,12,0.78)" }}
      >
        <span
          ref={arrowRef}
          aria-hidden
          className="flex h-5 w-5 items-center justify-center"
          style={{ color: target.tint, transition: "transform 90ms linear" }}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V5M12 5l-6 6M12 5l6 6" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            {auto ? "auto · driving to" : "next stop"}
          </span>
          <span className="font-display text-sm font-bold" style={{ color: target.tint }}>
            {target.label}
          </span>
        </span>
        <span ref={distRef} className="font-mono text-xs tabular-nums text-zinc-300">
          0m
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimap

// The slab, in world metres. The map is the whole world at once rather than a
// radar window around the craft: it is a 56m-wide, 168m-long boulevard, so the
// entire thing fits in a strip the size of a phone's status bar and a visitor
// can see where they are in ten years of timeline without any panning logic.
const { halfWidth: MAP_HALF_WIDTH, z0: MAP_Z0, z1: MAP_Z1 } = TERRAIN.mainland;
const MAP_PAD = 4; // metres of margin so an edge-hugging craft is still drawn

/**
 * The whole boulevard, top-down, with your car on it.
 *
 * SVG coordinates ARE world coordinates here (viewBox is set in metres), which
 * removes the entire class of scale/offset bug that a hand-written projection
 * invites. World +X is svg +x and world +Z is svg +y, so north (2017) is at the
 * top and now is at the bottom — the same orientation the ground's own era
 * colour uses.
 *
 * The craft marker rotates by NEGATIVE heading: heading is measured from +Z
 * toward +X, which in this frame is from svg +y toward svg +x — counter-
 * clockwise — while svg's rotate() is clockwise-positive.
 */
export function Minimap({ visited, targetTo }: { visited: ReadonlySet<string>; targetTo: string | null }): JSX.Element {
  const craftRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!craftRef.current) return;
      const heading = (telemetry.heading * 180) / Math.PI;
      craftRef.current.setAttribute(
        "transform",
        `translate(${telemetry.x.toFixed(2)} ${telemetry.z.toFixed(2)}) rotate(${(-heading).toFixed(1)})`,
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none flex flex-col items-center gap-1">
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted">2017</span>
      <svg
        viewBox={`${-MAP_HALF_WIDTH - MAP_PAD} ${MAP_Z0 - MAP_PAD} ${(MAP_HALF_WIDTH + MAP_PAD) * 2} ${MAP_Z1 - MAP_Z0 + MAP_PAD * 2}`}
        className="h-[136px] w-[52px] rounded-lg border border-line bg-void/70 backdrop-blur"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* The slab itself. */}
        <rect
          x={-MAP_HALF_WIDTH}
          y={MAP_Z0}
          width={MAP_HALF_WIDTH * 2}
          height={MAP_Z1 - MAP_Z0}
          rx="3"
          className="fill-card/60 stroke-line"
          vectorEffect="non-scaling-stroke"
        />
        {PLACEMENTS.map((p) => {
          const room = ROOMS.find((r) => r.to === p.to);
          const tint = room?.tint ?? "var(--color-signal)";
          const seen = visited.has(p.to);
          const isTarget = targetTo === p.to;
          return (
            <g key={p.to}>
              {isTarget && (
                // A halo, not a bigger dot: the target has to be findable at a
                // glance in a 52px-wide map without changing the dot's meaning.
                <circle cx={p.position[0]} cy={p.position[2]} r="7" fill="none" stroke={tint} strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
              )}
              <circle
                cx={p.position[0]}
                cy={p.position[2]}
                r="3.4"
                fill={seen ? tint : "transparent"}
                fillOpacity={seen ? 0.9 : 0}
                stroke={tint}
                strokeOpacity={seen ? 1 : 0.65}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {/* The craft. Apex at +y because heading 0 faces world +Z, which is
            down the screen in this frame. */}
        <g ref={craftRef}>
          <polygon points="0,5 -3.6,-3.4 3.6,-3.4" className="fill-accent" />
        </g>
      </svg>
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted">now</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gauges

/**
 * Speed, boost, and how much of the world is left to find.
 *
 * Four rows, down from seven. What went: the odometer (wired to a ref nothing
 * ever wrote — it read "0 m" permanently), and the raw-vs-fused GPS error pair,
 * which is a genuinely interesting number presented as an unreadable one. The
 * dead-reckoning demo it belongs to is DRAWN — Trail.tsx paints the raw track
 * in orange and the fused one in green, right behind the car — so the readout
 * was labelling a thing you can already see with a units-and-arrows string that
 * needed a paragraph to explain.
 */
export function Gauges({
  collected,
  artifactTotal,
  rooms,
  totalRooms,
}: {
  collected?: number;
  artifactTotal?: number;
  rooms?: number;
  totalRooms?: number;
}): JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const boostRef = useRef<HTMLDivElement>(null);
  const resolveRef = useRef<HTMLDivElement>(null);
  const resolveNumRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let shownSpeed = -1;
    let shownResolve = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const speed = Math.abs(telemetry.speed);
      const rounded = Math.round(speed);
      if (rounded !== shownSpeed && numRef.current) {
        shownSpeed = rounded;
        numRef.current.textContent = String(rounded);
      }
      if (barRef.current) {
        barRef.current.style.width = `${Math.min(100, (speed / GAUGE_MAX_SPEED) * 100)}%`;
        // var(), not a hex: these are CSS values, so the token can be handed
        // straight over and a theme change is picked up without a re-render.
        barRef.current.style.background =
          speed >= GAUGE_MAX_SPEED * 0.66 ? "var(--color-signal)" : "var(--color-probe)";
      }
      if (boostRef.current) {
        boostRef.current.style.width = `${telemetry.boost * 100}%`;
        boostRef.current.style.opacity = telemetry.boosting ? "1" : "0.55";
      }
      // The city's resolve grid, as a bar rather than the old "FIX 81% · DRIVE
      // TO RESOLVE" line. Same number; it just no longer needs the visitor to
      // already know what a fix is.
      const pct = Math.round(telemetry.resolvedFraction * 100);
      if (pct !== shownResolve) {
        shownResolve = pct;
        if (resolveRef.current) resolveRef.current.style.width = `${pct}%`;
        if (resolveNumRef.current) resolveNumRef.current.textContent = `${pct}%`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none w-44 rounded-xl border border-line bg-card/80 px-3 py-2 backdrop-blur"
    >
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
        <span>
          <span ref={numRef} className="text-base text-zinc-200">
            0
          </span>{" "}
          m/s
        </span>
        <span>boost</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-void/80">
        <div ref={barRef} className="h-full w-0 rounded-full transition-[background] duration-200" />
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-void/80">
        <div ref={boostRef} className="h-full w-full rounded-full bg-[var(--color-warn)]" />
      </div>

      {rooms !== undefined && totalRooms !== undefined && (
        <div className="mt-1.5 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
          <span>rooms opened</span>
          <span>
            <span className="text-accent">{rooms}</span> / {totalRooms}
          </span>
        </div>
      )}
      {collected !== undefined && artifactTotal !== undefined && (
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
          <span>things found</span>
          <span>
            <span className="text-[var(--color-signal)]">{collected}</span> / {artifactTotal}
          </span>
        </div>
      )}
      <div className="mt-1.5 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
        <span>city drawn</span>
        <span ref={resolveNumRef} className="text-accent">
          0%
        </span>
      </div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-void/80">
        <div ref={resolveRef} className="h-full w-0 rounded-full bg-accent/70 transition-[width] duration-300" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding

const SEEN_KEY = "playground:onboarded";

/**
 * The first-run card — and the one screen that decides whether this world is
 * usable by someone who did not come here to play a driving game.
 *
 * It used to be a dismiss-on-anything card listing six keybindings. That asks
 * every visitor to opt into learning controls before they are allowed to see
 * anything, which for a portfolio hub is exactly backwards: most people want
 * the rooms, not the car. So the card now offers the two real choices as
 * buttons — watch it drive itself, or drive it — and the keys are a footnote
 * for the people who picked the second one.
 *
 * It no longer dismisses on any keypress either. That behaviour meant the card
 * vanished the instant someone leaned on W, before they had read the sentence
 * that told them what the world wanted; the two buttons (and Escape) are the
 * only ways out, and the choice is remembered.
 */
export function Onboarding({ onTour }: { onTour: () => void }): JSX.Element | null {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = (tour: boolean) => {
    setDismissed(true);
    if (tour) onTour();
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private browsing — it just shows again next time */
    }
  };

  useEffect(() => {
    if (dismissed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss is stable enough; only `dismissed` gates the listener
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-card/95 p-6 text-center backdrop-blur">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent/70">// the playground</p>
        <h2 className="font-display mt-2 text-2xl font-bold">Eight rooms, one road.</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Every interactive thing on this site is a building on this street, and the street is a
          timeline — north is 2017, south is now. The city draws itself as you drive it.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => dismiss(true)}
            className="flex-1 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-accent-dim"
          >
            Drive me there
          </button>
          <button
            type="button"
            onClick={() => dismiss(false)}
            className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-accent hover:text-accent"
          >
            I'll drive
          </button>
        </div>
        <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted">
          <kbd className="rounded border border-line px-1 py-0.5 text-zinc-300">W A S D</kbd> drive ·{" "}
          <kbd className="rounded border border-line px-1 py-0.5 text-zinc-300">shift</kbd> boost ·{" "}
          <kbd className="rounded border border-line px-1 py-0.5 text-zinc-300">enter</kbd> go in ·{" "}
          <kbd className="rounded border border-line px-1 py-0.5 text-zinc-300">T</kbd> auto ·{" "}
          <kbd className="rounded border border-line px-1 py-0.5 text-zinc-300">R</kbd> unstick
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted">
          or take the plain grid — List view, bottom left
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices

export type Toast = { id: string; title: string; detail: string; tint: string; kind: "find" | "unlock" };

/**
 * Pickup and milestone notices.
 *
 * Bottom-centre rather than a corner, and one at a time: this is the only
 * moment the world hands a visitor a real fact from the CV, so it gets the
 * screen position a subtitle would. Auto-dismissed by World.tsx on a timer —
 * this component only draws.
 *
 * `role="status"` with aria-live: the canvas is aria-hidden, so without this a
 * screen-reader user driving the world would collect things and be told
 * nothing at all.
 */
export function Toasts({ items }: { items: Toast[] }): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex w-full flex-col items-center gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="hud-toast pointer-events-none flex max-w-sm items-center gap-3 rounded-2xl border bg-card/95 px-4 py-2.5 backdrop-blur"
          style={{ borderColor: `${t.tint}66` }}
        >
          <span
            className="font-mono text-[9px] uppercase tracking-[0.2em]"
            style={{ color: t.tint }}
          >
            {t.kind === "find" ? "found" : "unlocked"}
          </span>
          <span className="flex flex-col">
            <span className="font-display text-sm font-bold" style={{ color: t.tint }}>
              {t.title}
            </span>
            <span className="text-[11px] leading-snug text-zinc-400">{t.detail}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The stuck notice.
 *
 * Being upside down was previously silent: the craft stopped responding, an
 * unexplained 1.5s passed, and it teleported. Two of the three complaints about
 * this world being "difficult" were really this — a failure state with no
 * feedback and no visible way out. Now it names the state and the key, and the
 * auto-recovery behind it is faster.
 *
 * Driven from telemetry in its own rAF loop like the rest of this file, so it
 * costs no React renders while you are driving normally.
 */
export function StuckNotice(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!ref.current || telemetry.stuck === shown) return;
      shown = telemetry.stuck;
      ref.current.style.display = shown ? "" : "none";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      style={{ display: "none" }}
      className="pointer-events-none rounded-xl border border-[var(--color-warn)]/50 bg-card/90 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-widest text-muted backdrop-blur"
    >
      upside down — <span className="text-[var(--color-warn)]">R</span> to recover
    </div>
  );
}
