import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCanvasLoop } from "./useCanvasLoop.ts";

/* ── Crash Triage Lab ────────────────────────────────────────────────── */

const CAUSES = [
  { id: "main-thread I/O", color: "#f0883e" },
  { id: "coroutine race", color: "#ff5c5c" },
  { id: "lifecycle leak", color: "#db61ff" },
  { id: "bitmap OOM", color: "#5ee6ff" },
  { id: "OEM quirk", color: "#8ff0b4" },
];

type CrashEvt = { x: number; y: number; vx: number; vy: number; cause: number };

export function CrashLab() {
  const [triage, setTriage] = useState(false);
  const triageRef = useRef(false);
  triageRef.current = triage;
  const [stats, setStats] = useState({ total: 0, top: 0 });

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    const events: CrashEvt[] = [];
    const bins = CAUSES.map(() => 0);
    let pile = 0;
    let spawnAcc = 0;
    let statsAcc = 0;

    // Skewed cause distribution — real feeds are: two bugs cause most of it.
    // Top 2 (main-thread I/O + coroutine race) sum to exactly 80% — that's
    // how -80% actually happened once those two clusters got fixed.
    const pickCause = () => {
      const r = Math.random();
      if (r < 0.5) return 0;
      if (r < 0.8) return 1;
      if (r < 0.92) return 2;
      if (r < 0.98) return 3;
      return 4;
    };

    const binX = (i: number) => getSize().width * ((i + 0.5) / CAUSES.length);

    const updateStats = () => {
      const total = pile + bins.reduce((a, b) => a + b, 0);
      const t = bins.reduce((a, b) => a + b, 0) || 1;
      setStats({ total, top: Math.round(((bins[0] + bins[1]) / t) * 100) });
    };

    const step = (dtMs: number) => {
      const { width, height } = getSize();
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
      statsAcc += dtMs;
      if (statsAcc > 600) {
        statsAcc = 0;
        updateStats();
      }
    };

    const draw = () => {
      const { width, height } = getSize();
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

    return { step, draw };
  });

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
          <Link to="/loopdown" className="ml-auto font-mono text-[11px] text-zinc-500 transition hover:text-accent">
            the full story → the coroutine court
          </Link>
        </div>
      </div>
    </div>
  );
}
