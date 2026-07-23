import { useEffect, useRef, useState } from "react";
import { Reveal } from "./Reveal.tsx";
import { SignalLabPane } from "./SignalLab.tsx";

/**
 * The Lab Bench — one live experiment per case study. Not screenshots of
 * the work: the ideas themselves, running. Tabs mount one lab at a time so
 * the section stays light; every case-study card deep-links to its lab via
 * openLab().
 */

export type LabKey = "signal" | "crashes" | "recompose" | "theme";

const OPEN_LAB_EVENT = "open-lab";
export function openLab(tab: LabKey) {
  window.dispatchEvent(new CustomEvent(OPEN_LAB_EVENT, { detail: tab }));
  document.getElementById("lab")?.scrollIntoView({ behavior: "smooth" });
}

/* ── Crash Triage Lab ────────────────────────────────────────────────── */

const CAUSES = [
  { id: "main-thread I/O", color: "#f0883e" },
  { id: "coroutine race", color: "#ff5c5c" },
  { id: "lifecycle leak", color: "#db61ff" },
  { id: "bitmap OOM", color: "#5ee6ff" },
  { id: "OEM quirk", color: "#8ff0b4" },
];

type CrashEvt = { x: number; y: number; vx: number; vy: number; cause: number };

function CrashLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [triage, setTriage] = useState(false);
  const triageRef = useRef(false);
  triageRef.current = triage;
  const [stats, setStats] = useState({ total: 0, top: 0 });

  useEffect(() => {
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

    const events: CrashEvt[] = [];
    const bins = CAUSES.map(() => 0);
    let pile = 0;
    let spawnAcc = 0;
    let raf = 0;
    let last = 0;

    // Skewed cause distribution — real feeds are: two bugs cause most of it.
    const pickCause = () => {
      const r = Math.random();
      if (r < 0.38) return 0;
      if (r < 0.68) return 1;
      if (r < 0.84) return 2;
      if (r < 0.94) return 3;
      return 4;
    };

    const binX = (i: number) => width * ((i + 0.5) / CAUSES.length);

    const step = (dtMs: number) => {
      spawnAcc += dtMs;
      while (spawnAcc > 140) {
        spawnAcc -= 140;
        events.push({ x: 30 + Math.random() * (width - 60), y: -8, vx: 0, vy: 60 + Math.random() * 60, cause: pickCause() });
      }
      const dt = Math.min(dtMs, 64) / 1000;
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (triageRef.current) {
          // steer toward this cause's bin
          const tx = binX(e.cause);
          e.vx += (tx - e.x) * 2.4 * dt * 10;
          e.vx *= 0.92;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.y > height - 46) {
          events.splice(i, 1);
          if (triageRef.current) bins[e.cause]++;
          else pile++;
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      // falling traces
      for (const e of events) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = triageRef.current ? CAUSES[e.cause].color : "#ff5c5c";
        ctx.fill();
        ctx.fillStyle = triageRef.current ? `${CAUSES[e.cause].color}44` : "rgba(255,92,92,0.25)";
        ctx.fillRect(e.x - 0.5, e.y - 14, 1, 12);
      }
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      if (!triageRef.current) {
        // one undifferentiated pile
        const h = Math.min(34, 6 + pile * 0.16);
        ctx.fillStyle = "rgba(255, 92, 92, 0.25)";
        ctx.fillRect(20, height - 40 - h, width - 40, h);
        ctx.strokeStyle = "rgba(255, 92, 92, 0.6)";
        ctx.strokeRect(20, height - 40 - h, width - 40, h);
        ctx.fillStyle = "rgba(255, 92, 92, 0.9)";
        ctx.fillText(`crash feed: ${pile} traces, zero answers`, 24, height - 46 - h);
      } else {
        const total = bins.reduce((a, b) => a + b, 0) || 1;
        CAUSES.forEach((c, i) => {
          const x = binX(i);
          const w = width / CAUSES.length - 18;
          const h = Math.min(96, 4 + bins[i] * 0.55);
          ctx.fillStyle = `${c.color}33`;
          ctx.fillRect(x - w / 2, height - 40 - h, w, h);
          ctx.strokeStyle = `${c.color}aa`;
          ctx.strokeRect(x - w / 2, height - 40 - h, w, h);
          ctx.fillStyle = c.color;
          ctx.textAlign = "center";
          ctx.fillText(`${Math.round((bins[i] / total) * 100)}%`, x, height - 46 - h);
          ctx.fillStyle = "rgba(232,239,233,0.6)";
          ctx.fillText(c.id, x, height - 22);
          ctx.textAlign = "left";
        });
      }
    };

    const updateStats = () => {
      const total = pile + bins.reduce((a, b) => a + b, 0);
      const t = bins.reduce((a, b) => a + b, 0) || 1;
      setStats({ total, top: Math.round(((bins[0] + bins[1]) / t) * 100) });
    };

    if (reduced) {
      for (let i = 0; i < 900; i++) step(16);
      draw();
      updateStats();
      return () => ro.disconnect();
    }
    let acc = 0;
    const loop = (now: number) => {
      const dt = last ? now - last : 16;
      last = now;
      step(dt);
      draw();
      acc += dt;
      if (acc > 600) {
        acc = 0;
        updateStats();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        A production crash feed doesn't arrive labeled — it arrives as noise. Flip triage on and the
        same feed clusters by root cause. The skew is the whole point: fix the top two clusters and
        most of the noise disappears. That's how -80% actually happened.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <canvas ref={canvasRef} className="h-full w-full" aria-label="Crash clustering simulation" />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={triage} onChange={(e) => setTriage(e.target.checked)} className="accent-[#3ddc84]" />
            cluster by root cause
          </label>
          <span className="font-mono text-xs text-zinc-500">{stats.total} traces seen</span>
          {triage && (
            <span className="font-mono text-xs text-accent">top 2 clusters = {stats.top}% of all crashes</span>
          )}
          <a href="#loopdown" onClick={() => window.scrollTo({ top: 0 })} className="ml-auto font-mono text-[11px] text-zinc-500 transition hover:text-accent">
            the full story → the coroutine court
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Recomposition Lab ───────────────────────────────────────────────── */

const GRID_W = 8;
const GRID_H = 5;

function RecomposeLab() {
  const [optimized, setOptimized] = useState(false);
  const [flash, setFlash] = useState<{ cells: Set<number>; key: number }>({ cells: new Set(), key: 0 });
  const [renders, setRenders] = useState({ naive: 0, smart: 0 });

  const tap = (i: number) => {
    if (optimized) {
      setFlash({ cells: new Set([i]), key: Date.now() });
      setRenders((r) => ({ ...r, smart: r.smart + 1 }));
    } else {
      setFlash({ cells: new Set(Array.from({ length: GRID_W * GRID_H }, (_, k) => k)), key: Date.now() });
      setRenders((r) => ({ ...r, naive: r.naive + GRID_W * GRID_H }));
    }
  };

  // Ambient auto-taps keep the demo alive without interaction.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => tap(Math.floor(Math.random() * GRID_W * GRID_H)), 1400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimized]);

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Tap any cell. In rebuild-the-world mode, one state change repaints the whole screen — that's a
        legacy view tree, and at 738k LOC it's molasses. Flip to stable state and only the touched cell
        recomposes. This is what the 92% migration actually bought.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="grid gap-1.5 p-5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${GRID_W}, minmax(0, 1fr))` }}>
          {Array.from({ length: GRID_W * GRID_H }, (_, i) => (
            <button
              key={i}
              onClick={() => tap(i)}
              aria-label={`Cell ${i + 1}`}
              className="aspect-square rounded-md border border-line bg-card transition hover:border-accent/40"
            >
              {flash.cells.has(i) && (
                <span key={flash.key} className={`block h-full w-full rounded-md ${optimized ? "cell-flash-good" : "cell-flash-bad"}`} />
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={optimized} onChange={(e) => setOptimized(e.target.checked)} className="accent-[#3ddc84]" />
            compose + stable UiState
          </label>
          <span className="font-mono text-xs text-[#ff5c5c]">wasted renders: {renders.naive}</span>
          <span className="font-mono text-xs text-accent">needed renders: {renders.smart}</span>
          <a href="#loopdown" onClick={() => window.scrollTo({ top: 0 })} className="ml-auto font-mono text-[11px] text-zinc-500 transition hover:text-accent">
            the full story → ghosts in the recomposition
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── White-label Lab ─────────────────────────────────────────────────── */

const BRANDS = [
  { name: "mint", color: "#3ddc84" },
  { name: "ocean", color: "#38bdf8" },
  { name: "grape", color: "#a78bfa" },
  { name: "ember", color: "#f0883e" },
  { name: "rose", color: "#fb7185" },
];
const CLIENTS = ["FleetCo", "ZipRide", "HaulHub", "GoTrux"];

function ThemeLab() {
  const [brand, setBrand] = useState(BRANDS[0]);
  const [flips, setFlips] = useState(0);

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Twenty clients used to mean twenty forks. The pipeline made brand a token, not a codebase:
        change it once and every client app follows. Pick a brand — all four clients retheme from the
        same tap.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          {CLIENTS.map((c, i) => (
            <div
              key={c}
              className="overflow-hidden rounded-xl border border-line bg-card"
              style={{ transition: `border-color 0.4s ${i * 90}ms` , borderColor: `${brand.color}44` }}
            >
              <div className="px-3 py-2 text-[11px] font-bold text-ink" style={{ background: brand.color, transition: `background 0.4s ${i * 90}ms` }}>
                {c}
              </div>
              <div className="space-y-2 p-3">
                <div className="h-1.5 w-4/5 rounded bg-zinc-700" />
                <div className="h-1.5 w-3/5 rounded bg-zinc-700" />
                <div
                  className="mt-3 rounded-full px-2 py-1 text-center text-[10px] font-bold text-ink"
                  style={{ background: brand.color, transition: `background 0.4s ${i * 90}ms` }}
                >
                  Book now
                </div>
                <div className="flex gap-1 pt-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: brand.color, transition: `background 0.4s ${i * 90}ms` }} />
                  <span className="h-2 w-2 rounded-full border border-line" />
                  <span className="h-2 w-2 rounded-full border border-line" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-5 py-4">
          <span className="font-mono text-xs text-zinc-500">brand token:</span>
          {BRANDS.map((b) => (
            <button
              key={b.name}
              onClick={() => { setBrand(b); setFlips((f) => f + 1); }}
              aria-label={`Theme ${b.name}`}
              aria-pressed={brand.name === b.name}
              className="h-6 w-6 rounded-full border-2 transition hover:scale-110"
              style={{ background: b.color, borderColor: brand.name === b.name ? "#e8efe9" : "transparent" }}
            />
          ))}
          {flips > 0 && (
            <span className="font-mono text-xs text-accent">
              {flips} {flips === 1 ? "change" : "changes"} · {flips * CLIENTS.length} client updates · 0 forks
            </span>
          )}
          <a href="#work" className="ml-auto font-mono text-[11px] text-zinc-500 transition hover:text-accent">
            the real pipeline shipped 20+ clients
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── The bench ───────────────────────────────────────────────────────── */

const TABS: { key: LabKey; label: string; metric: string }[] = [
  { key: "signal", label: "Signal Lab", metric: "50% → 95%" },
  { key: "crashes", label: "Crash Triage", metric: "-80%" },
  { key: "recompose", label: "Recomposition", metric: "92% Compose" },
  { key: "theme", label: "White-label", metric: "80% faster" },
];

export function LabBench() {
  const [tab, setTab] = useState<LabKey>("signal");

  useEffect(() => {
    const onOpen = (e: Event) => {
      const t = (e as CustomEvent).detail as LabKey;
      if (TABS.some((x) => x.key === t)) setTab(t);
    };
    window.addEventListener(OPEN_LAB_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LAB_EVENT, onOpen);
  }, []);

  return (
    <section id="lab" className="border-t border-line bg-void/40">
      <div className="section-y mx-auto max-w-5xl px-6">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/60">// the lab bench</p>
          <h2 className="font-display mb-2 text-h2 font-bold tracking-tight">Don't take the numbers on faith</h2>
          <p className="mb-8 max-w-2xl text-zinc-400">
            Four instruments, one per case study — the actual idea behind each headline metric, running live
            in your browser. Flip a switch and watch the number happen. The full toolshed is in the{" "}
            <a href="#workshop" className="text-accent transition hover:text-accent-dim">Workshop</a>.
          </p>
        </Reveal>
        <Reveal>
          <div className="mb-6 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
                className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  tab === t.key
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-zinc-400 hover:border-accent/40 hover:text-zinc-200"
                }`}
              >
                {t.label}
                <span className={`font-mono text-[10px] ${tab === t.key ? "text-accent/80" : "text-zinc-600"}`}>{t.metric}</span>
              </button>
            ))}
          </div>
          {tab === "signal" && <SignalLabPane />}
          {tab === "crashes" && <CrashLab />}
          {tab === "recompose" && <RecomposeLab />}
          {tab === "theme" && <ThemeLab />}
        </Reveal>
      </div>
    </section>
  );
}
