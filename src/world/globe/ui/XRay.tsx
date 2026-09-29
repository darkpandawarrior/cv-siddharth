// LANE C2 ("X-ray mode"): the DOM half of the engineering showcase —
// legend, stats card, imagery stack and tier readout — that pairs with
// layers/XRayTiles.tsx (the scene half, drawing the tile outlines this
// legend counts). Everything here is read from what is already loaded and
// already drawn: no new fetch, no invented numbers.
import { useEffect, useState } from "react";
import { simTime, useGlobe, type StatusKey } from "../globeStore.ts";
import { catalogDateLabel, GIBS_CATALOG } from "../layers/gibsCatalog.ts";
import { drawnTileSet } from "../layers/TileLayer.tsx";
import { getXrayStats, levelColorHex, subscribeXrayStats, type XrayStats } from "../layers/xrayState.ts";
import { tierBudget } from "../../deviceTier.ts";

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
      data-xray-panel
      className="pointer-events-none flex w-64 flex-col gap-2.5 rounded-lg glass-panel p-3 font-mono text-xs leading-snug text-zinc-300"
    >
      <p className="text-zinc-400">
        X-ray mode <span aria-hidden>&middot;</span> read-only, reflects what is actually drawn
      </p>

      <div data-xray-stats className="grid grid-cols-2 gap-x-3 gap-y-0.5">
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
          <ul>
            {tiles.byLevel.map(({ level, count }) => (
              <li key={level} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: levelColorHex(level) }} />
                level {level}, {count}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-xray-imagery>
        <p className="text-zinc-400">imagery stack</p>
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
      </div>

      <div data-xray-tier>
        <p className="text-zinc-400">
          tier {tier}, {TIER_WHY[tier]}
        </p>
        <p>
          dpr max {budget.dprMax}, ground segments {budget.groundSegments.join("/")}
        </p>
      </div>
    </div>
  );
}
