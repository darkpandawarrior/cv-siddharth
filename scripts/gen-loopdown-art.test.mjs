import { describe, expect, it } from "vitest";

import { webpPathOf, shapeProblem } from "./gen-loopdown-art.mjs";
import { loopdownArt } from "../src/data/loopdownArt.ts";

describe("webpPathOf", () => {
  it("swaps a manifest .png path for its pre-optimized .webp sibling", () => {
    expect(webpPathOf("lore/assets/cast/the-archivist.png")).toBe("lore/assets/cast/the-archivist.webp");
  });

  it("is case-insensitive on the extension", () => {
    expect(webpPathOf("lore/assets/cast/x.PNG")).toBe("lore/assets/cast/x.webp");
  });
});

/**
 * The regression this generator refuses to ship, pinned directly rather than
 * only through the generator's own exit code: REC-9 names 13 cast and 8
 * series, and a silently un-captioned portrait would render fine and fail
 * nothing else in this repo.
 */
describe("shapeProblem", () => {
  const good = () => [
    ...Array.from({ length: 13 }, (_, i) => ({ kind: "cast", id: `c${i}`, alt: "a real caption" })),
    ...Array.from({ length: 8 }, (_, i) => ({ kind: "series", id: `s${i}`, alt: "a real caption" })),
  ];

  it("passes the correct 13 cast / 8 series shape with alt text everywhere", () => {
    expect(shapeProblem(good())).toBeNull();
  });

  it("fails on a shrunk cast (break-it fixture: one cast entry dropped)", () => {
    const entries = good().filter((_, i) => i !== 0);
    expect(shapeProblem(entries)).toMatch(/12 cast/);
  });

  it("fails on a grown series list too, the count is exact, not a floor", () => {
    const entries = [...good(), { kind: "series", id: "extra", alt: "x" }];
    expect(shapeProblem(entries)).toMatch(/9 series/);
  });

  it("fails when any entry has no alt text", () => {
    const entries = good();
    entries[0] = { ...entries[0], alt: "" };
    expect(shapeProblem(entries)).toBe("an entry has no alt text");
  });
});

describe("the committed loopdownArt.ts", () => {
  it("has exactly 13 cast and 8 series entries, each with a non-empty alt", () => {
    expect(shapeProblem(loopdownArt)).toBeNull();
  });

  it("gives every entry a HEAVY_ASSET_BASE-relative src under /loopdown/<kind>/", () => {
    for (const a of loopdownArt) {
      expect(a.src, a.id).toBe(`/loopdown/${a.kind}/${a.id}.webp`);
      expect(a.width, a.id).toBeGreaterThan(0);
      expect(a.height, a.id).toBeGreaterThan(0);
    }
  });
});
