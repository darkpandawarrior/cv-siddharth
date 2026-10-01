// LANE C2 ("X-ray mode"): the DOM half of the engineering showcase —
// legend, stats card, imagery stack and tier readout — that pairs with
// layers/XRayTiles.tsx (the scene half, drawing the tile outlines this
// legend counts). Everything here is read from what is already loaded and
// already drawn: no new fetch, no invented numbers.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { simTime, useGlobe, type StatusKey } from "../globeStore.ts";
import { catalogDateLabel, GIBS_CATALOG } from "../layers/gibsCatalog.ts";
import { drawnTileSet } from "../layers/TileLayer.tsx";
import { getXrayStats, levelColorHex, subscribeXrayStats, type XrayStats } from "../layers/xrayState.ts";
import { GLOBE_DPR_MAX, tierBudget } from "../../deviceTier.ts";

// Same cadence as XRayTiles.tsx's own renderer.info sample (brief: "at most
// 4 times a second") — this is the ONE setInterval driving a real (if
// throttled) setState, which is the sanctioned exception to "no per-frame
// React state": this is 4Hz, not 60fps.
const SAMPLE_INTERVAL_MS = 250;

const TIER_WHY: Record<1 | 2 | 3, string> = {
  1: "desktop viewport, load-time benchmark under budget",
  2: "phone viewport (≤ 820px)",
  3: "load-time benchmark over budget, treated as throttled for the session",
};

interface LevelCount {
  level: number;
  count: number;
}

function summarizeDrawnTiles(): { total: number; byLevel: LevelCount[] } {
  const counts = new Map<number, number>();
  for (const tile of drawnTileSet.tiles) counts.set(tile.level, (counts.get(tile.level) ?? 0) + 1);
  const byLevel = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([level, count]) => ({ level, count }));
  return { total: drawnTileSet.tiles.length, byLevel };
}

export default function XRay({ tier }: { tier: 1 | 2 | 3 }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => panelRef.current?.scrollIntoView({ block: "nearest" }), []);
  const [stats, setStats] = useState<XrayStats>(getXrayStats);
  const [tiles, setTiles] = useState(summarizeDrawnTiles);
  const imagery = useGlobe((s) => s.imagery);
  const status = useGlobe((s) => s.status);
  const timeOffsetMin = useGlobe((s) => s.timeOffsetMin);

  useEffect(() => subscribeXrayStats(() => setStats(getXrayStats())), []);
  useEffect(() => {
    const id = setInterval(() => setTiles(summarizeDrawnTiles()), SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const now = simTime(timeOffsetMin);
  const budget = tierBudget(tier);
  const stack = [
    { role: "base", id: imagery.base, key: "earth" as const },
    ...imagery.overlays.map((o) => ({ role: `overlay ${Math.round(o.opacity * 100)}%`, id: o.id, key: o.id })),
  ];

  return (
    <div
      ref={panelRef}
      data-xray-panel
      className="pointer-events-auto mb-3 flex max-h-[min(18rem,calc(var(--globe-sheet-max-h,70vh)-10rem))] w-full min-w-0 flex-col gap-2 overflow-y-auto rounded-lg border border-line p-2 font-mono break-words text-xs leading-4 text-zinc-300 sm:max-h-none sm:overflow-visible"
    >
      <p className="text-zinc-400">
        X-ray: drawn scene (read only)
      </p>

      <div data-xray-stats className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-0.5 sm:grid-cols-2">
        <span>draw calls</span>
        <span>{stats.drawCalls}</span>
        <span>triangles</span>
        <span>{stats.triangles.toLocaleString()}</span>
        <span>geometries</span>
        <span>{stats.geometries}</span>
        <span>textures</span>
        <span>{stats.textures}</span>
        <span>fps</span>
        <span>{stats.fps}</span>
      </div>

      <div data-xray-legend>
        <p className="text-zinc-400">tile quadtree, {tiles.total} on screen</p>
        {tiles.byLevel.length === 0 ? (
          <p>no tiles drawn</p>
        ) : (
          <ul className="flex flex-wrap gap-x-2">
            {tiles.byLevel.map(({ level, count }) => (
              <li key={level} aria-label={`level ${level}, ${count} tiles`} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: levelColorHex(level) }} />
                L{level}: {count}
              </li>
            ))}
          </ul>
        )}
      </div>

      <details data-xray-imagery>
        <summary className="min-h-11 cursor-pointer py-2 text-zinc-400">imagery stack</summary>
        <ul>
          {stack.map(({ role, id, key }) => {
            const entry = GIBS_CATALOG[id];
            // Same cast TileLayer.tsx's own setStatus call uses: a GIBS
            // catalog id is a StatusKey at runtime (StatusKey = LayerId |
            // "earth", and every overlay id IS what status is keyed by),
            // just not one TypeScript can narrow a plain string to on its own.
            const health = status[key as StatusKey];
            const label = entry ? catalogDateLabel(entry, now) : `${id} (unverified id)`;
            return (
              <li key={`${role}-${id}`}>
                {role}: {label}
                {health?.state === "failed" ? " (feed unavailable)" : ""}
              </li>
            );
          })}
        </ul>
      <div data-xray-tier className="mt-2">
        <p className="text-zinc-400">
          tier {tier}, {TIER_WHY[tier]}
        </p>
        <p>
          dpr max {GLOBE_DPR_MAX[tier]}, ground segments {budget.groundSegments.join("/")}
        </p>
      </div>
      </details>
    </div>
  );
}
