import { describe, expect, it } from "vitest";
import { estimatePlaybackSpeed, replayWindow } from "./replayWindow.ts";

describe("estimatePlaybackSpeed", () => {
  it("smooths toward the instantaneous sim/wall ratio", () => {
    let speed = 0;
    speed = estimatePlaybackSpeed(speed, 3600_000, 1000); // 3600x, one frame
    expect(speed).toBeCloseTo(3600 * 0.3, 5);
    for (let i = 0; i < 50; i++) speed = estimatePlaybackSpeed(speed, 3600_000, 1000);
    expect(speed).toBeCloseTo(3600, 1);
  });
  it("holds the previous estimate when no real time passed", () => {
    expect(estimatePlaybackSpeed(42, 1000, 0)).toBe(42);
    expect(estimatePlaybackSpeed(42, 1000, -5)).toBe(42);
    expect(estimatePlaybackSpeed(42, NaN, 16)).toBe(42);
    expect(estimatePlaybackSpeed(42, Infinity, 16)).toBe(42);
  });
});

describe("replayWindow", () => {
  it("widens with speed and floors at a 1x-equivalent window", () => {
    expect(replayWindow(10_000, 0)).toEqual([8000, 10_000]);
    expect(replayWindow(10_000, 1)).toEqual([8000, 10_000]);
    expect(replayWindow(10_000, 3600)).toEqual([10_000 - 2000 * 3600, 10_000]);
    expect(replayWindow(10_000, -3600)).toEqual([10_000 - 2000 * 3600, 10_000]); // magnitude only, per pulseState's own |speed|
  });
});
