import { useEffect, useRef, useState, type JSX } from "react";
import { PLACEMENTS } from "./worldData.ts";
import { ROOMS } from "../rooms.tsx";
import { telemetry } from "./telemetry.ts";
import { TERMINAL_WHEEL_SPEED } from "./craftPhysics.ts";

/** Top of the speed bar, m/s. Above the craft's terminal speed so the bar
 *  never pins. */
const GAUGE_MAX_SPEED = Math.ceil(TERMINAL_WHEEL_SPEED);

/**
 * Wayfinding, speed and boost — the HUD layer that turns a dark plane into a
 * place you can navigate.
 *
 * Everything here updates every animation frame from the `telemetry` singleton
 * and writes DIRECTLY to DOM style properties. No React state, no re-render:
 * a compass that re-rendered its parent at 60fps would drag World, Hud and
 * every memo boundary under them along with it, which is exactly the cost
 * telemetry.ts exists to avoid. React's only job here is to mount the nodes
 * once; after that these are hand-driven elements.
 */

// How much of the world's bearing range the compass strip spans, each side of
// centre. 90° means a room dead ahead sits centre, one directly left sits at
// the far left edge, and anything behind you clamps to an edge with an arrow.
const COMPASS_HALF_ARC = Math.PI / 2;

// Only the nearest few rooms get a marker — see the sort in the frame loop.
const COMPASS_MAX_MARKERS = 5;

// Row height and minimum horizontal gap used by the collision packing below.
const COMPASS_ROW_PX = 22;
const COMPASS_GAP_PX = 6;


type Marker = {
  to: string;
  label: string;
  tint: string;
  x: number;
  z: number;
  el: HTMLDivElement | null;
  distEl: HTMLSpanElement | null;
};

/** Signed shortest angle from `from` to `to`, in (-π, π]. */
function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * A bearing strip across the top of the screen with a marker per room —
 * tinted, labelled, and showing live distance. Markers slide as you turn, and
 * clamp to the edges (dimmed, with a chevron) when the room is behind you.
 *
 * This replaces guessing. The rooms are floating labels a few metres wide on a
 * ~100m map: without this you can drive for a minute without finding one, and
 * "wander until something appears" is not navigation.
 */
export function Compass(): JSX.Element {
  const markersRef = useRef<Marker[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  if (markersRef.current.length === 0) {
    markersRef.current = PLACEMENTS.map((p) => {
      const room = ROOMS.find((r) => r.to === p.to);
      return {
        to: p.to,
        label: room?.label ?? p.to,
        tint: room?.tint ?? "var(--color-signal)",
        x: p.position[0],
        z: p.position[2],
        el: null,
        distEl: null,
      };
    });
  }

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const width = rootRef.current?.clientWidth ?? 0;
      if (!width) return;

      // Measure everything, then show only the nearest few. All eight at once
      // collided into an unreadable pile the moment two rooms shared a bearing
      // — which they do constantly, since the map is deliberately mirrored
      // east/west. Nearest-first is also the right editorial call: the compass
      // should answer "what can I get to from here", not "list the map".
      const measured = markersRef.current.map((m) => {
        const dx = m.x - telemetry.x;
        const dz = m.z - telemetry.z;
        return {
          m,
          distance: Math.hypot(dx, dz),
          delta: angleDelta(telemetry.heading, Math.atan2(dx, dz)),
        };
      });
      measured.sort((a, b) => a.distance - b.distance);

      const visible: { m: Marker; offset: number; behind: boolean; distance: number }[] = [];
      for (let i = 0; i < measured.length; i++) {
        const { m, distance, delta } = measured[i];
        if (!m.el) continue;
        if (i >= COMPASS_MAX_MARKERS) {
          m.el.style.display = "none";
          continue;
        }
        m.el.style.display = "";
        const clamped = Math.max(-COMPASS_HALF_ARC, Math.min(COMPASS_HALF_ARC, delta));
        visible.push({
          m,
          offset: (clamped / COMPASS_HALF_ARC) * (width / 2),
          behind: Math.abs(delta) > COMPASS_HALF_ARC,
          distance,
        });
      }

      // Pack into rows by measured width, left to right. Alternating rows by
      // index wasn't enough: the map is mirrored east/west, so pairs of rooms
      // routinely share a bearing AND a row parity, and the labels landed on
      // the same pixels. This walks them in screen order and drops a marker to
      // the next row only when it would actually collide with the one before
      // it — so the common case stays a single tidy line.
      visible.sort((a, b) => a.offset - b.offset);
      const rowRightEdge: number[] = [];
      for (const v of visible) {
        const halfW = v.m.el!.offsetWidth / 2;
        const left = v.offset - halfW;
        let row = rowRightEdge.findIndex((edge) => left > edge + COMPASS_GAP_PX);
        if (row === -1) {
          row = rowRightEdge.length;
          rowRightEdge.push(0);
        }
        rowRightEdge[row] = v.offset + halfW;
        v.m.el!.style.transform = `translate(${v.offset}px, ${row * COMPASS_ROW_PX}px) translateX(-50%)`;
        // Behind-you markers stay visible but recede, so the strip reads as
        // "everything near me, oriented" rather than "whatever I'm facing".
        v.m.el!.style.opacity = v.behind ? "0.4" : "1";
        if (v.m.distEl) v.m.distEl.textContent = `${Math.round(v.distance)}m`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none relative mx-auto h-16 w-full max-w-xl"
    >
      {markersRef.current.map((m, i) => (
        <div
          key={m.to}
          ref={(el) => {
            markersRef.current[i].el = el;
          }}
          className="absolute left-1/2 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-widest backdrop-blur transition-opacity"
          style={{
            borderColor: `${m.tint}55`,
            color: m.tint,
            background: "rgba(10,13,12,0.7)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.tint }} />
          {m.label}
          <span
            ref={(el) => {
              markersRef.current[i].distEl = el;
            }}
            className="text-muted"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Speed readout and boost tank.
 *
 * One panel for everything the driver needs at a glance: speed, boost, how
 * much of the world is left to find, and the location lens. It replaced four
 * separate floating pills, which is what happens when each feature adds its own
 * readout and nothing ever asks whether the corner is full.
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
  const odoRef = useRef<HTMLSpanElement>(null);
  const accRef = useRef<HTMLSpanElement>(null);
  const fixRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const speed = Math.abs(telemetry.speed);
      const rounded = Math.round(speed);
      if (rounded !== shown && numRef.current) {
        shown = rounded;
        numRef.current.textContent = String(rounded);
      }
      if (barRef.current) {
        barRef.current.style.width = `${Math.min(100, (speed / GAUGE_MAX_SPEED) * 100)}%`;
        // var(), not a hex: these are CSS values, so the token can be handed
        // straight over and a theme change is picked up without a re-render.
        // Green in the top third of the range — there is no launch threshold to
        // mark any more, so the bar just reads "going quickly".
        barRef.current.style.background =
          speed >= GAUGE_MAX_SPEED * 0.66 ? "var(--color-signal)" : "var(--color-probe)";
      }
      if (boostRef.current) {
        boostRef.current.style.width = `${telemetry.boost * 100}%`;
        boostRef.current.style.opacity = telemetry.boosting ? "1" : "0.55";
      }
      if (accRef.current) {
        accRef.current.textContent =
          telemetry.rawError === 0
            ? "— keep driving"
            : `${telemetry.rawError.toFixed(1)}m → ${telemetry.fusedError.toFixed(1)}m`;
      }
      if (fixRef.current) {
        // The one line of HUD copy the design doc calls for, in the
        // instrument that is already about GPS: telemetry.resolvedFraction
        // is written every frame by ResolveField.tsx from resolve.ts's own
        // ratchet, so this climbs from the very first stamped cell and never
        // drops within a session.
        const pct = Math.round(telemetry.resolvedFraction * 100);
        fixRef.current.textContent = pct >= 100 ? `${pct}% · resolved` : `${pct}% · drive to resolve`;
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
      {/* Progress, then the Mileway lens. One panel rather than four floating
          pills: the HUD had a mode chip, a rooms counter, an artifacts counter
          and a gauge block all competing for the same corner, which is three
          more surfaces than a hub needs. */}
      {rooms !== undefined && totalRooms !== undefined && (
        <div className="mt-1.5 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
          <span>rooms</span>
          <span>
            <span className="text-accent">{rooms}</span> / {totalRooms}
          </span>
        </div>
      )}
      {collected !== undefined && artifactTotal !== undefined && (
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
          <span>found</span>
          <span>
            <span className="text-[var(--color-signal)]">{collected}</span> / {artifactTotal}
          </span>
        </div>
      )}
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
        <span>trip</span>
        <span ref={odoRef} className="text-zinc-200">
          0 m
        </span>
      </div>
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
        <span title="Mean positional error: the raw GPS fix versus the dead-reckoned track">gps err</span>
        <span ref={accRef} className="text-[var(--color-signal)]">
          0.0m → 0.0m
        </span>
      </div>
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
        <span title="Share of the city's resolve grid driven through">fix</span>
        <span ref={fixRef} className="text-accent">
          0% · drive to resolve
        </span>
      </div>

    </div>
  );
}

const SEEN_KEY = "playground:onboarded";

/**
 * The first-run card: what the controls are, and what the world wants from you.
 *
 * Not decoration. Before this, a visitor arrived in a dark 3D scene with a car
 * they had no reason to know was drivable and no hint that Enter opens a room
 * — the entire design was discoverable only by accident. It shows once,
 * remembers, and any driving key dismisses it, so a returning visitor never
 * sees it again.
 */
export function Onboarding(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    const dismiss = () => {
      setDismissed(true);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* private browsing — it just shows again next time */
      }
    };
    window.addEventListener("keydown", dismiss, { once: true });
    window.addEventListener("pointerdown", dismiss, { once: true });
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-card/95 p-6 text-center backdrop-blur">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent/70">// the playground</p>
        <h2 className="font-display mt-2 text-2xl font-bold">Drive it.</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Nothing here exists until you drive it. North is 2017, south is now — the city resolves
          out of the dust as you go. Eight rooms wait down the road; drive to one and hold still to
          go in.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-left font-mono text-[11px] text-muted">
          {[
            ["W A S D", "drive"],
            ["shift", "boost"],
            ["enter", "enter a room"],
            ["R", "recover"],
            ["esc", "release controls"],
            ["space", "brake"],
          ].map(([key, what]) => (
            // dt/dd inside the wrapping div, not kbd/span. A <dl> may group
            // its children in divs, but each group still has to be a real
            // term/description pair — axe flags anything else as a serious
            // violation, and /playground is covered by e2e/a11y.spec.ts.
            <div key={key} className="flex items-center gap-2">
              <dt>
                <kbd className="rounded border border-line px-1.5 py-0.5 text-zinc-300">{key}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-muted">
          press anything to start · List view for the plain grid
        </p>
      </div>
    </div>
  );
}

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
