import { describe, it, expect } from "vitest";
import {
  ARRIVE_RADIUS,
  STALL_MS,
  STALL_RADIUS,
  angleDelta,
  bearingTo,
  driveToward,
  hasArrived,
  isBlocked,
  isStalling,
  nextStop,
  reverseOut,
  type Pose,
} from "./autopilot.ts";

const at = (x: number, z: number, heading = 0, speed = 0): Pose => ({ x, z, heading, speed });

/**
 * The steering sign is the whole reason this file exists.
 *
 * Everything else here is arithmetic that would be obvious in review; the sign
 * is not — the driver's right is world -X, so steering right DECREASES heading,
 * and getting it backwards produces an autopilot that drives confidently away
 * from every room it picks. That failure is invisible in a typecheck, invisible
 * in a screenshot, and takes a minute of watching to diagnose in the browser.
 */
describe("steering law", () => {
  it("steers negative for a target to the driver's left (+X)", () => {
    // Facing +Z with the target off to +X: +X is the driver's LEFT
    // (right = forward × up = -X), and turning left means steering negative.
    const axes = driveToward(at(0, 0), { x: 30, z: 30 });
    expect(bearingTo({ x: 0, z: 0 }, { x: 30, z: 30 })).toBeGreaterThan(0);
    expect(axes.steer).toBeLessThan(0);
  });

  it("steers positive for a target to the driver's right (-X)", () => {
    expect(driveToward(at(0, 0), { x: -30, z: 30 }).steer).toBeGreaterThan(0);
  });

  it("holds the wheel straight when pointed at the target", () => {
    expect(driveToward(at(0, 0), { x: 0, z: 40 }).steer).toBeCloseTo(0, 6);
  });

  it("reaches full lock rather than saturating early", () => {
    expect(Math.abs(driveToward(at(0, 0), { x: 40, z: 40 }).steer)).toBe(1);
  });
});

describe("throttle", () => {
  it("asks for less speed when badly misaligned, so it can turn inside its own radius", () => {
    // Read at a speed the aligned case still wants more of and the misaligned
    // one already has too much of — from a standstill both simply saturate,
    // which says nothing about the requested speed the two differ on.
    const sideways = driveToward(at(0, 0, Math.PI / 2, 8), { x: 0, z: 60 });
    const straight = driveToward(at(0, 0, 0, 8), { x: 0, z: 60 });
    expect(sideways.throttle).toBeLessThan(straight.throttle);
    expect(straight.throttle).toBeGreaterThan(0);
  });

  it("always gets a stopped car rolling, however close it already is", () => {
    // Failure v1: the distance taper left the craft creeping to a halt just
    // outside the arrival radius, where Craft.tsx's beached-recovery then
    // teleported it back to spawn to try the same approach again, forever.
    const crawling = driveToward(at(0, 0, 0, 0), { x: 0, z: ARRIVE_RADIUS + 0.5 });
    expect(crawling.throttle).toBeGreaterThan(0.2);
  });

  it("lifts and brakes when it is already going faster than the approach wants", () => {
    // Failure v2: a throttle FLOOR fixed the creep and then carried the car
    // straight past the room, so it orbited its own destination instead of
    // parking at it. Asking for a speed rather than a pedal position is what
    // makes both of these impossible at once.
    const hot = driveToward(at(0, 0, 0, 15), { x: 0, z: ARRIVE_RADIUS + 1 });
    expect(hot.throttle).toBe(0);
    expect(hot.brake).toBe(true);
  });

  it("stops and brakes once inside the arrival radius, but not once stationary", () => {
    const rolling = driveToward(at(0, 0, 0, 6), { x: 0, z: ARRIVE_RADIUS - 1 });
    expect(rolling.throttle).toBe(0);
    expect(rolling.brake).toBe(true);
    expect(driveToward(at(0, 0), { x: 0, z: ARRIVE_RADIUS - 1 }).brake).toBe(false);
  });

  it("only boosts down a long straight", () => {
    expect(driveToward(at(0, 0), { x: 0, z: 80 }).boost).toBe(true);
    expect(driveToward(at(0, 0), { x: 30, z: 80 }).boost).toBe(false);
    expect(driveToward(at(0, 0), { x: 0, z: 20 }).boost).toBe(false);
  });
});

describe("arrival", () => {
  it("counts the arrival radius", () => {
    expect(hasArrived(at(0, 0), { x: 0, z: ARRIVE_RADIUS - 0.1 }, 0)).toBe(true);
    expect(hasArrived(at(0, 0), { x: 0, z: ARRIVE_RADIUS + 0.5 }, 0)).toBe(false);
  });

  it("counts near-and-stopped as arrived, which is what stopped the tour looping", () => {
    const stuck = { x: 0, z: STALL_RADIUS - 0.2 };
    expect(hasArrived(at(0, 0), stuck, STALL_MS - 1)).toBe(false);
    expect(hasArrived(at(0, 0), stuck, STALL_MS)).toBe(true);
  });

  it("does not count a craft that is merely far away and slow", () => {
    expect(hasArrived(at(0, 0), { x: 0, z: 40 }, 10_000)).toBe(false);
  });

  it("only clocks a stall when near AND stopped", () => {
    expect(isStalling(at(0, 0, 0, 0.1), { x: 0, z: 6 })).toBe(true);
    expect(isStalling(at(0, 0, 0, 9), { x: 0, z: 6 })).toBe(false);
    expect(isStalling(at(0, 0, 0, 0.1), { x: 0, z: 40 })).toBe(false);
  });
});

describe("route", () => {
  const stops = [
    { to: "/a", x: 0, z: -60 },
    { to: "/b", x: 0, z: 0 },
    { to: "/c", x: 0, z: 60 },
  ];

  it("takes the nearest stop it hasn't seen", () => {
    expect(nextStop(stops, new Set(["/b"]), at(0, -50))?.to).toBe("/a");
  });

  it("never re-picks the stop it is parked on once the tour is done", () => {
    // The nearest stop to a parked craft is the one under it — a tour that
    // selects its own parking space is a tour that has silently stopped.
    expect(nextStop(stops, new Set(["/a", "/b", "/c"]), at(0, -60))?.to).toBe("/c");
  });

  it("has nowhere to go with no stops", () => {
    expect(nextStop([], new Set(), at(0, 0))).toBeNull();
  });
});

describe("angleDelta", () => {
  it("takes the short way round the wrap", () => {
    expect(angleDelta(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6, 6);
    expect(angleDelta(-3.0, 3.0)).toBeCloseTo(6 - 2 * Math.PI, 6);
  });
});

describe("getting unstuck", () => {
  it("tells wedged-in-a-wall apart from parked-at-the-room", () => {
    // Both are "stopped". Only one of them means the tour arrived.
    expect(isBlocked(at(0, 0, 0, 0.1), { x: 0, z: 40 })).toBe(true);
    expect(isBlocked(at(0, 0, 0, 0.1), { x: 0, z: 5 })).toBe(false);
    expect(isBlocked(at(0, 0, 0, 9), { x: 0, z: 40 })).toBe(false);
  });

  it("reverses, and steers the opposite way to forward so the nose comes round", () => {
    const target = { x: 30, z: 30 };
    const out = reverseOut(at(0, 0), target);
    expect(out.throttle).toBeLessThan(0);
    // Reversing swings the nose the other way for the same wheel angle, so
    // this is deliberately the negation of driveToward's steer.
    expect(Math.sign(out.steer)).toBe(-Math.sign(driveToward(at(0, 0), target).steer));
  });
});
