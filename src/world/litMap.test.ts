import { describe, expect, it } from "vitest";
import { CITY } from "./city.ts";
import { LIT_MAP_H, LIT_MAP_W, litMapTexel, pickNewRemoteStamps, stampLitMap } from "./litMap.ts";
import type { LitMapSyncState } from "./litMapSyncChannel.ts";

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

describe("pickNewRemoteStamps — phase 5's shared-record wiring", () => {
  it("skips this tab's own key — it already applied its own stamp locally in real time", () => {
    const remote: LitMapSyncState = { me: { x: 1, z: 2, t: 100 }, other: { x: 3, z: 4, t: 200 } };
    const applied = new Map<string, number>();
    const fresh = pickNewRemoteStamps(remote, "me", applied);
    expect(fresh).toEqual([{ x: 3, z: 4, t: 200 }]);
  });

  it("skips a peer whose value hasn't changed since the last call", () => {
    const applied = new Map<string, number>();
    const remote: LitMapSyncState = { other: { x: 3, z: 4, t: 200 } };
    expect(pickNewRemoteStamps(remote, "me", applied)).toHaveLength(1);
    expect(pickNewRemoteStamps(remote, "me", applied)).toHaveLength(0); // same t — already applied
  });

  it("re-applies once a peer's stamp actually moves (a new t)", () => {
    const applied = new Map<string, number>();
    pickNewRemoteStamps({ other: { x: 3, z: 4, t: 200 } }, "me", applied);
    const fresh = pickNewRemoteStamps({ other: { x: 5, z: 6, t: 300 } }, "me", applied);
    expect(fresh).toEqual([{ x: 5, z: 6, t: 300 }]);
  });
});
