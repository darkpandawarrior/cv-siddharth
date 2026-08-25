import { describe, it, expect } from "vitest";
import { laneColors, worldLane, worldTint } from "./palette.ts";
import type { WorldPalette } from "./palette.ts";
import { surfaces } from "../data/surfaces.ts";

/* The palette as the browser resolves it. These are the fallbacks palette.ts
 * itself declares, so the test measures the same four lanes the world draws. */
const PAL = {
  signal: "#3ddc84",
  probe: "#5ee6ff",
  accent: "#f2a13d",
  text: "#e8efe9",
} as unknown as WorldPalette;

describe("the world keeps four lanes", () => {
  it("gives each registry group a different lane", () => {
    const groups = [...new Set(surfaces.map((s) => s.group).filter(Boolean))] as string[];
    const lanes = groups.map((g) => worldLane(g, PAL));
    expect(lanes.every(Boolean), `ungrouped: ${groups.filter((g) => !worldLane(g, PAL))}`).toBe(true);
    expect(new Set(lanes).size, `groups ${groups.join(", ")} collapsed to ${new Set(lanes).size} lane(s)`).toBe(
      groups.length,
    );
  });

  it("does not depend on tile hue, which has collapsed before", () => {
    // The registry deliberately reduced eight accents to three, and all three
    // sit within ten degrees of each other. Snapping by hue therefore sends
    // every room to one lane. This asserts the world no longer reads hue at
    // all for a grouped room, by checking that two rooms sharing a tint but
    // not a group still differ.
    const byTint = new Map<string, Set<string>>();
    for (const s of surfaces) {
      if (!s.tint || !s.group) continue;
      if (!byTint.has(s.tint)) byTint.set(s.tint, new Set());
      byTint.get(s.tint)!.add(s.group);
    }
    const shared = [...byTint.entries()].find(([, gs]) => gs.size > 1);
    if (!shared) return; // nothing to prove today; the first test still guards the mapping
    const [tint, gs] = shared;
    const viaHue = worldTint(tint, PAL);
    const viaGroup = [...gs].map((g) => worldLane(g, PAL));
    expect(new Set(viaGroup).size, `${[...gs].join("/")} share tint ${tint} and must not share a lane`).toBe(gs.size);
    expect(viaGroup.every((l) => l === viaHue)).toBe(false);
  });

  it("only ever returns one of the four lanes", () => {
    const lanes = new Set(laneColors(PAL));
    for (const g of ["proof", "corpus", "writing", "runs"]) {
      expect(lanes.has(worldLane(g, PAL)!), `${g} returned a colour that is not a lane`).toBe(true);
    }
    expect(worldLane("not-a-group", PAL)).toBeNull();
  });
});
