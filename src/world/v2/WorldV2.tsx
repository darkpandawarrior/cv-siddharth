/**
 * The Sangam hub (this lane's own task list, master-plan.md#M17/#M22/#M36/
 * #M56/#M67/#M68): assembles every phase-2 world-v2 piece — terrain, water,
 * sky, environment, post, the hodi, the growth grammar and its ledger —
 * behind ONE route, `/playground?world=v2` (preview only, `playground.tsx`
 * gates that). Phase-3/4 lanes extend this hub through `layers.ts`/
 * `kits.ts`'s glob registries, never by editing this file.
 *
 * `<Canvas>` is `aria-hidden`; `HudV2` (a DOM sibling, never a child) is the
 * whole accessible surface — the same split `World.tsx` (v1) already uses.
 */
import { useEffect, useMemo, useState, type JSX } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFSoftShadowMap } from "three";
import { SkyDome } from "./SkyDome.tsx";
import { Env } from "./Env.tsx";
import { Terrain } from "./Terrain.tsx";
import { Water } from "./Water.tsx";
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

export default function WorldV2(): JSX.Element {
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

  // ponytail: spawnPose's CHASE_Y (spawn.ts) is a fixed world-space height
  // (~1.9 m), written against a flat, Y=0 river assumption. The real
  // heightmap Terrain.tsx now loads (P2-05's gen-terrain.mjs) ranges from
  // about -3 m to +102 m across the valley, and GRAMMAR features
  // (worldModel.ts's own buildFeature) place at a fixed y=0 too — neither
  // was reconciled against the other before this lane, the first one to
  // mount both together. The result: the spawn camera and every
  // GrammarInstances placeholder can sit well below or above the real
  // ground at their (x,z), which reads as a bad camera angle rather than a
  // ledger/grammar bug. Fixing it needs a shared terrain-height sampler
  // neither valley.ts nor worldModel.ts owns yet (this lane owns neither) —
  // flagged for whichever lane gives GRAMMAR/spawn a real y = terrainHeight
  // (x, z) call, not patched here with a second, disagreeing height guess.
  const spawn = useMemo(() => {
    const daypart = nowModel?.now.sky.daypart ?? "day";
    const sunAzDeg = nowModel?.raw.sky?.sun.azimuthDeg ?? 90;
    return spawnPose(daypart, sunAzDeg);
  }, [nowModel]);

  return (
    <div data-world="v2" className="absolute inset-0">
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 2]}
        camera={{ position: spawn.pos, fov: 46, near: 0.3, far: 3000 }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-hidden="true"
      >
        <ambientLight intensity={0.4} />
        <directionalLight castShadow position={[40, 80, 40]} intensity={1.1} />
        <SkyDome />
        <Env />
        <Terrain />
        <Water />
        <Hodi spawnZ={spawn.pos[2]} />
        {wm && <GrammarInstances worldModel={wm} highlightedRule={highlightedRule} />}
        {CANVAS_LAYERS.map((layer) => (
          <layer.Component key={layer.id} />
        ))}
        <Post tier={tier} look="golden" />
      </Canvas>

      {wm && (
        <div aria-hidden="true">
          <GrammarInstancesDom worldModel={wm} highlightedRule={highlightedRule} />
        </div>
      )}

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
