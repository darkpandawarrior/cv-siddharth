import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * render.md finding 3 (P1, 2026-09-30): TileLayer.tsx used to force
 * `generateMipmaps = false` / `minFilter = LinearFilter` with no anisotropy
 * set at all, causing moire/shimmer on GIBS tiles at the default (zoomed-out)
 * view. Source-text guard rather than a full R3F mount: the texture setup
 * lives inside a `fetch().then()` chain triggered from `useFrame`, which
 * needs a real WebGL context + network to exercise directly — not worth a
 * heavy mount for a defect that is entirely about which lines are present.
 */
describe("TileLayer texture setup enables mipmaps and anisotropy", () => {
  const source = readFileSync(join(new URL(".", import.meta.url).pathname, "TileLayer.tsx"), "utf8");

  it("no longer disables mipmaps", () => {
    expect(source).not.toMatch(/generateMipmaps\s*=\s*false/);
  });

  it("sets anisotropy, capped at 8 on tier 2", () => {
    expect(source).toMatch(/texture\.anisotropy\s*=\s*tier === 2 \? Math\.min\(maxAniso, 8\) : maxAniso/);
  });
});
