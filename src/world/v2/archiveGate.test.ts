// ponytail: archive(world-v1) until 2027-04-04; removal recipe in ARCHIVE.md#world-v1
import { describe, expect, it } from "vitest";
import { shouldOpen, sourceSpringPosition, SOURCE_SPRING_ID } from "./archiveGate.ts";
import { riverSpline } from "./valley.ts";
import { LANDMARK_OPENS } from "./landmarkBindings.ts";

const sample = (at: number, distance = 4, upstream = true) => ({ at, distance, upstream });
describe("archive spring", () => {
  it("requires two seconds within four metres", () => {
    expect(shouldOpen([sample(0), sample(1.999)])).toBe(false);
    expect(shouldOpen([sample(0), sample(2)])).toBe(true);
    expect(shouldOpen([sample(0), sample(2, 4.001)])).toBe(false);
    expect(shouldOpen([])).toBe(false);
  });
  it("resets for downstream input or leaving the spring inside the window", () => {
    expect(shouldOpen([sample(0), sample(1, 4, false), sample(2)])).toBe(false);
    expect(shouldOpen([sample(0), sample(1, 5), sample(2)])).toBe(false);
    expect(shouldOpen([sample(0, 4, false), sample(1), sample(3)])).toBe(true);
  });
  it("uses the spline start without publishing a landmark", () => {
    const start = riverSpline()[0];
    expect(sourceSpringPosition(start)).toEqual([start.x, 0, start.z]);
    expect(LANDMARK_OPENS).not.toHaveProperty(SOURCE_SPRING_ID);
  });
});

it("preserves all ordinary route search targets and rejects unknown targets", async () => {
  const { Route } = await import("../../routes/playground.tsx");
  const { NODES } = await import("../../data/storyMap.ts");
  const validate = Route.options.validateSearch;
  if (typeof validate !== "function") throw new Error("Expected route search validator");
  for (const node of NODES) expect(validate({ at: node.id })).toMatchObject({ at: node.id });
  expect(validate({ at: "source-spring" })).toMatchObject({ at: "source-spring" });
  expect(validate({ at: "unknown-arrival" })).toMatchObject({ at: undefined });
  expect(validate({ at: 42 })).toMatchObject({ at: undefined });
});
