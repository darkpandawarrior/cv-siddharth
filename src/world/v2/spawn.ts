/**
 * The spawn shot, composed by real time of day (living-ledger-spec §5.2).
 * Pure, like `valley.ts` and `skyFrame.ts` — no three/R3F imports.
 *
 * world-v2-spec §4's fixed "golden hour always" spawn is amended: the
 * daypart now comes from the real sun (`src/lib/sky.ts` `daypartFor`), and
 * only its one ambiguous case — `"golden"`, which happens once at dawn and
 * again at dusk — needs `sunAzDeg` to tell which. `"day"` is always
 * downstream regardless of morning/afternoon (spawn.test.ts's 12:27 case,
 * picked deliberately either side of solar noon, pins exactly that).
 */

import type { Daypart } from "../../lib/sky.ts";
import { riverX, sangamBasin, valleyZ } from "./valley.ts";

export type Facing = "downstream" | "upstream" | "sangam";

export interface SpawnPose {
  pos: [number, number, number];
  look: [number, number, number];
  facing: Facing;
}

const basin = sangamBasin();

// The reference composition (world-v2-spec §4): camera at the river centre
// + 2.5 m at z = valleyZ("2023-02"), y = 1.9, looking 180 m downstream
// toward the bridge/Sangam.
const DOWNSTREAM_SPAWN_Z = valleyZ("2023-02");
const CHASE_Y = 1.9;
const LOOK_Y = 6;
const LOOK_AHEAD_M = 180;

function downstreamPose(): SpawnPose {
  const z = DOWNSTREAM_SPAWN_Z;
  const lookZ = z + LOOK_AHEAD_M;
  return {
    pos: [riverX(z) + 2.5, CHASE_Y, z],
    look: [riverX(lookZ), LOOK_Y, lookZ],
    facing: "downstream",
  };
}

// Not given a literal composition by any spec (only "the sun behind the
// ghats of the past, rim-lit steps" — living-ledger §5.2); mirrored from
// the downstream shot at the same units/offsets, near the Sangam looking
// back toward the years already crossed.
const UPSTREAM_SPAWN_Z = basin.z - 40;

function upstreamPose(): SpawnPose {
  const z = UPSTREAM_SPAWN_Z;
  const lookZ = z - LOOK_AHEAD_M;
  return {
    pos: [riverX(z) - 2.5, CHASE_Y, z],
    look: [riverX(lookZ), LOOK_Y, lookZ],
    facing: "upstream",
  };
}

// "Over the Sangam" (living-ledger §5.2) — no bank-relative facing, so this
// looks at the basin centre itself rather than up/down the river.
function sangamPose(): SpawnPose {
  return {
    pos: [basin.x, 8, basin.z - 30],
    look: [basin.x, 4, basin.z],
    facing: "sangam",
  };
}

/** `sunAzDeg < 180` reads as morning (the sun has not yet crossed the
 *  meridian) — the same convention `src/lib/sky.ts skyState()` uses via
 *  `now < solarNoon`, restated here in azimuth terms because this module
 *  only ever sees the azimuth, not the clock. */
function isMorningAz(sunAzDeg: number): boolean {
  return ((sunAzDeg % 360) + 360) % 360 < 180;
}

export function spawnPose(daypart: Daypart, sunAzDeg: number): SpawnPose {
  if (daypart === "night") return sangamPose();
  if (daypart === "dawn" || daypart === "day") return downstreamPose();
  if (daypart === "dusk") return upstreamPose();
  // "golden" — the only case that happens twice a day.
  return isMorningAz(sunAzDeg) ? downstreamPose() : upstreamPose();
}
