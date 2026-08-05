import { describe, expect, it } from "vitest";
import { ROOMS } from "../rooms.tsx";
import { CHECKPOINTS, PLACEMENTS } from "./worldData.ts";
import { CHECKPOINT_COUNT } from "./triathlon.ts";

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

describe("CHECKPOINTS", () => {
  it("has unique ids sequential from 0", () => {
    const ids = CHECKPOINTS.map((c) => c.id);
    expect(ids).toEqual(CHECKPOINTS.map((_, i) => i));
    expect(new Set(ids).size).toBe(ids.length);
  });

  // FINDING 4: this is the drift check triathlon.ts's CHECKPOINT_COUNT
  // comment describes in prose but that nothing ever actually asserted — the
  // run used to "finish" one checkpoint early (a mid-air ring) because
  // CHECKPOINT_COUNT was a hand-maintained 6 against a 7-entry array. Now
  // that CHECKPOINT_COUNT is derived from CHECKPOINTS.length, this is
  // structurally guaranteed rather than just documented — but it's kept as
  // an explicit assertion anyway so a future revert back to a hand-maintained
  // constant fails loudly here instead of silently re-stranding a runner.
  it("CHECKPOINT_COUNT agrees with the array it's derived from", () => {
    expect(CHECKPOINT_COUNT).toBe(CHECKPOINTS.length);
  });
});
