import { describe, expect, it } from "vitest";
import { atTwoBoatMooring, createEchoBuffer, ECHO_WINDOW_MS, replayEcho, type EchoFrame, type EchoRecording } from "./echo.ts";
import { spawnState, type HodiState } from "./driveSpline.ts";

const ENV = { reducedMotion: false };

function frame(stateBefore: HodiState, steer: number, throttle: number, dtMs = 16): EchoFrame {
  return { stateBefore, input: { steer, throttle }, dtMs, env: ENV };
}

describe("echo: recording", () => {
  it("createEchoBuffer trims from the front, keeping at most windowMs of recorded time", () => {
    const buffer = createEchoBuffer(100);
    const s = spawnState(0);
    for (let i = 0; i < 10; i++) buffer.push(frame(s, 0, 0, 20));
    // 10 frames * 20ms = 200ms pushed into a 100ms window -> the buffer
    // trims down to the trailing 100ms.
    const { frames } = buffer.snapshot();
    const totalMs = frames.reduce((sum, f) => sum + f.dtMs, 0);
    expect(totalMs).toBeLessThanOrEqual(100);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThan(10);
  });

  it("never drops the last frame even if a single frame exceeds the window", () => {
    const buffer = createEchoBuffer(50);
    buffer.push(frame(spawnState(0), 0, 0, 5000));
    expect(buffer.snapshot().frames).toHaveLength(1);
  });

  it("clear() empties the buffer", () => {
    const buffer = createEchoBuffer();
    buffer.push(frame(spawnState(0), 1, 1));
    buffer.clear();
    expect(buffer.snapshot().frames).toHaveLength(0);
  });

  it("ECHO_WINDOW_MS is 12 seconds (PATH-7's own spec line)", () => {
    expect(ECHO_WINDOW_MS).toBe(12_000);
  });
});

describe("echo: deterministic replay", () => {
  /** A fixed, varied recording — mixed steer/throttle and an irregular
   *  frame pace (like a real rAF loop), never Math.random, so the fixture
   *  itself is reproducible across runs (ReplayLab.tsx's own discipline). */
  function fixedRecording(): EchoRecording {
    const buffer = createEchoBuffer();
    const start = spawnState(0);
    for (let i = 0; i < 200; i++) {
      const input = { steer: Math.sin(i * 0.31) * 0.7, throttle: i % 11 === 0 ? -0.3 : 0.9 };
      const dtMs = 16 + (i % 3);
      // Every frame records the SAME start state as its own `stateBefore` —
      // `replayEcho` only ever reads `frames[0].stateBefore` (the others
      // matter only once trimming makes them the new first frame), so this
      // fixture doesn't need a real chained simulation to exercise the
      // replay contract.
      buffer.push({ stateBefore: start, input, dtMs, env: ENV });
    }
    return buffer.snapshot();
  }

  it("replaying a recorded 12 s intent twice gives deep-equal positions", () => {
    const recording = fixedRecording();
    const pathA = replayEcho(recording);
    const pathB = replayEcho(recording);
    expect(pathB).toEqual(pathA);
    expect(pathA.length).toBe(recording.frames.length + 1);
  });

  it("an empty recording replays to an empty path", () => {
    expect(replayEcho({ frames: [] })).toEqual([]);
  });

  it("a changed input produces a different replay from the same start state", () => {
    const start = spawnState(0);
    const straight: EchoFrame = { stateBefore: start, input: { steer: 0, throttle: 1 }, dtMs: 500, env: ENV };
    const turning: EchoFrame = { stateBefore: start, input: { steer: 1, throttle: 1 }, dtMs: 500, env: ENV };
    const pathStraight = replayEcho({ frames: [straight] });
    const pathTurning = replayEcho({ frames: [turning] });
    expect(pathTurning[1]).not.toEqual(pathStraight[1]);
  });
});

describe("echo: two-boat mooring (PATH-7's confluence collar)", () => {
  const mooring = { x: 0, z: 500 };

  it("true only when both the live hull and its echo are inside the radius", () => {
    expect(atTwoBoatMooring({ x: 1, z: 500 }, { x: -1, z: 500 }, mooring, 6)).toBe(true);
  });

  it("false when only the live hull is inside", () => {
    expect(atTwoBoatMooring({ x: 1, z: 500 }, { x: 1, z: 700 }, mooring, 6)).toBe(false);
  });

  it("false when only the echo is inside", () => {
    expect(atTwoBoatMooring({ x: 1, z: 700 }, { x: 1, z: 500 }, mooring, 6)).toBe(false);
  });

  it("false when both are outside", () => {
    expect(atTwoBoatMooring({ x: 1, z: 700 }, { x: 1, z: 900 }, mooring, 6)).toBe(false);
  });
});
