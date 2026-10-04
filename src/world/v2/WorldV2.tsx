/**
 * Sangam at /playground. Playground keeps the v1 rollback, capability
 * gates and concept fallback in the shared shell. Canvas is aria-hidden;
 * HudV2 is its accessible DOM sibling. Later layers register through the
 * canvas and HUD globs rather than changing this hub.
 */
import { useEffect, useMemo, useState, type JSX } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFSoftShadowMap } from "three";
import { SkyDome } from "./SkyDome.tsx";
import { Env } from "./Env.tsx";
import { Terrain } from "./Terrain.tsx";
import { Water } from "./Water.tsx";
import { LANDMARK_OPENS } from "./landmarkBindings.ts";
import { Hodi } from "./Hodi.tsx";
import { Post } from "./Post.tsx";
import { GrammarInstances, GrammarInstancesDom } from "./GrammarInstances.tsx";
import { HudV2 } from "./HudV2.tsx";
import { CANVAS_LAYERS } from "./layers.ts";
import { buildLedgerSections } from "./ledgerRows.ts";
import { useNowModel } from "./useNowModel.ts";
import { worldModel } from "./worldModel.ts";
import type { You } from "./worldModel.ts";
import type { LastSeen } from "./visitDiff.ts";
import { ledger } from "./ledger.ts";
import { TerrainSurface, loadTerrainHeightmap } from "./terrainSurface.tsx";
import { terrainHeight, type Heightmap } from "./terrainHeight.ts";
import { spawnPose } from "./spawn.ts";
import { deviceTier } from "../deviceTier.ts";
import { prefersReducedMotion } from "../reducedMotion.ts";
import { useTouched } from "../../lib/sessionRipple.ts";

const LAST_SEEN_KEY = "world:lastSeen";

/** S17 (living-ledger-spec §7.3): "Storage failures (private windows,
 *  blocked storage) fall back to the 30-day sentence" — wrapped in
 *  try/catch per the artifact-design browser-storage rule, same as every
 *  other localStorage read on this site (progress.ts, sessionRipple.ts). */
function readLastSeen(): LastSeen | null {
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSeen;
    if (typeof parsed.at !== "string" || typeof parsed.counts !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLastSeen(value: LastSeen): void {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(value));
  } catch {
    // Private window / blocked storage — the next visit just gets the
    // 30-day fallback sentence again, per visitDiff.ts's own contract.
  }
}

const IST_OFFSET_MIN = 5.5 * 60;
function minutesToPreviewAt(minutes: number, base: Date): Date {
  const dayStart = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return new Date(dayStart + (minutes - IST_OFFSET_MIN) * 60_000);
}
function previewAtToMinutes(d: Date): number {
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MIN) % 1440;
}

export default function WorldV2({ at }: { at?: string } = {}): JSX.Element {
  const arrival = Object.entries(LANDMARK_OPENS).find(([id, link]) => id === at || link.target === at)?.[0];
  const [heightmap, setHeightmap] = useState<Heightmap | null>(null);
  useEffect(() => {
    let active = true;
    loadTerrainHeightmap().then((hm) => { if (active) setHeightmap(hm); }).catch((error) => { console.error("Terrain heightmap unavailable", error); });
    return () => { active = false; };
  }, []);
  const [previewMinutes, setPreviewMinutes] = useState<number | null>(null);
  const [highlightedRule, setHighlightedRule] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<LastSeen | null>(null);
  const tier = useMemo(() => deviceTier(), []);
  const reducedMotion = prefersReducedMotion();
  const touched = useTouched();

  useEffect(() => {
    setLastSeen(readLastSeen());
  }, []);

  const previewAt = useMemo(() => {
    if (previewMinutes === null) return null;
    return minutesToPreviewAt(previewMinutes, new Date());
  }, [previewMinutes]);

  const nowModel = useNowModel(previewAt);

  const you: You = useMemo(
    () => ({ touched, lastSeen, tier, reducedMotion }),
    [touched, lastSeen, tier, reducedMotion],
  );

  const wm = useMemo(() => {
    if (!nowModel) return null;
    return worldModel(ledger, nowModel.now, you);
  }, [nowModel, you]);

  // Writes this visit's own snapshot back for NEXT time, once the model has
  // actually resolved — a write on every render would just restate "now"
  // forever and the diff would always read as "nothing new" (visitDiff.ts's
  // own `from`/`to` comparison needs THIS visit's counts to differ from
  // whatever was written on the visit before it).
  useEffect(() => {
    if (!wm) return;
    const counts: Record<string, number> = {};
    for (const row of wm.rows) counts[row.id] = row.binds.length;
    writeLastSeen({ at: new Date().toISOString(), counts });
  }, [wm]);

  const sections = useMemo(() => {
    if (!wm || !nowModel) return null;
    return buildLedgerSections(wm.rows, nowModel.raw);
  }, [wm, nowModel]);

  const daypart = nowModel?.now.sky.daypart ?? "day";
  const sunAzDeg = nowModel?.raw.sky?.sun.azimuthDeg ?? 90;
  const spawn = useMemo(() => spawnPose(daypart, sunAzDeg, heightmap ? (x, z) => terrainHeight(x, z, heightmap) : undefined), [daypart, sunAzDeg, heightmap]);
  const camera = useMemo(() => ({ position: spawn.pos, fov: 46, near: 0.3, far: 3000 }), [spawn.pos]);

  return (
    <div data-world="v2" className="absolute inset-0">
      {heightmap && <TerrainSurface value={heightmap}><Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 2]}
        camera={camera}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-hidden="true"
      >
        <ambientLight intensity={0.4} />
        <directionalLight castShadow position={[40, 80, 40]} intensity={1.1} />
        <SkyDome />
        <Env />
        <Terrain heightmap={heightmap} />
        <Water />
        {nowModel && <Hodi key={at ?? "spawn"} spawnZ={spawn.pos[2]} arrival={arrival} />}
        {wm && <GrammarInstances worldModel={wm} highlightedRule={highlightedRule} />}
        {CANVAS_LAYERS.map((layer) => (
          <layer.Component key={layer.id} />
        ))}
        <Post tier={tier} look="golden" />
      </Canvas></TerrainSurface>}

      {wm && (
        <div aria-hidden="true">
          <GrammarInstancesDom worldModel={wm} highlightedRule={highlightedRule} />
        </div>
      )}

      {/* World v1's own Playground.tsx carries a comment for exactly this
          gap: a full-bleed aria-hidden canvas with no heading of any level
          announces itself to a screen reader as nothing, and ships an
          h1-less document to a crawler. v2 had the same gap without the
          fix carried over — document.querySelector('h1') returned null.
          HudV2's own LandmarkList is already the accessible content this
          heads (a visually hidden list of real, Tab-reachable buttons); this
          just gives it — and the page — a name. */}
      <h1 className="sr-only">Sangam, the growth model drawn from real activity</h1>

      {sections && (
        <HudV2
          sections={sections}
          sinceSentence={wm?.diff?.sentence ?? null}
          features={wm?.features ?? []}
          rows={wm?.rows ?? []}
          highlightedRule={highlightedRule}
          onHoverRow={setHighlightedRule}
          previewMinutes={previewMinutes ?? (previewAt ? previewAtToMinutes(previewAt) : null)}
          onPreviewChange={setPreviewMinutes}
        />
      )}
    </div>
  );
}
