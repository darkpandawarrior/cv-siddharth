import { describe, it, expect, beforeEach } from "vitest";
import { touch, getTouched, _resetForTests } from "./sessionRipple";

// ponytail: @testing-library/react isn't a devDependency (same note as
// useLiveSignal.test.ts), so this exercises touch/getTouched directly rather
// than renderHook — useTouched is a thin useSyncExternalStore wrapper over
// exactly this state, so the contract is fully covered here.
describe("sessionRipple", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("starts empty", () => {
    expect(getTouched()).toEqual([]);
  });

  it("records a touch, most recent last", () => {
    touch("doori");
    touch("gaddi");
    expect(getTouched()).toEqual(["doori", "gaddi"]);
  });

  it("moves a repeated touch to the end instead of duplicating it", () => {
    touch("doori");
    touch("gaddi");
    touch("doori");
    expect(getTouched()).toEqual(["gaddi", "doori"]);
  });

  it("caps at 12 entries, dropping the oldest", () => {
    for (let i = 0; i < 15; i++) touch(`node-${i}`);
    const result = getTouched();
    expect(result).toHaveLength(12);
    expect(result[0]).toBe("node-3");
    expect(result[result.length - 1]).toBe("node-14");
  });

  it("never mutates the previous snapshot in place", () => {
    touch("doori");
    const first = getTouched();
    touch("gaddi");
    expect(first).toEqual(["doori"]);
    expect(getTouched()).toEqual(["doori", "gaddi"]);
  });
});
