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

const GREEN = { r: 61, g: 220, b: 132 };
const CYAN = { r: 94, g: 230, b: 255 };

type Particle = {
  x: number;
  y: number;
  tx: number; // target (glyph) position
  ty: number;
  vx: number;
  vy: number;
  mix: number; // 0..1 green→cyan tint, fixed per particle
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

  ctx.font = `700 ${unit}px "Space Grotesk", system-ui, sans-serif`;
  ctx.fillText("sid.android", width / 2, height * 0.42);

  ctx.font = `600 ${unit * 0.28}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillText("prototype → platform", width / 2, height * 0.72);

  // Denser sampling on small canvases, sparser on large ones — keeps the
  // particle budget roughly constant regardless of viewport width.
  const step = width > 900 ? 6 : width > 560 ? 5 : 4;
  const { data } = ctx.getImageData(0, 0, width, height);
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      // alpha channel of this pixel
      if (data[(y * width + x) * 4 + 3] > 128) points.push({ x, y });
    }
  }
  return { points, step };
}

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

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { points } = sampleWordmark(width, height);
      particles = points.map((p) => {
        // Reuse a particle's current position on resize so it glides to the
        // new layout instead of teleporting; fresh ones fly in from a random
        // scatter for the assembling-into-shape reveal.
        const seedX = Math.random() * width;
        const seedY = Math.random() * height;
        return { x: seedX, y: seedY, tx: p.x, ty: p.y, vx: 0, vy: 0, mix: p.x / width };
      });
    };
    build();

    const colorOf = (mix: number, alpha: number) => {
      const r = Math.round(GREEN.r + (CYAN.r - GREEN.r) * mix);
      const g = Math.round(GREEN.g + (CYAN.g - GREEN.g) * mix);
      const b = Math.round(GREEN.b + (CYAN.b - GREEN.b) * mix);
      return `rgba(${r},${g},${b},${alpha})`;
    };

    // Static render for reduced motion: particles sit on their targets.
    if (reduced) {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.fillStyle = colorOf(p.mix, 0.9);
        ctx.fillRect(p.tx, p.ty, 1.6, 1.6);
      }
      const ro = new ResizeObserver(() => {
        build();
        ctx.clearRect(0, 0, width, height);
        for (const p of particles) {
          ctx.fillStyle = colorOf(p.mix, 0.9);
          ctx.fillRect(p.tx, p.ty, 1.6, 1.6);
        }
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    const REPEL = 34; // px radius of the cursor's influence
    const REPEL2 = REPEL * REPEL;

    const step = () => {
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
        const speed = Math.min(Math.abs(p.vx) + Math.abs(p.vy), 6);
        ctx.fillStyle = colorOf(p.mix, 0.55 + speed * 0.07);
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
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// the particle forge</p>
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
