import { describe, expect, it } from "vitest";
import { createMurmurTracker, initialMurmurState, MURMUR_LINGER_MS, stepMurmurLandmark } from "./murmur.ts";

describe("murmur: stepMurmurLandmark (one landmark's own transition)", () => {
  it("never ripples with fewer than 2 lanterns", () => {
    const result = stepMurmurLandmark(initialMurmurState(), 1, 0);
    expect(result.rippled).toBe(false);
    expect(result.state.since).toBeNull();
  });

  it("starts the clock the first moment 2+ lanterns are present, but does not ripple immediately", () => {
    const result = stepMurmurLandmark(initialMurmurState(), 2, 1_000);
    expect(result.rippled).toBe(false);
    expect(result.state.since).toBe(1_000);
  });

  it("ripples once the linger threshold elapses with 2+ still present", () => {
    let state = initialMurmurState();
    ({ state } = stepMurmurLandmark(state, 2, 0));
    const atThreshold = stepMurmurLandmark(state, 2, MURMUR_LINGER_MS);
    expect(atThreshold.rippled).toBe(true);
  });

  it("does not ripple twice for the same uninterrupted lingering spell", () => {
    let state = initialMurmurState();
    ({ state } = stepMurmurLandmark(state, 2, 0));
    ({ state } = stepMurmurLandmark(state, 2, MURMUR_LINGER_MS)); // ripples
    const again = stepMurmurLandmark(state, 2, MURMUR_LINGER_MS + 5_000);
    expect(again.rippled).toBe(false);
  });

  it("resets once the count drops below 2, so a fresh spell can ripple again", () => {
    let state = initialMurmurState();
    ({ state } = stepMurmurLandmark(state, 2, 0));
    ({ state } = stepMurmurLandmark(state, 2, MURMUR_LINGER_MS)); // ripples
    ({ state } = stepMurmurLandmark(state, 1, MURMUR_LINGER_MS + 100)); // drops below 2
    expect(state.since).toBeNull();
    ({ state } = stepMurmurLandmark(state, 2, MURMUR_LINGER_MS + 200)); // fresh spell begins
    const secondRipple = stepMurmurLandmark(state, 2, MURMUR_LINGER_MS + 200 + MURMUR_LINGER_MS);
    expect(secondRipple.rippled).toBe(true);
  });
});

describe("murmur: createMurmurTracker (many landmarks at once)", () => {
  it("ripples per landmark independently", () => {
    const tracker = createMurmurTracker();
    tracker.step(new Map([["bridge", 2], ["doori", 1]]), 0);
    const rippled = tracker.step(new Map([["bridge", 2], ["doori", 1]]), MURMUR_LINGER_MS);
    expect(rippled).toEqual(["bridge"]);
  });
});
