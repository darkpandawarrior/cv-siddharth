import { describe, expect, it } from "vitest";
import { CITY } from "./city.ts";
import { LIT_MAP_H, LIT_MAP_W, litMapTexel, stampLitMap } from "./litMap.ts";

describe("litMapTexel", () => {
  it("maps the corridor's corners to the texture's corners", () => {
    expect(litMapTexel(-CITY.halfWidth, CITY.z0)).toEqual({ tx: 0, tz: 0 });
    expect(litMapTexel(CITY.halfWidth, CITY.z1)).toEqual({ tx: LIT_MAP_W - 1, tz: LIT_MAP_H - 1 });
  });

  it("clamps world positions outside the slab rather than wrapping", () => {
    expect(litMapTexel(-999, -999)).toEqual({ tx: 0, tz: 0 });
    expect(litMapTexel(999, 999)).toEqual({ tx: LIT_MAP_W - 1, tz: LIT_MAP_H - 1 });
  });
});

describe("stampLitMap", () => {
  it("accumulates rather than overwrites, and clamps at full", () => {
    const data = new Uint8Array(LIT_MAP_W * LIT_MAP_H);
    stampLitMap(data, 0, 0);
    const { tx, tz } = litMapTexel(0, 0);
    const idx = tz * LIT_MAP_W + tx;
    const once = data[idx];
    expect(once).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) stampLitMap(data, 0, 0);
    expect(data[idx]).toBe(255);
  });

  it("brushes 3 texels wide across the lane (X), not along Z", () => {
    const data = new Uint8Array(LIT_MAP_W * LIT_MAP_H);
    stampLitMap(data, 0, 0);
    const { tx, tz } = litMapTexel(0, 0);
    let touchedX = 0;
    for (let dx = -2; dx <= 2; dx++) if (data[tz * LIT_MAP_W + tx + dx] > 0) touchedX++;
    expect(touchedX).toBe(3);
    expect(data[(tz - 1) * LIT_MAP_W + tx] ?? 0).toBe(0);
    expect(data[(tz + 1) * LIT_MAP_W + tx] ?? 0).toBe(0);
  });
});
