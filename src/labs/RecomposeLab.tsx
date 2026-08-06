import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

/* ── Recomposition Lab ───────────────────────────────────────────────── */

const GRID_W = 8;
const GRID_H = 5;

export function RecomposeLab() {
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

  const avgTouched = {
    naive: "100%",
    optimized: `${((1 / (GRID_W * GRID_H)) * 100).toFixed(1)}%`,
  };

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Tap any cell. In rebuild-the-world mode, one state change repaints the whole screen — that's a
        legacy view tree, and at ~964k LOC it's molasses. Flip to stable state and only the touched cell
        recomposes. This is what the ~87% migration actually bought.
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
          <span className="font-mono text-xs text-muted">
            avg cells touched: naive {avgTouched.naive} · optimized {avgTouched.optimized}
          </span>
          <Link to="/loopdown" className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent">
            the full story → ghosts in the recomposition
          </Link>
        </div>
      </div>
    </div>
  );
}
