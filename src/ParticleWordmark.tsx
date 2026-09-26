import { useEffect, useRef } from "react";
import { Reveal } from "./Reveal.tsx";

/**
 * The Particle Forge — a cursor-reactive particle swarm that assembles the
 * wordmark, scatters away from the pointer, and springs back into shape.
 *
 * A nod to how the rest of the site is built: everything here is physics on an
 * HTML5 canvas. Each particle runs a tiny simulation — a spring pulling it to
 * its target glyph pixel (Hooke's law), an inverse-square repulsion from the
 * cursor, and velocity damping. Sample the wordmark's pixels, hand each sample
 * to a particle, integrate every frame.
 *
 * Built to the same rules as the Lab Bench canvases: HiDPI-aware, paused when
 * scrolled off-screen (IntersectionObserver), and a static render for anyone
 * who asked for reduced motion.
 */

// CAL-1 channels — measured/settled amber, unresolved/baseline cyan.
const CHANNEL_A = { r: 0xf2, g: 0xa1, b: 0x3d }; // #f2a13d
const CHANNEL_B = { r: 0x4f, g: 0xd6, b: 0xe0 }; // #4fd6e0

type Particle = {
  x: number;
  y: number;
  tx: number; // target (glyph) position
  ty: number;
  vx: number;
  vy: number;
};

/** Rasterize the wordmark to an offscreen canvas and return its lit pixels as
 *  target points, sampled on a grid whose step scales with the canvas size. */
function sampleWordmark(width: number, height: number): { points: { x: number; y: number }[]; step: number } {
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const ctx = off.getContext("2d");
  if (!ctx) return { points: [], step: 6 };

  // Two stacked lines: the wordmark, then a smaller tagline.
  const unit = Math.min(width / 12, height / 3.4);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Denser sampling on small canvases, sparser on large ones — keeps the
  // particle budget roughly constant regardless of viewport width.
  const step = width > 900 ? 6 : width > 560 ? 5 : 4;

  /** Draw one line alone, sample it at its own step, then clear — so a small
   *  line can be sampled finer than a big one without either stealing the
   *  other's pixels off one shared canvas. */
  const sampleLine = (draw: () => void, lineStep: number) => {
    ctx.clearRect(0, 0, width, height);
    draw();
    const { data } = ctx.getImageData(0, 0, width, height);
    const points: { x: number; y: number }[] = [];
    for (let y = 0; y < height; y += lineStep) {
      for (let x = 0; x < width; x += lineStep) {
        // alpha channel of this pixel
        if (data[(y * width + x) * 4 + 3] > 128) points.push({ x, y });
      }
    }
    return points;
  };

  const headline = sampleLine(() => {
    ctx.font = `700 ${unit}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText("sid.android", width / 2, height * 0.42);
  }, step);

  /* forge-tagline-illegible: "prototype → platform" is the room's and the
   * site's thesis, and it rendered as an unreadable smear of dots — glyphs
   * drawn at unit*0.28 (roughly a third the headline's height) but sampled
   * at the SAME 4-6px grid the much larger headline uses. A grid that coarse
   * only resolves shapes a few times its own size; fine print through it
   * comes out as noise. Both halves of the actual cause, fixed together:
   * bigger glyphs (0.28 → 0.4) AND a dedicated, finer sampling pass. */
  const tagline = sampleLine(() => {
    ctx.font = `600 ${unit * 0.4}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText("prototype → platform", width / 2, height * 0.72);
  }, Math.max(2, Math.round(step / 2)));

  return { points: [...headline, ...tagline], step };
}

/* ── Topology targets (idea-atlas CRAFT-6, forge topology morphs) ────────
 *
 * Three closed surfaces, standard parametrisations, pure math, no data: a
 * Mobius strip, a trefoil knot and a Klein bottle (the figure-8 immersion).
 * Each is built only from sin/cos of finite inputs, so every point they
 * produce is finite by construction, no division, no sqrt of a negative,
 * no log. Sampled the same way sampleWordmark() samples the glyphs, so they
 * drop into the same spring-to-target particle system as an alternate
 * target set, cross-faded in only while the forge sits idle.
 */

type Point3 = { x: number; y: number; z: number };

function mobiusPoint(u: number, v: number): Point3 {
  const half = u / 2;
  const r = 1 + v * Math.cos(half);
  return { x: r * Math.cos(u), y: r * Math.sin(u), z: v * Math.sin(half) };
}

function trefoilPoint(t: number): Point3 {
  return {
    x: Math.sin(t) + 2 * Math.sin(2 * t),
    y: Math.cos(t) - 2 * Math.cos(2 * t),
    z: -Math.sin(3 * t),
  };
}

/** Figure-8 immersion of the Klein bottle, the standard closed-form one
 *  (a = 2). No division anywhere, so it is finite for every real u, v. */
function kleinPoint(u: number, v: number): Point3 {
  const a = 2;
  const half = u / 2;
  const r = a + Math.cos(half) * Math.sin(v) - Math.sin(half) * Math.sin(2 * v);
  return {
    x: r * Math.cos(u),
    y: r * Math.sin(u),
    z: Math.sin(half) * Math.sin(v) + Math.cos(half) * Math.sin(2 * v),
  };
}

/** Samples a 2-parameter surface on a roughly square grid so `count`
 *  particles spread across it, padding the tail if `count` isn't a perfect
 *  square (a resize can ask for any number). */
function sampleSurface(
  fn: (u: number, v: number) => Point3,
  count: number,
  uMax: number,
  vRange: readonly [number, number],
): Point3[] {
  const cols = Math.max(1, Math.round(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const [vMin, vMax] = vRange;
  const pts: Point3[] = [];
  for (let i = 0; i < rows && pts.length < count; i++) {
    const v = vMin + (vMax - vMin) * (rows > 1 ? i / (rows - 1) : 0);
    for (let j = 0; j < cols && pts.length < count; j++) {
      const u = uMax * (cols > 1 ? j / (cols - 1) : 0);
      pts.push(fn(u, v));
    }
  }
  while (pts.length < count) pts.push(pts[pts.length - 1] ?? fn(0, vMin));
  return pts;
}

/** Samples a 1-parameter curve (the trefoil): densifying past its own point
 *  count just traces the same closed loop again, which is the correct look
 *  for a knot made of particles, not a bug. */
function sampleCurve(fn: (t: number) => Point3, count: number): Point3[] {
  const pts: Point3[] = [];
  for (let i = 0; i < count; i++) pts.push(fn((i / Math.max(1, count)) * Math.PI * 2));
  return pts;
}

/** Fixed three-quarter view, orthographic. No continuous rotation: the
 *  spring-to-target physics is already the "morph", a moving target on top
 *  of that would fight the settle-colour read (CAL-1) for no visual gain. */
function projectTopology(p: Point3, scale: number, cx: number, cy: number): { x: number; y: number } {
  const rotY = 0.6;
  const rotX = 0.35;
  const x1 = p.x * Math.cos(rotY) + p.z * Math.sin(rotY);
  const z1 = -p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
  const y1 = p.y * Math.cos(rotX) - z1 * Math.sin(rotX);
  return { x: cx + x1 * scale, y: cy + y1 * scale };
}

type TopologyKind = "mobius" | "trefoil" | "klein";
const TOPOLOGY_ORDER: readonly TopologyKind[] = ["mobius", "trefoil", "klein"];
// Raw coordinate magnitude of each parametrisation above, used only to
// normalise it to roughly a unit sphere before the shared `scale` below.
const TOPOLOGY_NORMALISE: Record<TopologyKind, number> = { mobius: 1.8, trefoil: 3.2, klein: 4.2 };

function topologyPoints(kind: TopologyKind, count: number, width: number, height: number): { x: number; y: number }[] {
  const raw =
    kind === "mobius"
      ? sampleSurface(mobiusPoint, count, Math.PI * 2, [-0.6, 0.6])
      : kind === "trefoil"
        ? sampleCurve(trefoilPoint, count)
        : sampleSurface(kleinPoint, count, Math.PI * 2, [0, Math.PI * 2]);
  const scale = (Math.min(width, height) * 0.34) / TOPOLOGY_NORMALISE[kind];
  const cx = width / 2;
  const cy = height * 0.52;
  return raw.map((p) => projectTopology(p, scale, cx, cy));
}

const IDLE_MS = 6000; // no pointer activity for this long before the first morph
const SHAPE_HOLD_MS = 4200; // how long each shape (and the wordmark) is shown mid-cycle

export function ParticleWordmark() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    // Pointer in CSS pixels; parked far off-canvas until the cursor arrives.
    const pointer = { x: -9999, y: -9999, active: false };

    // Idle-morph state (CRAFT-6): the wordmark's own target points, and which
    // alternate target the particles currently spring toward.
    let wordmarkPoints: { x: number; y: number }[] = [];
    let shapeState: "wordmark" | TopologyKind = "wordmark";
    let shapeChangedAt = performance.now();
    let lastInteraction = performance.now();

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { points } = sampleWordmark(width, height);
      wordmarkPoints = points;
      shapeState = "wordmark";
      shapeChangedAt = performance.now();
      lastInteraction = performance.now();
      particles = points.map((p) => {
        // Reuse a particle's current position on resize so it glides to the
        // new layout instead of teleporting; fresh ones fly in from a random
        // scatter for the assembling-into-shape reveal.
        const seedX = Math.random() * width;
        const seedY = Math.random() * height;
        return { x: seedX, y: seedY, tx: p.x, ty: p.y, vx: 0, vy: 0 };
      });
    };
    build();

    // Reassigns every particle's target in place (same count throughout:
    // topology shapes resample themselves to fit whatever the wordmark's own
    // pixel-sampling produced), so the existing spring physics IS the morph;
    // no second particle system or alpha cross-fade needed.
    const setShape = (next: "wordmark" | TopologyKind) => {
      if (next === shapeState) return;
      shapeState = next;
      shapeChangedAt = performance.now();
      const targets = next === "wordmark" ? wordmarkPoints : topologyPoints(next, particles.length, width, height);
      for (let i = 0; i < particles.length && i < targets.length; i++) {
        particles[i].tx = targets[i].x;
        particles[i].ty = targets[i].y;
      }
    };

    // settle: 0 = still scattered (baseline cyan), 1 = on target (measured
    // amber) — driven live by distance-to-target, not a fixed spawn-time mix,
    // so colour expresses the spring's own convergence.
    const colorOf = (settle: number, alpha: number) => {
      const r = Math.round(CHANNEL_B.r + (CHANNEL_A.r - CHANNEL_B.r) * settle);
      const g = Math.round(CHANNEL_B.g + (CHANNEL_A.g - CHANNEL_B.g) * settle);
      const b = Math.round(CHANNEL_B.b + (CHANNEL_A.b - CHANNEL_B.b) * settle);
      return `rgba(${r},${g},${b},${alpha})`;
    };

    // Static render for reduced motion: particles sit on their targets, so
    // distance-to-target is 0 — settle = 1, the whole wordmark in solid
    // resolved amber.
    if (reduced) {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.fillStyle = colorOf(1, 0.9);
        ctx.fillRect(p.tx, p.ty, 1.6, 1.6);
      }
      const ro = new ResizeObserver(() => {
        build();
        ctx.clearRect(0, 0, width, height);
        for (const p of particles) {
          ctx.fillStyle = colorOf(1, 0.9);
          ctx.fillRect(p.tx, p.ty, 1.6, 1.6);
        }
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    const REPEL = 34; // px radius of the cursor's influence
    const REPEL2 = REPEL * REPEL;

    const step = () => {
      // Idle-morph cycle: no pointer activity for IDLE_MS swaps the wordmark
      // for the first topology target; each shape holds for SHAPE_HOLD_MS
      // before cycling to the next. Any interaction snaps straight back to
      // the wordmark and restarts the idle clock.
      const now = performance.now();
      const idleFor = now - lastInteraction;
      if (shapeState === "wordmark") {
        if (idleFor > IDLE_MS) setShape(TOPOLOGY_ORDER[0]);
      } else if (now - shapeChangedAt > SHAPE_HOLD_MS) {
        const i = TOPOLOGY_ORDER.indexOf(shapeState);
        setShape(TOPOLOGY_ORDER[(i + 1) % TOPOLOGY_ORDER.length]);
      }

      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        // Spring toward the glyph target (Hooke's law) + damping.
        p.vx += (p.tx - p.x) * 0.045;
        p.vy += (p.ty - p.y) * 0.045;

        // Inverse-ish repulsion from the pointer — the swarm parts around it.
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < REPEL2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const force = (REPEL - d) / REPEL; // 0 at edge → 1 at centre
            p.vx += (dx / d) * force * 4.2;
            p.vy += (dy / d) * force * 4.2;
          }
        }

        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x += p.vx;
        p.y += p.vy;

        // Faster particles read brighter — the motion itself is the highlight.
        // Colour tracks convergence: on-target reads amber, still-scattered
        // (or mid-flight after a disturbance) reads cyan.
        const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
        const settle = Math.max(0, 1 - dist / 50);
        const speed = Math.min(Math.abs(p.vx) + Math.abs(p.vy), 6);
        ctx.fillStyle = colorOf(settle, 0.55 + speed * 0.07);
        ctx.fillRect(p.x, p.y, 1.7, 1.7);
      }
    };

    let raf = 0;
    let running = false;
    const loop = () => {
      step();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // Only animate while the forge is actually on screen.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.05 },
    );
    io.observe(canvas);

    const toLocal = (clientX: number, clientY: number) => {
      lastInteraction = performance.now();
      if (shapeState !== "wordmark") setShape("wordmark");
      const rect = canvas.getBoundingClientRect();
      pointer.x = clientX - rect.left;
      pointer.y = clientY - rect.top;
      pointer.active = true;
    };
    const onMove = (e: PointerEvent) => toLocal(e.clientX, e.clientY);
    const onLeave = () => {
      pointer.active = false;
      pointer.x = pointer.y = -9999;
    };
    // A tap/click blasts the swarm apart; the springs pull it back together.
    const onDown = (e: PointerEvent) => {
      // A tiny haptic buzz on tap where supported (mobile) — the whole site
      // leans into tactile Android detail, down to the particles.
      if (typeof navigator.vibrate === "function") navigator.vibrate(8);
      toLocal(e.clientX, e.clientY);
      for (const p of particles) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        const kick = Math.max(0, 160 - d) * 0.14;
        p.vx += (dx / d) * kick;
        p.vy += (dy / d) * kick;
      }
    };

    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerleave", onLeave);

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(build, 150);
    });
    ro.observe(canvas);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      clearTimeout(resizeTimer);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section id="forge" className="border-t border-line bg-void/40">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="section-eyebrow mb-2">// the particle forge</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Move your cursor through it</h2>
          <p className="mb-8 max-w-2xl text-zinc-400">
            Every experiment on this page is physics on a canvas. So is this — a few thousand particles,
            each spring-tied to a letter, parting around your pointer and snapping back. Give it a click.
          </p>
        </Reveal>
        <Reveal>
          <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
            <canvas
              ref={canvasRef}
              className="block h-[240px] w-full touch-none sm:h-[300px]"
              role="img"
              aria-label="Interactive particle swarm spelling sid.android — prototype to platform"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
