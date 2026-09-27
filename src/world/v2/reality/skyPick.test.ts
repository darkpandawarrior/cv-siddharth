import { describe, expect, it } from "vitest";
import { PICK_RADIUS_PX, PICK_RADIUS_TOUCH_PX, skyPick } from "./skyPick.ts";

describe("skyPick", () => {
  it("returns the nearest candidate within the radius", () => {
    const candidates = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 100, y: 100 },
    ];
    expect(skyPick(candidates, 9, 0, 16)).toBe("b");
  });

  it("returns null beyond the radius", () => {
    const candidates = [{ id: "a", x: 0, y: 0 }];
    expect(skyPick(candidates, 20, 0, PICK_RADIUS_PX)).toBeNull();
  });

  it("a point exactly on the radius boundary still counts", () => {
    const candidates = [{ id: "a", x: 16, y: 0 }];
    expect(skyPick(candidates, 0, 0, 16)).toBe("a");
  });

  it("the touch radius picks up what the mouse radius misses", () => {
    const candidates = [{ id: "a", x: 20, y: 0 }];
    expect(skyPick(candidates, 0, 0, PICK_RADIUS_PX)).toBeNull();
    expect(skyPick(candidates, 0, 0, PICK_RADIUS_TOUCH_PX)).toBe("a");
  });

  it("breaks an exact tie in favour of the first-seen candidate", () => {
    const candidates = [
      { id: "a", x: 5, y: 0 },
      { id: "b", x: -5, y: 0 },
    ];
    expect(skyPick(candidates, 0, 0, 16)).toBe("a");
  });

  it("an empty candidate list picks nothing", () => {
    expect(skyPick([], 0, 0, 16)).toBeNull();
  });
});
