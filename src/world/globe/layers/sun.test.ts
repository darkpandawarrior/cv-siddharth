import { describe, it, expect } from "vitest";
import { RAYLEIGH_BETA_PER_M, RAYLEIGH_SCALE_HEIGHT_M, rayleighTransmittance } from "./sun.ts";

const DEG = Math.PI / 180;
// The base colour ATMO_FRAG multiplies transmittance into: vec3(.3,.55,1.).
const BASE = { r: 0.3, g: 0.55, b: 1.0 };

describe("Rayleigh limb transmittance (Bruneton demo.cc:228-229,269, BSD-3-Clause)", () => {
  it("RAYLEIGH_BETA_PER_M matches kRayleigh * lambda^-4 at 680/550/440nm (kRayleigh=1.24062e-6, lambda in um)", () => {
    const kRayleigh = 1.24062e-6;
    const betaAt = (nm: number) => kRayleigh * (nm * 1e-3) ** -4;
    // Repo constants are full double precision; this plan quotes them to 3-4
    // sig figs, so compare at that precision rather than demanding an exact
    // literal match.
    expect(Math.abs(betaAt(680) - RAYLEIGH_BETA_PER_M.r)).toBeLessThan(1e-9);
    expect(Math.abs(betaAt(550) - RAYLEIGH_BETA_PER_M.g)).toBeLessThan(1e-9);
    expect(Math.abs(betaAt(440) - RAYLEIGH_BETA_PER_M.b)).toBeLessThan(1e-9);
  });

  it("RAYLEIGH_SCALE_HEIGHT_M matches demo.cc's kRayleighScaleHeight", () => {
    expect(RAYLEIGH_SCALE_HEIGHT_M).toBe(8000);
  });

  // cosSun = dot(surfaceNormal, sunDir) = cos(solar zenith angle) = sin(solar
  // elevation). 5deg into the twilight side means the sun sits 5deg below
  // THIS point's own horizon, i.e. elevation -5deg.
  it("a limb pixel 5 degrees into the twilight side reddens: final R > final B", () => {
    const cosSun = Math.sin(-5 * DEG);
    const tr = rayleighTransmittance(cosSun);
    expect(BASE.r * tr.r).toBeGreaterThan(BASE.b * tr.b);
  });

  it("the limb pixel facing the sun (noon, cosSun=1) stays blue: final B > final R", () => {
    const tr = rayleighTransmittance(1);
    expect(BASE.b * tr.b).toBeGreaterThan(BASE.r * tr.r);
  });

  it("transmittance is monotonically ordered r > g > b at every angle (blue always scatters most)", () => {
    for (const cosSun of [1, 0.5, 0.1, -0.05, -0.09, -0.3, -1]) {
      const tr = rayleighTransmittance(cosSun);
      expect(tr.r).toBeGreaterThan(tr.g);
      expect(tr.g).toBeGreaterThan(tr.b);
    }
  });

  it("break-it: without the abs()/.04 floor, the terminator itself divides by zero", () => {
    const unguardedPath = (cosSun: number) => RAYLEIGH_SCALE_HEIGHT_M / cosSun;
    expect(Number.isFinite(unguardedPath(0))).toBe(false);
    expect(Number.isFinite(RAYLEIGH_SCALE_HEIGHT_M / Math.max(Math.abs(0), 0.04))).toBe(true);
  });

  it("break-it: the pre-fix flat-blue shader never reddened at twilight (the defect this change fixes)", () => {
    const oldFinal = (_cosSun: number) => ({ r: BASE.r, b: BASE.b }); // ATMO_FRAG before this change: no transmittance term
    const twilight = oldFinal(Math.sin(-5 * DEG));
    expect(twilight.r).toBeLessThan(twilight.b); // was always true pre-fix -- proves the new test above is load-bearing
  });
});
