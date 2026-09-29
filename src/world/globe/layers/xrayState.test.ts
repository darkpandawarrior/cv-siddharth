import { describe, expect, it } from "vitest";
import { isXrayEnabled, levelColorHex, setXrayEnabled, subscribeXray, LEVEL_COLOR_HEX } from "./xrayState.ts";

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
});
