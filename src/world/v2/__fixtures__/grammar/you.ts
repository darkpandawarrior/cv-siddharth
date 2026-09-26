import type { You } from "../../worldModel.ts";
import type { LastSeen } from "../../visitDiff.ts";

export function buildFixtureYou(lastSeen: LastSeen | null = null): You {
  return { touched: [], lastSeen, tier: 1, reducedMotion: false };
}
