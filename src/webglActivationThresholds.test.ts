import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Pins each WebGL scene's activation threshold — the breakpoint or count
 * that decides IF the three.js scene mounts at all — against its
 * pre-migration value, across the lazy-to-Hydrate conversion (2026-09).
 *
 * These numbers are deliberately NOT unified into one shared constant: the
 * council's own finding is that a single collapsed breakpoint would
 * silently change which scene boots where (AmbientBackground gates at
 * 767px, everything else at 1023px, ParticleHero's drag-interactivity gate
 * at 1024px, ParticleHero's own mobile point count at 767px/2000 vs
 * 6000) — this test exists to catch exactly that kind of silent collapse,
 * not to enforce one.
 */
function readSrc(path: string): string {
  return readFileSync(new URL(path, import.meta.url).pathname, "utf8");
}

describe("WebGL scene activation thresholds, unchanged by the Hydrate migration", () => {
  it("AmbientBackground gates 3D at 767px", () => {
    expect(readSrc("./AmbientBackground.tsx")).toContain('window.matchMedia("(max-width: 767px)")');
  });

  it("Phone3D gates 3D at 1023px", () => {
    expect(readSrc("./Phone3D.tsx")).toContain('window.matchMedia("(max-width: 1023px)")');
  });

  it("SkillsOrbit gates 3D at 1023px", () => {
    expect(readSrc("./SkillsOrbit.tsx")).toContain('window.matchMedia("(max-width: 1023px)")');
  });

  it("FoundationGraph gates 3D at 1023px", () => {
    expect(readSrc("./FoundationGraph.tsx")).toContain('window.matchMedia("(max-width: 1023px)")');
  });

  it("StoryMap gates 3D at 1023px", () => {
    expect(readSrc("./StoryMap.tsx")).toContain('window.matchMedia("(max-width: 1023px)")');
  });

  it("ParticleHero mounts on any WebGL-capable viewport (no width gate) but adapts its point count at 767px, 2000 vs 6000", () => {
    const src = readSrc("./ParticleHero.tsx");
    expect(src).toContain('window.matchMedia("(max-width: 767px)").matches ? 2000 : 6000');
    // The deliberate absence: unlike its three siblings, ParticleHero must
    // NOT gate MOUNTING itself on a width match, only supportsWebGL() — a
    // second `isSmallScreen` early-return (the shape all three siblings use)
    // would be the min-width kill the council doc explicitly rejected.
    expect(src).not.toMatch(/isSmallScreen/);
    expect(src).not.toMatch(/if\s*\(\s*(reduced|isSmallScreen)\s*(\|\||&&)[\s\S]{0,40}return;/);
  });

  it("ParticleHero enables drag-to-spin at 1024px on a fine pointer", () => {
    expect(readSrc("./ParticleHero.tsx")).toContain(
      'window.matchMedia("(pointer: fine)").matches && window.matchMedia("(min-width: 1024px)").matches',
    );
  });
});
