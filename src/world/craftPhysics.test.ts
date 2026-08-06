import { describe, it, expect } from "vitest";
import {
  nextMode,
  buoyancyForce,
  hullTerminalSpeed,
  type CraftMode,
  type MediumProbe,
} from "./craftPhysics.ts";

/**
 * Two modes, two rules.
 *
 * This file used to test four modes and six transitions — wings above a launch
 * speed, orbit above an altitude, long-fall recovery, re-entry — and most of
 * this world's soft-locks lived in the states those rules created. The hub's
 * job is getting a visitor into one of eight rooms; driving and sailing do
 * that, so that is all there is to test.
 */
function probe(overrides: Partial<MediumProbe> = {}): MediumProbe {
  return { grounded: false, submergedDepth: 0, speed: 0, airborneMs: 0, ...overrides };
}

describe("nextMode", () => {
  const modes: CraftMode[] = ["wheels", "hull"];

  it("becomes a hull the moment it is in water, from any mode", () => {
    for (const mode of modes) {
      expect(nextMode(mode, probe({ submergedDepth: 0.05 }))).toBe("hull");
    }
  });

  it("returns to wheels once clear of the water and on the ground", () => {
    expect(nextMode("hull", probe({ grounded: true }))).toBe("wheels");
  });

  it("stays a hull while still afloat, grounded or not", () => {
    expect(nextMode("hull", probe({ submergedDepth: 0.2, grounded: true }))).toBe("hull");
    expect(nextMode("hull", probe({ submergedDepth: 0.2 }))).toBe("hull");
  });

  it("stays on wheels when nothing is happening", () => {
    expect(nextMode("wheels", probe({ grounded: true }))).toBe("wheels");
    // Airborne over dry land — a jump, not a mode change.
    expect(nextMode("wheels", probe({ airborneMs: 900, speed: 20 }))).toBe("wheels");
  });
});

describe("no dead ends", () => {
  it("every mode can reach every other mode", () => {
    // The invariant that matters more than any individual rule: a craft in any
    // state must be able to get back to driving, and driving must be able to
    // reach the water. With two modes this is exhaustive rather than a sample.
    expect(nextMode("wheels", probe({ submergedDepth: 1 }))).toBe("hull");
    expect(nextMode("hull", probe({ grounded: true }))).toBe("wheels");
  });
});

describe("forces", () => {
  it("gives no buoyancy above the waterline and more the deeper it sits", () => {
    expect(buoyancyForce(0)).toBe(0);
    expect(buoyancyForce(-1)).toBe(0);
    expect(buoyancyForce(0.4)).toBeGreaterThan(buoyancyForce(0.2));
  });

  it("sails fast enough that the strait is a crossing, not a wait", () => {
    expect(hullTerminalSpeed()).toBeGreaterThan(2);
  });
});
