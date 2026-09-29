import { describe, expect, it } from "vitest";
import {
  isXrayEnabled,
  levelColorHex,
  setXrayEnabled,
  subscribeXray,
  LEVEL_COLOR_HEX,
  getXrayStats,
  setXrayStats,
  resetXrayStats,
} from "./xrayState.ts";

describe("xrayState", () => {
  it("notifies subscribers on a real change, but not on a no-op set", () => {
    setXrayEnabled(false); // known starting state, this module is a singleton across tests
    let calls = 0;
    const unsubscribe = subscribeXray(() => calls++);
    setXrayEnabled(true);
    expect(isXrayEnabled()).toBe(true);
    expect(calls).toBe(1);
    setXrayEnabled(true); // same value: no notification
    expect(calls).toBe(1);
    setXrayEnabled(false);
    expect(isXrayEnabled()).toBe(false);
    expect(calls).toBe(2);
    unsubscribe();
    setXrayEnabled(true);
    expect(calls).toBe(2); // unsubscribed: no further notifications
    setXrayEnabled(false); // leave it off for any other test importing this module
  });

  it("clamps level to the palette's own range, never invents a colour", () => {
    expect(levelColorHex(0)).toBe(LEVEL_COLOR_HEX[0]);
    expect(levelColorHex(-3)).toBe(LEVEL_COLOR_HEX[0]);
    expect(levelColorHex(17)).toBe(LEVEL_COLOR_HEX[LEVEL_COLOR_HEX.length - 1]);
  });

  it("resetXrayStats zeroes a real reading instead of leaving it a stale ghost", () => {
    // Regression for the wave-8 defect: switching earth style away from
    // "imagery" (or tier flipping to 3) unmounts layers/XRayTiles.tsx, whose
    // cleanup must call this so the stats card never keeps showing numbers
    // from a frame that no longer exists.
    setXrayStats({ drawCalls: 46, triangles: 124_559, geometries: 3, textures: 2, fps: 60 });
    expect(getXrayStats().drawCalls).toBe(46);
    resetXrayStats();
    expect(getXrayStats()).toEqual({ drawCalls: 0, triangles: 0, geometries: 0, textures: 0, fps: 0 });
  });
});
