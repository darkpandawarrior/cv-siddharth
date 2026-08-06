import { describe, expect, it } from "vitest";
import { ROOMS } from "../rooms.tsx";
import { PLACEMENTS } from "./worldData.ts";

// The test that matters most: a room added to profile.ts without a matching
// placement would silently vanish from the world while still appearing in
// the card grid, and a stray placement pointing at a typo'd `to` would drop
// a pavilion into the scene that nothing can ever navigate to. Both
// directions of that bijection are asserted here so either mistake fails
// this test instead of shipping quietly.
describe("PLACEMENTS ↔ ROOMS", () => {
  it("gives every room exactly one placement", () => {
    for (const room of ROOMS) {
      const matches = PLACEMENTS.filter((p) => p.to === room.to);
      expect(matches, `expected exactly one placement for ${room.to}`).toHaveLength(1);
    }
  });

  it("points every placement at a real room", () => {
    const roomPaths = new Set(ROOMS.map((r) => r.to));
    for (const placement of PLACEMENTS) {
      expect(roomPaths.has(placement.to), `${placement.to} has no matching room`).toBe(true);
    }
  });
});

