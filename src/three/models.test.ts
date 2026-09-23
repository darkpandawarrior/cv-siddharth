import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODELS, type ModelName } from "./models.ts";

// Mirrors the per-asset kb_budget rows in scripts/blender/*.py / the design
// spec (section 5). studio-orbit carries the pre-existing 297 KB sculpture
// plus the new hex plinth (+40 KB budget).
const KB_BUDGET: Record<ModelName, number> = {
  "studio-orbit": 337,
  "signal-marker": 20,
  "skills-core": 30,
  "blueprint-instrument": 150,
  "chess-handoff-marker": 15,
  "world-monuments": 60,
  "kmp-foundation-keystone": 20,
};

describe("MODELS registry", () => {
  for (const [name, path] of Object.entries(MODELS) as [ModelName, string][]) {
    it(`${name} exists under public/models and is within its KB budget`, () => {
      const abs = fileURLToPath(new URL(`../../public${path}`, import.meta.url));
      expect(existsSync(abs)).toBe(true);
      const kb = statSync(abs).size / 1024;
      expect(kb).toBeLessThanOrEqual(KB_BUDGET[name]);
    });
  }

  it("new assets (excluding the pre-existing studio-orbit sculpture) total at most 295 KB", () => {
    const total = (Object.entries(MODELS) as [ModelName, string][])
      .filter(([name]) => name !== "studio-orbit")
      .reduce((sum, [, path]) => {
        const abs = fileURLToPath(new URL(`../../public${path}`, import.meta.url));
        return sum + statSync(abs).size / 1024;
      }, 0);
    expect(total).toBeLessThanOrEqual(295);
  });
});
