import { describe, expect, it } from "vitest";
import { SANGAM as LOOK_ANGLES_SANGAM } from "../../lib/lookAngles.ts";
import mutha from "../../data/osm/mutha.json" with { type: "json" };
import { DOWNSTREAM_BEARING_DEG, SANGAM, bankOf, deadReckon, worldDir } from "./skyFrame.ts";

function expectVec(v: [number, number, number], want: [number, number, number]) {
  expect(v[0]).toBeCloseTo(want[0], 9);
  expect(v[1]).toBeCloseTo(want[1], 9);
  expect(v[2]).toBeCloseTo(want[2], 9);
}

describe("worldDir", () => {
  it("az === DOWNSTREAM_BEARING_DEG, el 0 -> (0,0,1)", () => {
    expectVec(worldDir(DOWNSTREAM_BEARING_DEG, 0), [0, 0, 1]);
  });

  it("az === DOWNSTREAM_BEARING_DEG+90, el 0 -> (-1,0,0)", () => {
    expectVec(worldDir(DOWNSTREAM_BEARING_DEG + 90, 0), [-1, 0, 0]);
  });

  it("az === DOWNSTREAM_BEARING_DEG-90, el 0 -> (1,0,0)", () => {
    expectVec(worldDir(DOWNSTREAM_BEARING_DEG - 90, 0), [1, 0, 0]);
  });

  it("el 90 -> (0,1,0), any azimuth", () => {
    expectVec(worldDir(DOWNSTREAM_BEARING_DEG, 90), [0, 1, 0]);
    expectVec(worldDir(0, 90), [0, 1, 0]);
  });
});

describe("SANGAM", () => {
  it("equals src/lib/lookAngles.ts's own SANGAM constant", () => {
    expect(SANGAM).toBe(LOOK_ANGLES_SANGAM);
    expect(SANGAM).toEqual(LOOK_ANGLES_SANGAM);
  });

  it("its lat/lon equal mutha.json's confluence", () => {
    expect(SANGAM.lat).toBeCloseTo(mutha.confluence.lat, 6);
    expect(SANGAM.lon).toBeCloseTo(mutha.confluence.lon, 6);
  });
});

describe("DOWNSTREAM_BEARING_DEG", () => {
  it("is mutha.json's chordBearingDeg (M4: the real Mutha chord, not outflowBearingDeg)", () => {
    expect(DOWNSTREAM_BEARING_DEG).toBe(mutha.chordBearingDeg);
  });
});

describe("bankOf (hydrological, distinct from city.ts's Flank)", () => {
  it("negative world x is the right bank, positive is left", () => {
    expect(bankOf(-5)).toBe("right");
    expect(bankOf(5)).toBe("left");
  });
});

describe("deadReckon", () => {
  it("a stationary track (0 kt) advances nowhere", () => {
    const a = { lat: 18.5, lon: 73.8, gsKt: 0, trkDeg: 90 };
    const out = deadReckon(a, 60);
    expect(out.lat).toBeCloseTo(a.lat, 9);
    expect(out.lon).toBeCloseTo(a.lon, 9);
  });

  it("due-east flight increases longitude, latitude unchanged", () => {
    const a = { lat: 0, lon: 0, gsKt: 400, trkDeg: 90 };
    const out = deadReckon(a, 3600); // 1h at 400kt ~= 740 km
    expect(out.lat).toBeCloseTo(0, 3);
    expect(out.lon).toBeGreaterThan(0);
  });

  it("due-north flight increases latitude, longitude unchanged", () => {
    const a = { lat: 0, lon: 0, gsKt: 400, trkDeg: 0 };
    const out = deadReckon(a, 3600);
    expect(out.lon).toBeCloseTo(0, 6);
    expect(out.lat).toBeGreaterThan(0);
  });
});
