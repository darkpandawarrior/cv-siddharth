import { expect, it } from "vitest";
import { cloudWhiteness } from "./cloudMask.ts";

it("separates bright neutral clouds from ocean, vegetation, desert and missing swaths", () => {
  expect(cloudWhiteness(0.9, 0.92, 0.94)).toBeGreaterThan(0.95);
  for (const [r, g, b] of [[0, 0, 0], [0.01, 0.05, 0.2], [0.1, 0.3, 0.05], [0.7, 0.45, 0.2]]) {
    expect(cloudWhiteness(r, g, b)).toBe(0);
  }
  expect(cloudWhiteness(0.4, 0.4, 0.4)).toBeGreaterThan(0);
  expect(cloudWhiteness(0.4, 0.4, 0.4)).toBeLessThan(1);
});
