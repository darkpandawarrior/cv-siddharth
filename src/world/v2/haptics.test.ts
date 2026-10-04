import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMuted } from "../audio.ts";
import { playImpact, playPickup } from "./haptics.ts";

vi.mock("../audio.ts", () => ({ isMuted: vi.fn(), playImpact: vi.fn(), playPickup: vi.fn() }));
const vibrate = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isMuted).mockReturnValue(false);
  vi.stubGlobal("navigator", { vibrate });
});
afterEach(() => vi.unstubAllGlobals());

describe("the shared audio mute gates haptics", () => {
  it("uses one impact pulse stepping ashore and two pickup pulses returning", () => {
    playImpact(); playPickup();
    expect(vibrate.mock.calls).toEqual([[40], [[20, 30, 20]]]);
  });
  it("does not vibrate or rumble while muted", () => {
    const playEffect = vi.fn();
    vi.stubGlobal("navigator", { vibrate, getGamepads: () => [{ vibrationActuator: { playEffect } }] });
    vi.mocked(isMuted).mockReturnValue(true);
    playImpact(); playPickup();
    expect(vibrate).not.toHaveBeenCalled();
    expect(playEffect).not.toHaveBeenCalled();
  });
  it("is harmless when vibration and gamepads are unsupported", () => {
    vi.stubGlobal("navigator", {});
    expect(() => { playImpact(); playPickup(); }).not.toThrow();
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("uses a connected gamepad actuator and tolerates a refused effect", async () => {
    const playEffect = vi.fn().mockRejectedValue(new Error("unsupported"));
    vi.stubGlobal("navigator", { getGamepads: () => [null, { vibrationActuator: { playEffect } }] });
    playImpact(0.5); playPickup();
    expect(playEffect.mock.calls).toEqual([
      ["dual-rumble", { duration: 40, strongMagnitude: 0.5, weakMagnitude: 0.25 }],
      ["dual-rumble", { duration: 70, strongMagnitude: 0.3, weakMagnitude: 0.15 }],
    ]);
    await Promise.resolve();
  });
});
