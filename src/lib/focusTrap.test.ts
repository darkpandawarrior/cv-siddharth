import { describe, expect, it } from "vitest";
import { wrapFocusTarget } from "./focusTrap";

describe("wrapFocusTarget", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };
  const list = [a, b, c];

  it("returns null for an empty list", () => {
    expect(wrapFocusTarget([], null, false)).toBeNull();
  });

  it("lets Tab through when focus is not on the last element", () => {
    expect(wrapFocusTarget(list, a, false)).toBeNull();
    expect(wrapFocusTarget(list, b, false)).toBeNull();
  });

  it("wraps Tab from the last element to the first", () => {
    expect(wrapFocusTarget(list, c, false)).toBe(a);
  });

  it("lets Shift+Tab through when focus is not on the first element", () => {
    expect(wrapFocusTarget(list, b, true)).toBeNull();
    expect(wrapFocusTarget(list, c, true)).toBeNull();
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    expect(wrapFocusTarget(list, a, true)).toBe(c);
  });

  it("traps a single-element dialog on itself in both directions", () => {
    expect(wrapFocusTarget([a], a, false)).toBe(a);
    expect(wrapFocusTarget([a], a, true)).toBe(a);
  });

  it("does nothing when the focused element isn't in the list", () => {
    expect(wrapFocusTarget(list, { id: "outside" }, false)).toBeNull();
  });
});
