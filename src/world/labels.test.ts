import { describe, it, expect } from "vitest";
import { LABEL_RANGE, declutter, falloff, project, worldLabels, type Candidate } from "./labels.ts";

/** An orthographic-ish view-projection looking down -Z from the origin, as a
 *  column-major array. Enough to exercise the perspective divide and the
 *  behind-the-camera rejection without pulling three.js into a unit test. */
function lookDownNegZ(): number[] {
  // Standard perspective, 90° fov, aspect 1, near 0.1 far 200 — three.js
  // stores this column-major, so m[11] = -1 is the w = -z term.
  const near = 0.1;
  const far = 200;
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, -(far + near) / (far - near), -1,
    0, 0, (-2 * far * near) / (far - near), 0,
  ];
}

describe("projection", () => {
  const m = lookDownNegZ();

  it("puts a point straight ahead in the centre of the screen", () => {
    const p = project(m, [0, 0, -20], 1000, 600);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(500, 3);
    expect(p!.y).toBeCloseTo(300, 3);
    expect(p!.depth).toBeCloseTo(20, 3);
  });

  it("rejects anything behind the camera", () => {
    // The bug this pins: with w <= 0 the perspective divide flips the point to
    // the OPPOSITE side of the screen, so a label for something behind you
    // renders pinned to an edge as if it were ahead.
    expect(project(m, [0, 0, 20], 1000, 600)).toBeNull();
  });

  it("rejects anything well outside the frame", () => {
    expect(project(m, [400, 0, -20], 1000, 600)).toBeNull();
  });
});

describe("falloff", () => {
  it("draws nothing past the kind's range", () => {
    expect(falloff("year", LABEL_RANGE.year + 1).opacity).toBe(0);
    expect(falloff("room", LABEL_RANGE.room + 1).opacity).toBe(0);
  });

  it("is full strength up close and fading far away", () => {
    expect(falloff("room", 2).opacity).toBe(1);
    expect(falloff("room", LABEL_RANGE.room * 0.9).opacity).toBeLessThan(0.5);
  });

  it("shrinks with distance", () => {
    expect(falloff("room", 70).scale).toBeLessThan(falloff("room", 5).scale);
  });
});

describe("declutter", () => {
  const box = (index: number, kind: Candidate["kind"], x: number, depth: number): Candidate => ({
    index,
    kind,
    x,
    y: 100,
    depth,
    width: 80,
    height: 20,
  });

  it("drops the loser of an overlap instead of stacking", () => {
    // The whole reason this module exists: three <Html> systems that could not
    // see each other printed all of these on the same pixels.
    const drawn = declutter([box(0, "room", 500, 10), box(1, "room", 505, 40), box(2, "room", 510, 80)]);
    expect(drawn).toEqual([0]);
  });

  it("keeps labels that clear each other", () => {
    expect(declutter([box(0, "room", 200, 10), box(1, "room", 600, 10)]).sort()).toEqual([0, 1]);
  });

  it("gives a contested spot to the room, not the year, however close the year is", () => {
    const drawn = declutter([box(0, "year", 500, 2), box(1, "room", 505, 60)]);
    expect(drawn).toEqual([1]);
  });

  it("prefers the nearer of two labels of the same kind", () => {
    expect(declutter([box(0, "room", 500, 60), box(1, "room", 505, 5)])).toEqual([1]);
  });
});

describe("the label set", () => {
  it("names every room, and marks them with their route", () => {
    const rooms = worldLabels().filter((l) => l.kind === "room");
    expect(rooms).toHaveLength(8);
    expect(rooms.every((r) => typeof r.to === "string")).toBe(true);
  });

  it("carries the years and the project towers too", () => {
    const kinds = new Set(worldLabels().map((l) => l.kind));
    expect(kinds).toEqual(new Set(["room", "project", "year"]));
  });

  it("has no two labels sharing an id", () => {
    const labels = worldLabels();
    expect(new Set(labels.map((l) => l.id)).size).toBe(labels.length);
  });
});
