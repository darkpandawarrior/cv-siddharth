import { describe, it, expect } from "vitest";
import {
  nextMode,
  buoyancyForce,
  liftForce,
  LAUNCH_SPEED,
  STALL_SPEED,
  LONG_FALL_MS,
  type CraftMode,
  type MediumProbe,
} from "./craftPhysics.ts";

// Every case below only sets the probe fields its row cares about; everything
// else defaults to "nothing interesting is happening" so a failing test
// points at the one condition it's actually exercising.
function probe(overrides: Partial<MediumProbe> = {}): MediumProbe {
  return { grounded: false, submergedDepth: 0, airborneMs: 0, speed: 0, ...overrides };
}

describe("nextMode transition table", () => {
  const modes: CraftMode[] = ["wheels", "hull", "wings"];

  it("any mode with submergedDepth > 0 becomes hull", () => {
    for (const mode of modes) {
      expect(nextMode(mode, probe({ submergedDepth: 0.05 }))).toBe("hull");
    }
  });

  it("wheels -> wings once airborne past 300ms at launch speed", () => {
    expect(nextMode("wheels", probe({ airborneMs: 301, speed: LAUNCH_SPEED }))).toBe("wings");
    expect(nextMode("wheels", probe({ airborneMs: 500, speed: LAUNCH_SPEED + 5 }))).toBe("wings");
  });

  it("wheels stays wheels if either half of the launch condition is missing", () => {
    // airborne long enough, but too slow
    expect(nextMode("wheels", probe({ airborneMs: 500, speed: LAUNCH_SPEED - 1 }))).toBe("wheels");
    // fast enough, but not airborne long enough (still settling off a bump)
    expect(nextMode("wheels", probe({ airborneMs: 100, speed: LAUNCH_SPEED + 10 }))).toBe("wheels");
  });

  it("hull -> wheels once clear of water and grounded", () => {
    expect(nextMode("hull", probe({ submergedDepth: 0, grounded: true }))).toBe("wheels");
  });

  it("hull stays hull while grounded but still submerged, or clear but airborne", () => {
    expect(nextMode("hull", probe({ submergedDepth: 0.1, grounded: true }))).toBe("hull");
    expect(nextMode("hull", probe({ submergedDepth: 0, grounded: false }))).toBe("hull");
  });

  it("wings -> wheels on any ground contact", () => {
    expect(nextMode("wings", probe({ grounded: true, speed: 20 }))).toBe("wheels");
  });

  it("wings stays wings while airborne, regardless of speed", () => {
    expect(nextMode("wings", probe({ grounded: false, speed: 0 }))).toBe("wings");
  });

  it("submergedDepth > 0 outranks a simultaneous launch condition", () => {
    // A craft skimming the surface while technically meeting the wheels->wings
    // condition must become a hull, not take off — rule 1 is checked first.
    expect(nextMode("wheels", probe({ submergedDepth: 0.01, airborneMs: 400, speed: LAUNCH_SPEED }))).toBe("hull");
  });

  // FINDING 15: a craft that drives off a short-run-up edge (a sky island's
  // 4.5m, well short of what it takes to reach LAUNCH_SPEED under its own
  // power) never meets the ordinary speed-gated rule and would free-fall as
  // a "car" forever without this second, unconditional rule.
  it("wheels -> wings on a long fall even far below LAUNCH_SPEED", () => {
    expect(nextMode("wheels", probe({ airborneMs: LONG_FALL_MS + 1, speed: 2 }))).toBe("wings");
    expect(nextMode("wheels", probe({ airborneMs: LONG_FALL_MS + 1, speed: 0 }))).toBe("wings");
  });

  it("wheels stays wheels below the long-fall threshold even if slow", () => {
    // Otherwise this would swallow the ordinary "settling off a bump" case
    // the earlier test already covers (100ms, well below either threshold).
    expect(nextMode("wheels", probe({ airborneMs: LONG_FALL_MS - 1, speed: 2 }))).toBe("wheels");
  });

  it("submergedDepth > 0 outranks a long fall too", () => {
    expect(nextMode("wheels", probe({ submergedDepth: 0.01, airborneMs: LONG_FALL_MS + 1, speed: 0 }))).toBe("hull");
  });
});

describe("no-soft-lock invariant", () => {
  it("wings at zero speed still returns to wheels on ground contact", () => {
    expect(nextMode("wings", probe({ grounded: true, speed: 0 }))).toBe("wheels");
  });

  it("hull on dry land (never grounded=false, never resubmerged) always finds its way to wheels", () => {
    expect(nextMode("hull", probe({ submergedDepth: 0, grounded: true }))).toBe("wheels");
  });

  it("every mode has at least one reachable exit for a probe that is neither submerged nor airborne", () => {
    // A stationary, grounded, dry probe is the "parked in a driveway" state —
    // from here every mode must settle on (or already be) wheels.
    const parked = probe({ grounded: true });
    for (const mode of ["wheels", "hull", "wings"] as CraftMode[]) {
      expect(nextMode(mode, parked)).toBe("wheels");
    }
  });
});

describe("buoyancyForce", () => {
  it("is zero at and below the surface", () => {
    expect(buoyancyForce(0)).toBe(0);
    expect(buoyancyForce(-1)).toBe(0);
  });

  it("rises monotonically with submerged depth", () => {
    const shallow = buoyancyForce(0.1);
    const mid = buoyancyForce(0.5);
    const deep = buoyancyForce(1.5);
    expect(shallow).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(shallow);
    expect(deep).toBeGreaterThan(mid);
  });
});

describe("liftForce", () => {
  it("is zero anywhere below stall speed", () => {
    expect(liftForce(0)).toBe(0);
    expect(liftForce(STALL_SPEED - 0.01)).toBe(0);
  });

  it("rises monotonically once at or above stall speed", () => {
    const atStall = liftForce(STALL_SPEED);
    const cruise = liftForce(LAUNCH_SPEED);
    const fast = liftForce(LAUNCH_SPEED * 2);
    expect(atStall).toBeGreaterThan(0);
    expect(cruise).toBeGreaterThan(atStall);
    expect(fast).toBeGreaterThan(cruise);
  });
});
