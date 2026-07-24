import { useEffect, useRef, useState } from "react";

/**
 * The Signal Lab — the "50% → 95%" claim, running live. A vehicle drives a
 * figure-eight test track; raw GPS samples arrive noisy, spiking near the
 * tunnel and dropping out inside it. The filter lane applies the same ideas
 * as the production engine — spike rejection against a predicted position,
 * dead reckoning through dropouts, exponential smoothing — and both lanes
 * score themselves against ground truth in real time. Plain canvas, no deps;
 * reduced motion gets a single pre-run frame instead of animation.
 */

type V = { x: number; y: number };

const SAMPLE_MS = 420; // GPS cadence
const TRAIL = 46; // samples kept per lane
const HIT_PX = 16; // "accurate" = within this of truth

// Mulberry32 — deterministic noise so the lab tells the same story every visit.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ground truth: a figure-eight demo road, parameterized by time.
function truthAt(t: number, w: number, h: number): V {
  return {
    x: w * 0.5 + w * 0.38 * Math.sin(t),
    y: h * 0.52 + h * 0.34 * Math.sin(2 * t + Math.PI / 3),
  };
}

// The tunnel: right-hand lobe of the eight. No fixes inside; multipath at the mouths.
function inTunnel(p: V, w: number): boolean {
  return p.x > w * 0.72;
}
function nearTunnel(p: V, w: number): boolean {
  return p.x > w * 0.62 && p.x <= w * 0.72;
}

const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);

export function SignalLabPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showRaw, setShowRaw] = useState(true);
  const [showFiltered, setShowFiltered] = useState(true);
  const [noise, setNoise] = useState(26);
  const controls = useRef({ showRaw: true, showFiltered: true, noise: 26 });
  controls.current = { showRaw, showFiltered, noise };
  const [score, setScore] = useState({ raw: 0, filtered: 0 });

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const rand = rng(20260720);
    const gauss = () => (rand() + rand() + rand() - 1.5) * 2; // approx N(0,1)

    // Sim state
    let simT = 0; // road parameter
    let sinceSample = 0;
    const raw: { p: V; truth: V; spike: boolean }[] = [];
    const filtered: { p: V; truth: V; reckoned: boolean }[] = [];
    let est: V | null = null;
    let vel: V = { x: 0, y: 0 };
    let lastRaf = 0;
    let raf = 0;

    const step = (dtMs: number) => {
      const dt = Math.min(dtMs, 64) / 1000;
      simT += dt * 0.55; // vehicle speed
      sinceSample += dtMs;
      const truth = truthAt(simT, width, height);

      if (sinceSample >= SAMPLE_MS) {
        sinceSample = 0;
        const dropout = inTunnel(truth, width);
        const n = controls.current.noise;

        if (!dropout) {
          // Raw lane: gaussian scatter, multipath spikes near the tunnel mouths.
          let sample: V = { x: truth.x + gauss() * n * 0.45, y: truth.y + gauss() * n * 0.45 };
          let spike = false;
          if (nearTunnel(truth, width) && rand() < 0.4) {
            spike = true;
            const ang = rand() * Math.PI * 2;
            const throwPx = n * (2.2 + rand() * 2.6);
            sample = { x: truth.x + Math.cos(ang) * throwPx, y: truth.y + Math.sin(ang) * throwPx };
          }
          raw.push({ p: sample, truth, spike });
          if (raw.length > TRAIL) raw.shift();

          // Filter lane: trust the sample only if it lands near the prediction.
          if (!est) {
            est = { ...sample };
          } else {
            const predicted = { x: est.x + vel.x * (SAMPLE_MS / 1000), y: est.y + vel.y * (SAMPLE_MS / 1000) };
            const maxJump = 90 + n * 2.4; // physically plausible travel per fix
            if (dist(sample, predicted) > maxJump) {
              est = predicted; // rejected — dead-reckon instead
            } else {
              const alpha = 0.42;
              const next = { x: est.x + (sample.x - est.x) * alpha, y: est.y + (sample.y - est.y) * alpha };
              vel = { x: (next.x - est.x) / (SAMPLE_MS / 1000), y: (next.y - est.y) / (SAMPLE_MS / 1000) };
              est = next;
            }
          }
          filtered.push({ p: { ...est }, truth, reckoned: false });
        } else if (est) {
          // Tunnel: no fix at all — coast on the last velocity estimate.
          est = { x: est.x + vel.x * (SAMPLE_MS / 1000), y: est.y + vel.y * (SAMPLE_MS / 1000) };
          vel = { x: vel.x * 0.985, y: vel.y * 0.985 };
          filtered.push({ p: { ...est }, truth, reckoned: true });
        }
        if (filtered.length > TRAIL) filtered.shift();
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // road (ground truth), dashed
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.04) {
        const p = truthAt(a, width, height);
        if (a === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "rgba(232, 239, 233, 0.16)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // tunnel zone
      ctx.fillStyle = "rgba(94, 230, 255, 0.05)";
      ctx.fillRect(width * 0.72, 0, width * 0.28, height);
      ctx.strokeStyle = "rgba(94, 230, 255, 0.16)";
      ctx.strokeRect(width * 0.72, -1, width * 0.28 + 2, height + 2);
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = "rgba(94, 230, 255, 0.5)";
      ctx.fillText("TUNNEL — NO FIXES", width * 0.74, 18);

      // raw lane
      if (controls.current.showRaw && raw.length > 1) {
        ctx.beginPath();
        raw.forEach((s, i) => (i === 0 ? ctx.moveTo(s.p.x, s.p.y) : ctx.lineTo(s.p.x, s.p.y)));
        ctx.strokeStyle = "rgba(240, 136, 62, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
        for (const s of raw) {
          ctx.beginPath();
          ctx.arc(s.p.x, s.p.y, s.spike ? 3 : 2, 0, Math.PI * 2);
          ctx.fillStyle = s.spike ? "#ff5c5c" : "#f0883e";
          ctx.fill();
        }
      }

      // filtered lane
      if (controls.current.showFiltered && filtered.length > 1) {
        ctx.beginPath();
        filtered.forEach((s, i) => (i === 0 ? ctx.moveTo(s.p.x, s.p.y) : ctx.lineTo(s.p.x, s.p.y)));
        ctx.strokeStyle = "#3ddc84";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(61, 220, 132, 0.6)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
        for (const s of filtered) {
          if (!s.reckoned) continue;
          ctx.beginPath();
          ctx.arc(s.p.x, s.p.y, 2.4, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(61, 220, 132, 0.8)";
          ctx.lineWidth = 1;
          ctx.stroke(); // hollow dots = dead-reckoned, no fix received
        }
      }

      // vehicle
      const v = truthAt(simT, width, height);
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#e8efe9";
      ctx.fill();
    };

    const updateScore = () => {
      const pct = (arr: { p: V; truth: V }[]) =>
        arr.length ? Math.round((arr.filter((s) => dist(s.p, s.truth) <= HIT_PX).length / arr.length) * 100) : 0;
      setScore({ raw: pct(raw), filtered: pct(filtered) });
    };

    if (reduced) {
      // One silent pre-run, then a single frame.
      for (let i = 0; i < 1400; i++) step(16);
      draw();
      updateScore();
      return () => ro.disconnect();
    }

    let sinceScore = 0;
    const loop = (now: number) => {
      const dt = lastRaf ? now - lastRaf : 16;
      lastRaf = now;
      step(dt);
      draw();
      sinceScore += dt;
      if (sinceScore > 500) {
        sinceScore = 0;
        updateScore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mounted]);

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        The idea behind the production location engine, running live: raw GPS scatters and spikes near
        the tunnel, then dies inside it. The filter rejects impossible fixes against a predicted
        position and dead-reckons through the gap. Hollow dots are positions the engine produced with
        no fix at all.
      </p>
      <div ref={holderRef} className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
            <div className="relative h-[340px] sm:h-[400px]">
              {mounted && <canvas ref={canvasRef} className="h-full w-full" aria-label="Live GPS filtering simulation" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
              <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
                <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="accent-[#f0883e]" />
                <span className="h-2 w-2 rounded-full bg-[#f0883e]" /> raw gps
                <span className="text-zinc-500">{score.raw}% on track</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
                <input type="checkbox" checked={showFiltered} onChange={(e) => setShowFiltered(e.target.checked)} className="accent-[#3ddc84]" />
                <span className="h-2 w-2 rounded-full bg-accent" /> filtered
                <span className="text-accent">{score.filtered}% on track</span>
              </label>
              <label className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                noise
                <input
                  type="range"
                  min={8}
                  max={60}
                  value={noise}
                  onChange={(e) => setNoise(Number(e.target.value))}
                  className="w-28 accent-[#3ddc84]"
                />
              </label>
              <a href="#loopdown" onClick={() => window.scrollTo({ top: 0 })} className="ml-auto font-mono text-[11px] text-zinc-500 transition hover:text-accent">
                the full story → sensors who lie
              </a>
            </div>
      </div>
    </div>
  );
}
