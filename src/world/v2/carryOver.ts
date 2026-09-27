/**
 * CRAFT-5 / M6 / M70: the v1 to v2 carry-over manifest (idea-atlas.md#CRAFT-5,
 * master-plan.md#M6, #M70, lane P3-05/I11).
 *
 * world-v2-spec.md never mentions several v1 features by name (idea-atlas.md
 * item 5's own warning: gps.ts, Threads.tsx, LiveLitMapOverlay.tsx/litMap.ts,
 * explored.ts, Corpus.tsx, Trail.tsx). This file is the gate that stops a
 * swap PR from silently dropping one: every v1 feature id below is marked
 * `ported` (with the v2 file that now carries it), `degraded` (reused as a
 * different mechanic/geometry, with why) or `dropped` (not carried forward,
 * with why): `carryOver.test.ts` fails the build if an id goes missing, if
 * a `ported` entry's file does not exist, or if `ARCHIVED_V1_FILES` names a
 * file any `src/world/v2/**` module still imports.
 *
 * Status was assigned by reading each v1 file's real callers: `git grep`
 * across `src/world/v2` for every top-level `src/world/*` module. A file a
 * v2 module imports (even a type-only import) is load-bearing and can never
 * appear in `ARCHIVED_V1_FILES`: `city.ts`, `cityData.ts`, `deviceTier.ts`,
 * `reducedMotion.ts`, `palette.ts`, `input.ts`, `gps.ts`, `artifacts.ts`,
 * `explored.ts`, `Ghosts.tsx`, `Rain.tsx`, `realityRows.ts`,
 * `litMapSyncChannel.ts`, `progress.ts` and `AltitudeRail.tsx` are shared
 * infrastructure the v1 world and v2 world both stand on, so they are never
 * archived even though v1 itself is (M70).
 *
 * P4-00 archives (never deletes, M70) exactly `ARCHIVED_V1_FILES` behind the
 * world-v1 registry row's five hidden entry points
 * (`src/archive/registry.ts`'s `{ from: "carryOver:archived" }` shape) once
 * the phase-3 production crawl has passed.
 */

export type CarryOverStatus = "ported" | "degraded" | "dropped";

export interface CarryOverEntry {
  /** The v1 feature id, as named in master-plan.json's task list. */
  id: string;
  status: CarryOverStatus;
  /** Required (and must exist on disk) when status is "ported": the v2
   *  file that now carries this feature. */
  file?: string;
  /** Required when status is "degraded" or "dropped": why. */
  reason?: string;
}

export const CARRY_OVER: readonly CarryOverEntry[] = [
  {
    id: "gps",
    status: "ported",
    file: "src/world/v2/layers/GpsLens.tsx",
    reason:
      "GpsLens.tsx imports gps.ts's TrackFilter/meanError/accuracyPct/rawFix/stepDistance directly and draws the live accuracyPct HUD reading (P3-06).",
  },
  {
    id: "threads",
    status: "dropped",
    reason:
      "world-v2-spec.md designs no home for the 9-facet authored/discovered pillars-and-arcs geometry, and no src/world/v2 module imports threads.ts or Threads.tsx.",
  },
  {
    id: "litMap",
    status: "ported",
    file: "src/world/v2/hud/LitMap.tsx",
    reason: "LitMap.tsx ports LiveLitMapOverlay's read-only fallback onto the valley's own bounds (P3-06).",
  },
  {
    id: "explored",
    status: "ported",
    file: "src/world/v2/hud/Explored.tsx",
    reason: "Explored.tsx imports v1's explored.ts directly, writing the same playground:explored key from either world (P3-06).",
  },
  {
    id: "corpus",
    status: "degraded",
    reason:
      "Corpus.tsx bundled the chess ridge, repertoire pillars, weeb field and Excelsior blocks in one component; v2 splits these across separate landmarks instead (Terrain.tsx's chess-ridge relief, Fireflies.tsx's firefly-meadow, the old-town-excelsior kit; world-v2-spec.md#5 rows 15/16/18) and drops the repertoire-pillars piece on its own (see the repertoire-pillars entry); Corpus.tsx itself is not imported by any v2 module.",
  },
  {
    id: "trail",
    status: "dropped",
    reason:
      "v1's own Trail.tsx already retired its geometry before v2 existed (its docstring: Wake.tsx's read-lines draw 'where the car is and has been' better); a trail has no meaning on a river (M6), and v2's boat is constrained to riverSpline with no lane network to backtrack against.",
  },
  {
    id: "wake",
    status: "ported",
    file: "src/world/v2/layers/GpsLens.tsx",
    reason:
      "the raw-vs-fused wake mechanic (not Wake.tsx's ground read-line wall, which has no v2 caller) is what GpsLens.tsx draws: 'the reported track scatters on the water beside the fused wake' (idea-atlas.md, P3-06 commit message).",
  },
  {
    id: "artifacts",
    status: "ported",
    file: "src/world/v2/layers/Garlands.tsx",
    reason: "Garlands.tsx imports artifacts.ts's ARTIFACTS directly and renders them as floating marigold garlands (P3-06, living-ledger-spec.md#C7).",
  },
  {
    id: "ghosts",
    status: "ported",
    file: "src/world/v2/layers/Lanterns.tsx",
    reason: "Lanterns.tsx imports Ghosts.tsx's GHOST_CHANNEL directly, reusing the live-presence count unchanged, redrawn as paper lanterns (P3-06, living-ledger-spec.md#C6).",
  },
  {
    id: "pavilions",
    status: "degraded",
    reason:
      "the AABB approach-sensor mechanic is reused (src/world/v2/fiction/ObservatorySensor.tsx's own docstring is modelled directly on Pavilions.tsx's sensor), but reimplemented rather than imported, because v2 has no shared boat-position singleton yet (v1's telemetry.ts has no v2 counterpart; Hodi.tsx keeps state in its own refs). Pavilions.tsx itself is not imported by any v2 module.",
  },
  {
    id: "monuments",
    status: "degraded",
    reason:
      "Monuments.tsx's grid-city case-study obelisks/employer blocks/project towers are replaced by ghat/hero-stone geometry off the same profile.ts/projectStats.ts fields, via recordBindings.ts and LandmarksRecords.tsx (world-v2-spec.md#5 rows 11-12, P3-01f). Monuments.tsx itself is not imported by any v2 module.",
  },
  {
    id: "districtWest",
    status: "degraded",
    reason:
      "the west-district lane layout is replaced by valley.ts's bank-placement functions (§2.1) and recordBindings.ts, deriving the same data into ghat/terrace positions instead of a grid-city district. districtWest.ts itself is not imported by any v2 module.",
  },
  {
    id: "reality-ledger",
    status: "ported",
    file: "src/world/v2/ledger.ts",
    reason: "ledger.ts/ledgerRows.ts/LedgerPanel.tsx carry the ledger forward, and ledgerRows.ts imports v1's realityRows.ts (recentPushes, siteCiGlow) directly.",
  },
  {
    id: "skyBinding",
    status: "ported",
    file: "src/world/v2/live/sangamSky.ts",
    reason:
      "sangamSky.ts (with skyFrame.ts) replaces skyBinding.ts's SkyState-to-uniforms binding with v2's own uniform vocabulary (uSkyZen/uSkyUp/uHorizonGlow/uHaze/uSunCol), decoding the night row byte-for-byte from the same src/lib/nightSurvey.ts constants v1 used (its own docstring, M48).",
  },
  {
    id: "rain",
    status: "ported",
    file: "src/world/v2/layers/RainV2.tsx",
    reason: "RainV2.tsx imports v1's Rain.tsx rainMode directly.",
  },
  {
    id: "lamps",
    status: "ported",
    file: "src/world/v2/layers/CommitDiyas.tsx",
    reason:
      "CommitDiyas.tsx's own docstring names Lamps.tsx as its predecessor and reuses the same 24h/last-20 recentPushes window (realityRows.ts, M53): 'one floating diya per public push in the last 24h ... the same window the v1 world's Lamps.tsx and the ledger's Pushes row already use.'",
  },
  {
    id: "repertoire-pillars",
    status: "dropped",
    reason: "they belong in /chess (world-v2-spec.md's own line, master-plan.md#M6).",
  },
];

/**
 * The checker under test (carryOver.test.ts): pure, so it can run against
 * both `CARRY_OVER` and a break-it fixture. Flags a required id with no
 * entry, a `ported` entry with no `file`, and a `degraded`/`dropped` entry
 * with no `reason`: the swap PR (P3-07) cannot proceed while this returns
 * anything.
 */
export function carryOverViolations(
  entries: readonly CarryOverEntry[],
  requiredIds: readonly string[],
): string[] {
  const violations: string[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of requiredIds) {
    if (!byId.has(id)) violations.push(`missing v1 id: ${id}`);
  }
  for (const entry of entries) {
    if (entry.status === "ported" && !entry.file) {
      violations.push(`${entry.id}: status "ported" has no file`);
    }
    if (entry.status !== "ported" && !entry.reason) {
      violations.push(`${entry.id}: status "${entry.status}" has no reason`);
    }
  }
  return violations;
}

/**
 * v1-only files (no `src/world/v2/**` module imports them, by the same
 * grep this manifest was built from) that v1 retirement would otherwise
 * delete outright. M70 archives them instead, behind the world-v1 registry
 * row's five hidden entry points: this is that list (P4-00).
 */
export const ARCHIVED_V1_FILES: readonly string[] = [
  "src/world/altitude.ts",
  "src/world/Artifacts.tsx",
  "src/world/audio.ts",
  "src/world/autopilot.ts",
  "src/world/Corpus.tsx",
  "src/world/corpusData.ts",
  "src/world/corridorPlate.ts",
  "src/world/CorridorPlate.tsx",
  "src/world/craftPhysics.ts",
  "src/world/destinations.ts",
  "src/world/districtWest.ts",
  "src/world/drive.ts",
  "src/world/dwell.ts",
  "src/world/Fixtures.tsx",
  "src/world/FleetSkyline.tsx",
  "src/world/FoundationHub.tsx",
  "src/world/ghostId.ts",
  "src/world/ghostReadlines.ts",
  "src/world/heightfield.ts",
  "src/world/Hud.tsx",
  "src/world/labels.ts",
  "src/world/Lamps.tsx",
  "src/world/LandmarkPanel.tsx",
  "src/world/Landmarks.tsx",
  "src/world/litMap.ts",
  "src/world/litMapSync.ts",
  "src/world/LiveLitMapOverlay.tsx",
  "src/world/Monuments.tsx",
  "src/world/Nav.tsx",
  "src/world/obstacles.ts",
  "src/world/pavilionGeometry.ts",
  "src/world/Pavilions.tsx",
  "src/world/progressReset.ts",
  "src/world/Props.tsx",
  "src/world/resolve.ts",
  "src/world/ResolveField.tsx",
  "src/world/Sky.tsx",
  "src/world/skyBinding.ts",
  "src/world/SpawnFlyIn.tsx",
  "src/world/telemetry.ts",
  "src/world/Terrain.tsx",
  "src/world/terrainPlate.ts",
  "src/world/terrainRelief.ts",
  "src/world/threads.ts",
  "src/world/Threads.tsx",
  "src/world/Trail.tsx",
  "src/world/Vehicle.tsx",
  "src/world/Wake.tsx",
  "src/world/World.tsx",
  "src/world/worldData.ts",
  "src/world/WorldLabels.tsx",
];
