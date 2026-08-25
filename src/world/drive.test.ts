import { describe, it, expect } from "vitest";
import { step, spawnState, MAX_SPEED, MAX_REVERSE, MAX_DT, CAR_RADIUS, type DriveEnv, type DriveState, type Obstacle } from "./drive.ts";

/**
 * These assert RELATIONSHIPS, never values.
 *
 * The predecessor of this model passed every gate it had, three separate
 * times, while being unplayable — because those gates compared numbers against
 * a sibling copy of the same numbers. A constant here can be retuned freely;
 * what must never change is that a wall cannot accelerate the car, that no
 * frame teleports it, and that it never finishes inside solid geometry.
 *
 * The fuzz is seeded so a failure is reproducible rather than a Heisenbug.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const FLAT: DriveEnv["heightAt"] = () => 0;
const BOUNDS = { minX: -28, maxX: 28, minZ: -80, maxZ: 88 };

function env(obstacles: Obstacle[] = [], heightAt = FLAT): DriveEnv {
  return { obstacles, heightAt, bounds: BOUNDS };
}

const inside = (s: DriveState, o: Obstacle) =>
  Math.abs(s.x - o.x) < o.rx + CAR_RADIUS - 1e-6 && Math.abs(s.z - o.z) < o.rz + CAR_RADIUS - 1e-6;

describe("drive — invariants that must hold for any input", () => {
  it("never exceeds the speed limits, under 20k randomised frames", () => {
    const r = rng(1);
    const e = env([{ x: 0, z: 0, rx: 3, rz: 3 }]);
    let s = spawnState(-10, -40, e);
    for (let i = 0; i < 20000; i++) {
      s = step(s, { steer: r() * 2 - 1, throttle: r() * 2 - 1, boost: r() > 0.5 }, r() * MAX_DT, e);
      expect(s.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
      expect(s.speed).toBeGreaterThanOrEqual(-MAX_REVERSE - 1e-9);
    }
  });

  it("never produces NaN or a non-finite state", () => {
    const r = rng(7);
    const e = env([{ x: 0, z: 0, rx: 2, rz: 40 }]);
    let s = spawnState(0, -70, e);
    for (let i = 0; i < 5000; i++) {
      s = step(s, { steer: r() * 4 - 2, throttle: r() * 4 - 2, boost: false }, r() * 0.2, e);
      for (const v of [s.x, s.z, s.y, s.heading, s.speed]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("never displaces the car further in one call than its speed allows", () => {
    const r = rng(3);
    const e = env();
    let s = spawnState(0, -60, e);
    for (let i = 0; i < 5000; i++) {
      const dt = r() * MAX_DT;
      const before = s;
      s = step(s, { steer: r() * 2 - 1, throttle: 1, boost: true }, dt, e);
      const moved = Math.hypot(s.x - before.x, s.z - before.z);
      // Bound uses the higher of the two speeds; acceleration within the frame
      // cannot outrun the cap.
      expect(moved).toBeLessThanOrEqual(Math.max(Math.abs(before.speed), Math.abs(s.speed)) * dt + 1e-6);
    }
  });

  it("a wall never increases speed — the launch bug, stated as a property", () => {
    const wall: Obstacle = { x: 0, z: 0, rx: 6, rz: 1 };
    const e = env([wall]);
    // Drive flat out into it from every approach angle.
    for (let deg = 0; deg < 360; deg += 5) {
      const heading = (deg * Math.PI) / 180;
      let s: DriveState = { x: -Math.sin(heading) * 14, z: -Math.cos(heading) * 14, y: 0, heading, speed: MAX_SPEED };
      let peak = Math.abs(s.speed);
      for (let i = 0; i < 400; i++) {
        const before = Math.abs(s.speed);
        s = step(s, { steer: 0, throttle: 1, boost: true }, MAX_DT, e);
        const after = Math.abs(s.speed);
        // Contact may only remove speed. Free travel may add it, but never
        // past the cap — so the peak can never exceed the cap either.
        expect(after).toBeLessThanOrEqual(Math.max(before, MAX_SPEED) + 1e-9);
        peak = Math.max(peak, after);
      }
      expect(peak).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
    }
  });

  it("never finishes inside an obstacle, however hard it is driven at one", () => {
    const obstacles: Obstacle[] = [
      { x: 0, z: 0, rx: 4, rz: 4 },
      { x: 8, z: 2, rx: 4, rz: 4 },   // shoulder to shoulder, the two-pass case
      { x: -9, z: -3, rx: 1, rz: 12 },
    ];
    const e = env(obstacles);
    const r = rng(11);
    for (let trial = 0; trial < 60; trial++) {
      let s = spawnState(r() * 40 - 20, r() * 60 - 40, e, r() * Math.PI * 2);
      for (let i = 0; i < 600; i++) {
        s = step(s, { steer: r() * 2 - 1, throttle: 1, boost: true }, MAX_DT, e);
        for (const o of obstacles) expect(inside(s, o), `inside ${JSON.stringify(o)} at ${s.x},${s.z}`).toBe(false);
      }
    }
  });

  it("never leaves the world bounds", () => {
    const r = rng(5);
    const e = env();
    let s = spawnState(0, 0, e);
    for (let i = 0; i < 8000; i++) {
      s = step(s, { steer: r() * 2 - 1, throttle: 1, boost: true }, MAX_DT, e);
      expect(s.x).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-9);
      expect(s.x).toBeLessThanOrEqual(BOUNDS.maxX + 1e-9);
      expect(s.z).toBeGreaterThanOrEqual(BOUNDS.minZ - 1e-9);
      expect(s.z).toBeLessThanOrEqual(BOUNDS.maxZ + 1e-9);
    }
  });

  it("coasts to a complete stop and stays stopped", () => {
    const e = env();
    let s: DriveState = { x: 0, z: 0, y: 0, heading: 0, speed: MAX_SPEED };
    let previous = Infinity;
    for (let i = 0; i < 2000; i++) {
      s = step(s, { steer: 0, throttle: 0, boost: false }, MAX_DT, e);
      expect(Math.abs(s.speed)).toBeLessThanOrEqual(previous + 1e-9);
      previous = Math.abs(s.speed);
    }
    expect(s.speed).toBe(0); // exactly, not merely small — no creep
  });

  it("a long dt cannot tunnel through a thin wall", () => {
    // The backgrounded-tab case: one call handed several seconds.
    const wall: Obstacle = { x: 0, z: 0, rx: 20, rz: 0.4 };
    const e = env([wall]);
    let s: DriveState = { x: 0, z: -12, y: 0, heading: 0, speed: MAX_SPEED };
    for (let i = 0; i < 200; i++) s = step(s, { steer: 0, throttle: 1, boost: true }, 5, e);
    expect(s.z).toBeLessThan(wall.z); // still on the near side
  });

  it("is framerate independent — same elapsed time, same place within tolerance", () => {
    const e = env();
    const drive = (dt: number, steps: number) => {
      let s = spawnState(0, -60, e);
      for (let i = 0; i < steps; i++) s = step(s, { steer: 0.3, throttle: 1, boost: false }, dt, e);
      return s;
    };
    const a = drive(MAX_DT, 300);          // 10s at 30fps
    const b = drive(MAX_DT / 4, 1200);     // 10s at 120fps
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(2.5);
    expect(Math.abs(a.speed - b.speed)).toBeLessThan(0.5);
  });

  it("climbing costs speed and descending returns it", () => {
    const hill: DriveEnv["heightAt"] = (_x, z) => Math.max(0, Math.min(3, (z + 20) * 0.15));
    const e = env([], hill);
    const run = (heading: number) => {
      let s: DriveState = { x: 0, z: -20, y: hill(0, -20), heading, speed: 12 };
      for (let i = 0; i < 60; i++) s = step(s, { steer: 0, throttle: 0, boost: false }, MAX_DT, e);
      return s.speed;
    };
    expect(run(0)).toBeLessThan(run(Math.PI)); // uphill ends slower than downhill
  });
  it("steers the way the driver asked — right goes right", () => {
    // The invariant tests above all passed while the car turned the WRONG WAY,
    // because every one of them asserted a magnitude and none asserted a
    // direction. heading is a bearing from world +Z and the driver's right is
    // world -X, so holding right must move the car toward negative X and must
    // lower the heading. This is the test that was missing.
    const e = env();
    const drive = (steer: number) => {
      let s: DriveState = { x: 0, z: 0, y: 0, heading: 0, speed: 12 };
      for (let i = 0; i < 45; i++) s = step(s, { steer, throttle: 1, boost: false }, MAX_DT, e);
      return s;
    };
    const right = drive(1);
    const left = drive(-1);

    expect(right.x, "holding right must travel toward -X").toBeLessThan(0);
    expect(left.x, "holding left must travel toward +X").toBeGreaterThan(0);
    expect(right.heading, "steering right lowers the bearing").toBeLessThan(0);
    expect(left.heading, "steering left raises the bearing").toBeGreaterThan(0);
    // and the two are mirror images, so no asymmetric drift is hiding in there
    expect(right.x).toBeCloseTo(-left.x, 5);
  });

  it("cannot leave the ground — flight is unrepresentable, not merely unlikely", () => {
    // The old physics could get airborne and stay there. Here y is not a
    // degree of freedom at all: it is read from the heightfield every step.
    const bumpy: DriveEnv["heightAt"] = (x, z) => 1.5 + Math.sin(x * 0.3) + Math.cos(z * 0.2);
    const e = env([], bumpy);
    const r = rng(21);
    let s = spawnState(0, 0, e);
    for (let i = 0; i < 3000; i++) {
      s = step(s, { steer: r() * 2 - 1, throttle: 1, boost: true }, MAX_DT, e);
      expect(s.y).toBeCloseTo(bumpy(s.x, s.z), 9);
    }
  });
});
