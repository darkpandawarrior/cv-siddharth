import { describe, it, expect } from "vitest";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { slerpUnit, centralAngleDeg, arcApexHeight, arcPoint } from "./arcGeo.ts";

const PUNE = latLonToXyz(18.5204, 73.8567);
const GERMANY = latLonToXyz(50.9617, 9.6783);

describe("slerpUnit", () => {
  it("is exact at the endpoints", () => {
    const a = latLonToXyz(10, 20);
    const b = latLonToXyz(-30, 100);
    const t0 = slerpUnit(a, b, 0);
    const t1 = slerpUnit(a, b, 1);
    expect(t0.x).toBeCloseTo(a.x, 9);
    expect(t0.y).toBeCloseTo(a.y, 9);
    expect(t0.z).toBeCloseTo(a.z, 9);
    expect(t1.x).toBeCloseTo(b.x, 9);
    expect(t1.y).toBeCloseTo(b.y, 9);
    expect(t1.z).toBeCloseTo(b.z, 9);
  });

  it("stays on the unit sphere at every t", () => {
    const a = latLonToXyz(0, 0);
    const b = latLonToXyz(45, 90);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = slerpUnit(a, b, t);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 9);
    }
  });
});

describe("arcApexHeight", () => {
  it("is proportional to the great-circle distance: farther is taller", () => {
    const near = arcApexHeight(centralAngleDeg(PUNE, latLonToXyz(19, 74)));
    const far = arcApexHeight(centralAngleDeg(PUNE, GERMANY));
    expect(far).toBeGreaterThan(near);
  });

  it("clamps to the documented floor and ceiling", () => {
    expect(arcApexHeight(0)).toBeCloseTo(0.35, 6);
    expect(arcApexHeight(180)).toBeCloseTo(1.3, 6);
  });
});

describe("arcPoint", () => {
  it("lands exactly on the surface at both endpoints (apex height only bulges the middle)", () => {
    const apex = arcApexHeight(centralAngleDeg(PUNE, GERMANY));
    const start = arcPoint(GERMANY, PUNE, 0, apex);
    const end = arcPoint(GERMANY, PUNE, 1, apex);
    expect(Math.hypot(start.x, start.y, start.z)).toBeCloseTo(GLOBE_RADIUS, 6);
    expect(Math.hypot(end.x, end.y, end.z)).toBeCloseTo(GLOBE_RADIUS, 6);
  });

  it("bulges to GLOBE_RADIUS + apex at the midpoint", () => {
    const apex = arcApexHeight(centralAngleDeg(PUNE, GERMANY));
    const mid = arcPoint(GERMANY, PUNE, 0.5, apex);
    expect(Math.hypot(mid.x, mid.y, mid.z)).toBeCloseTo(GLOBE_RADIUS + apex, 6);
  });
});
