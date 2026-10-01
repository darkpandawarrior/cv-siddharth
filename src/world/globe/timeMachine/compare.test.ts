import { expect, it } from "vitest";
import { clampSplit, createCompare, nudgeCompare, setCompareSplit, sideAtScreenX } from "./index.ts";

const left = { dateMs: 0, layer: "VIIRS" };
const right = { dateMs: 86400000, layer: "MODIS" };

it("clamps drag splits while preserving independent side dates/layers", () => {
  expect([-Infinity, -1, 0.02, 0.5, 0.98, 1, Infinity, NaN].map(clampSplit)).toEqual([0.02, 0.02, 0.02, 0.5, 0.98, 0.98, 0.98, 0.5]);
  const state = createCompare(left, right, -1);
  expect(state).toEqual({ left, right, split: 0.02 });
  expect(state.left).not.toBe(left);
  expect(setCompareSplit(state, 2)).toEqual({ left, right, split: 0.98 });
  expect(state.split).toBe(0.02);
  expect(createCompare(left, right).split).toBe(0.5);
});

it("rejects invalid dates and empty layer identifiers on either side", () => {
  for (const invalid of [{ dateMs: NaN, layer: "x" }, { dateMs: 0, layer: " " }]) {
    expect(() => createCompare(invalid, right)).toThrow(RangeError);
    expect(() => createCompare(left, invalid)).toThrow(RangeError);
  }
});

it("supports arrows, shift, home/end and leaves unrelated keys alone", () => {
  const state = createCompare(left, right);
  for (const key of ["ArrowLeft", "ArrowDown"]) expect(nudgeCompare(state, key).split).toBeCloseTo(0.49);
  for (const key of ["ArrowRight", "ArrowUp"]) expect(nudgeCompare(state, key).split).toBeCloseTo(0.51);
  expect(nudgeCompare(state, "ArrowLeft", true).split).toBeCloseTo(0.4);
  expect(nudgeCompare(state, "ArrowRight", true).split).toBeCloseTo(0.6);
  expect(nudgeCompare(state, "Home").split).toBe(0.02);
  expect(nudgeCompare(state, "End").split).toBe(0.98);
  expect(nudgeCompare(nudgeCompare(state, "Home"), "ArrowLeft").split).toBe(0.02);
  expect(nudgeCompare(nudgeCompare(state, "End"), "ArrowRight").split).toBe(0.98);
  expect(nudgeCompare(state, "Escape")).toBe(state);
});

it("maps screen x using viewport origin/width and gives the seam to the right", () => {
  expect(sideAtScreenX(299.99, 100, 400, 0.5)).toBe("left");
  expect(sideAtScreenX(300, 100, 400, 0.5)).toBe("right");
  expect(sideAtScreenX(900, 100, 400, 0.5)).toBe("right");
  expect(sideAtScreenX(0, 100, 400, 0.5)).toBe("left");
  expect(sideAtScreenX(107, 100, 400, -2)).toBe("left");
  expect(sideAtScreenX(108, 100, 400, -2)).toBe("right");
  for (const [x, origin, width] of [[NaN, 0, 10], [0, NaN, 10], [0, 0, Infinity], [0, 0, 0], [0, 0, -1]]) expect(sideAtScreenX(x, origin, width, 0.5)).toBeNull();
});
