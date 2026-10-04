import { afterEach, describe, expect, it } from "vitest";
import { recordBindings } from "./recordBindings.ts";
import { landmarkPositions } from "./landmarkPositions.ts";
import { terrainHeight, type Heightmap } from "./terrainHeight.ts";
import { BOUNDS } from "./valley.ts";
import { clampWalk, getWalk, landingAt, moveWalk, returnToBoat, startWalk, subscribeWalk, walkDirection, walkLandings, type Landing } from "./walk.ts";

const landing: Landing = { id: "ghat", label: "Ghat", x: 1, z: 0, halfX: 0.5, halfZ: 0.5 };
const heightmap: Heightmap = {
  heights: new Float32Array([-1, 0, 1, -1, 0, 1, -1, 0, 1]),
  meta: { grid: 3, metresPerTexel: 1, min: -1, max: 1, bounds: { xMin: -1, xMax: 1, zMin: -1, zMax: 1 } },
};
const heightAt = (x: number, z: number) => terrainHeight(x, z, heightmap);
afterEach(returnToBoat);

describe("landing and shoreline constraints", () => {
  it("moves with the headset's forward axis and caps diagonal stick speed", () => {
    expect(walkDirection(0, 1)).toEqual({ x: 0, z: 1 });
    expect(walkDirection(0, 1, 0, { x: 0, z: -1 })).toEqual({ x: 0, z: -1 });
    expect(walkDirection(0, 0, 1, { x: 0, z: -1 })).toEqual({ x: 1, z: 0 });
    const diagonal = walkDirection(0, 1, 1, { x: 1, z: 0 });
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
    expect(walkDirection(0, 1, 1, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
  });
  it("uses existing ghat, chhatri and employer flight footprints", () => {
    const positions = landmarkPositions();
    const records = recordBindings();
    const landings = walkLandings(positions, records);
    expect(landings.find((l) => l.id === "doori")).toMatchObject({ x: positions.doori[0], z: positions.doori[2], halfX: 4, halfZ: 3 });
    expect(landings.some((l) => l.id === "bridge")).toBe(false);
    expect(landings.filter((l) => l.id.startsWith("chhatri:"))).toHaveLength(records.roomChhatris.length);
    const ghat = records.employerGhats[0];
    expect(landings.find((l) => l.id === `ghat:${ghat.company}:0`)).toMatchObject({
      x: ghat.pos[0] - (ghat.flights.length - 1) / 2 * 0.85, z: ghat.pos[2] - 1.6 - ghat.flights[0].steps * 0.2 - 0.3,
    });
  });
  it("starts only within a real footprint on dry terrain", () => {
    expect(startWalk({ x: 2, z: 0 }, [landing], heightAt)).toBe(false);
    expect(startWalk({ x: 1, z: 0 }, [], heightAt)).toBe(false);
    expect(startWalk(landing, [landing], () => -1)).toBe(false);
    expect(getWalk()).toBeNull();
    expect(startWalk(landing, [landing], heightAt)).toBe(true);
    expect(landingAt({ x: 1.5, z: 0.5 }, [landing])).toBe(landing);
  });
  it("clamps a step at the shoreline sampled from the terrain heightmap", () => {
    const clamped = clampWalk(landing, { x: -1, z: 0 }, heightAt);
    expect(clamped.x).toBeGreaterThan(0);
    expect(clamped.x).toBeLessThanOrEqual(0.1);
    expect(heightAt(clamped.x, clamped.z)).toBeGreaterThan(0);
  });
  it("cannot jump across water to a dry opposite shore", () => {
    const shore = (x: number) => Math.abs(x) > 0.2 ? 1 : -1;
    const clamped = clampWalk({ x: -1, z: 0 }, { x: 1, z: 0 }, shore);
    expect(clamped.x).toBeLessThan(-0.2);
    expect(shore(clamped.x)).toBeGreaterThan(0);
  });
  it("rejects invalid coordinates and an already submerged origin", () => {
    expect(clampWalk(landing, { x: NaN, z: 0 }, heightAt)).toBe(landing);
    expect(clampWalk(landing, { x: 1, z: Infinity }, heightAt)).toBe(landing);
    const submerged = { x: -1, z: 0 };
    expect(clampWalk(submerged, landing, heightAt)).toBe(submerged);
  });
  it("cannot leave the terrain bounds even with a very large step", () => {
    expect(clampWalk(landing, { x: Number.MAX_VALUE, z: 0 }, () => 1)).toEqual({ x: BOUNDS.xMax, z: 0 });
  });
  it("publishes walking changes and returns directly to the boat", () => {
    let changes = 0;
    const unsubscribe = subscribeWalk(() => { changes++; });
    startWalk(landing, [landing], heightAt);
    moveWalk({ x: -1, z: 0 }, heightAt);
    expect(getWalk()!.position.x).toBeGreaterThan(0);
    returnToBoat();
    expect(getWalk()).toBeNull();
    expect(changes).toBe(3);
    unsubscribe();
  });
});
