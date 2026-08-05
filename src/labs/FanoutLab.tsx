import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCanvasLoop } from "./useCanvasLoop.ts";

/**
 * The Fan-out Lab — HireSignal's 62-provider aggregation, running live.
 * A query fans out to a ring of 62 ATS/job-board providers (three of them —
 * Greenhouse, Ashby, Lever — are the named structured-API integrations the
 * scan path hits directly, zero LLM cost). Listings travel back toward a
 * collection zone; some are near-duplicates of the same posting from
 * different boards. SimHash de-dup collapses those on arrival; with it off
 * they just pile up.
 */

const TOTAL_PROVIDERS = 62;
const NAMED_PROVIDERS = ["Greenhouse", "Ashby", "Lever"];
const NAMED_INDEXES = [0, 21, 41]; // spread evenly around the 62-dot ring
const BLUE = "#3B82F6"; // HireSignal's real accent — reserved for this sim's own visuals

type V = { x: number; y: number };
type Pulse = { from: V; target: V; wait: number; t: number; durationMs: number; clusterId: number };
type Landed = { pos: V; age: number };
type Merging = { pos: V; age: number };

const ease = (t: number) => t * t * (3 - 2 * t);
const bez = (p0: V, c: V, p2: V, t: number): V => {
  const mt = 1 - t;
  return { x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p2.x, y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p2.y };
};

export function FanoutLab() {
  const [dedup, setDedup] = useState(true);
  const dedupRef = useRef(true);
  dedupRef.current = dedup;
  const scanRequestRef = useRef(false);
  const [stats, setStats] = useState({ total: 0, unique: 0 });

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    const layout = () => {
      const { width, height } = getSize();
      const cx = width / 2;
      const cy = height * 0.33;
      const collTop = height - 78;
      const rx = width * 0.42;
      const ry = Math.min(height * 0.26, cy - 14, collTop - cy - 24);
      return { width, height, cx, cy, collTop, collBottom: height - 24, rx, ry };
    };
    const ringPoint = (i: number): V => {
      const { cx, cy, rx, ry } = layout();
      const a = (i / TOTAL_PROVIDERS) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    };

    let pulses: Pulse[] = [];
    let landed: Landed[] = [];
    let merging: Merging[] = [];
    let clusterSeq = 0;
    let totalLanded = 0;
    let uniqueLanded = 0;
    const seenClusters = new Set<number>();
    let idleMs = 0;
    let statsAcc = 0;
    let hasRunOnce = false;

    const spawnScan = () => {
      const { width, collTop, collBottom } = layout();
      pulses = [];
      landed = [];
      merging = [];
      totalLanded = 0;
      uniqueLanded = 0;
      seenClusters.clear();
      hasRunOnce = true;

      // Most postings are unique; a handful come back from 2-3 boards at
      // once — the near-duplicates SimHash is there to catch.
      const clusterCount = 20 + Math.floor(Math.random() * 6);
      let order = 0;
      for (let c = 0; c < clusterCount; c++) {
        const r = Math.random();
        const size = r < 0.6 ? 1 : r < 0.86 ? 2 : 3;
        const clusterId = clusterSeq++;
        const targetBase: V = { x: 36 + Math.random() * (width - 72), y: collTop + (collBottom - collTop) / 2 };
        for (let k = 0; k < size; k++) {
          const providerIdx = Math.floor(Math.random() * TOTAL_PROVIDERS);
          pulses.push({
            from: ringPoint(providerIdx),
            target: { x: targetBase.x + (Math.random() - 0.5) * 12, y: targetBase.y + (Math.random() - 0.5) * 16 },
            wait: order * (30 + Math.random() * 20),
            t: 0,
            durationMs: 900 + Math.random() * 600,
            clusterId,
          });
          order++;
        }
      }
    };
    spawnScan();

    const step = (dtMs: number) => {
      const dt = Math.min(dtMs, 64);

      if (scanRequestRef.current) {
        scanRequestRef.current = false;
        spawnScan();
        idleMs = 0;
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        if (p.wait > 0) {
          p.wait -= dt;
          continue;
        }
        p.t += dt / p.durationMs;
        if (p.t >= 1) {
          totalLanded++;
          const isDupe = seenClusters.has(p.clusterId);
          seenClusters.add(p.clusterId);
          if (dedupRef.current && isDupe) {
            merging.push({ pos: p.target, age: 0 }); // SimHash matched an existing listing — absorbed, not added
          } else {
            uniqueLanded++;
            landed.push({ pos: p.target, age: 0 });
          }
          pulses.splice(i, 1);
        }
      }

      for (const l of landed) l.age += dt;
      for (let i = merging.length - 1; i >= 0; i--) {
        merging[i].age += dt;
        if (merging[i].age > 500) merging.splice(i, 1);
      }

      if (pulses.length === 0) {
        idleMs += dt;
        if (hasRunOnce && idleMs > 1800) spawnScan();
      } else {
        idleMs = 0;
      }

      statsAcc += dt;
      if (statsAcc > 400) {
        statsAcc = 0;
        setStats({ total: totalLanded, unique: uniqueLanded });
      }
    };

    const draw = () => {
      const { width, height, cx, cy, collTop, collBottom } = layout();
      ctx.clearRect(0, 0, width, height);

      // collection zone
      ctx.fillStyle = "rgba(59, 130, 246, 0.05)";
      ctx.fillRect(20, collTop, width - 40, collBottom - collTop);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.18)";
      ctx.strokeRect(20, collTop, width - 40, collBottom - collTop);
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = "rgba(59, 130, 246, 0.55)";
      ctx.fillText("collected listings", 26, collTop - 6);

      // 62-provider ring
      for (let i = 0; i < TOTAL_PROVIDERS; i++) {
        const p = ringPoint(i);
        const namedIdx = NAMED_INDEXES.indexOf(i);
        const named = namedIdx !== -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, named ? 4.5 : 2.4, 0, Math.PI * 2);
        ctx.fillStyle = named ? BLUE : "rgba(148, 163, 184, 0.4)";
        ctx.fill();
        if (named) {
          ctx.strokeStyle = "rgba(232, 239, 233, 0.7)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = "rgba(232, 239, 233, 0.75)";
          ctx.textAlign = p.x < cx ? "right" : "left";
          ctx.fillText(NAMED_PROVIDERS[namedIdx], p.x + (p.x < cx ? -7 : 7), p.y + (p.y < cy ? -6 : 12));
          ctx.textAlign = "left";
        }
      }

      // query point (pulses gently)
      const pulsePhase = (Date.now() % 1600) / 1600;
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + Math.sin(pulsePhase * Math.PI * 2) * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = BLUE;
      ctx.shadowColor = "rgba(59, 130, 246, 0.7)";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(232, 239, 233, 0.6)";
      ctx.textAlign = "center";
      ctx.fillText("query", cx, cy - 12);
      ctx.textAlign = "left";

      // in-flight listings
      for (const p of pulses) {
        if (p.wait > 0) continue;
        const pos = bez(p.from, { x: cx, y: cy }, p.target, ease(Math.min(p.t, 1)));
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.75)";
        ctx.fill();
      }

      // landed listings
      for (const l of landed) {
        const alpha = Math.min(1, l.age / 150);
        ctx.beginPath();
        ctx.arc(l.pos.x, l.pos.y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
        ctx.fill();
      }

      // de-dup merge flashes
      for (const m of merging) {
        const t = m.age / 500;
        ctx.beginPath();
        ctx.arc(m.pos.x, m.pos.y, 4 + t * 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(59, 130, 246, ${1 - t})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    return { step, draw };
  });

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        62 ATS &amp; job-board providers, one query. Greenhouse, Ashby and Lever get hit directly by
        structured APIs — zero LLM cost — while listings fan back in toward a collection zone. The same
        posting often comes back from more than one board; SimHash fingerprinting is what tells them
        apart from something actually new. Flip de-dup off and watch the duplicates pile up instead.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <canvas ref={canvasRef} className="h-full w-full" aria-label="HireSignal 62-provider fan-out and de-duplication simulation" />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <button
            onClick={() => {
              scanRequestRef.current = true;
            }}
            className="rounded-full border border-accent/40 px-3 py-1 font-mono text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent/10"
          >
            run scan
          </button>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} className="accent-signal" />
            SimHash de-dup
          </label>
          <span className="font-mono text-xs text-zinc-400">
            {dedup
              ? `62 providers queried · ${stats.total} listings → ${stats.unique} unique after de-dup`
              : `62 providers queried · ${stats.total} listings, 0 de-duped`}
          </span>
          <span className="font-mono text-xs text-accent">0 LLM tokens spent</span>
          <Link
            to="/project/$slug"
            params={{ slug: "hiresignal" }}
            className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent"
          >
            the full story → HireSignal's 62 providers
          </Link>
        </div>
      </div>
    </div>
  );
}
