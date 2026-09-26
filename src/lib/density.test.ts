// ponytail: @testing-library/react isn't a devDependency (same note as
// sessionRipple.test.ts) — exercises density/markEvidenceOpened directly
// rather than renderHook; useDensity is a thin wrapper over exactly this.
import { describe, it, expect, afterEach } from "vitest";
import { density, markEvidenceOpened, getEvidenceOpened, _resetForTests } from "./density.ts";

afterEach(() => {
  _resetForTests();
});

describe("density", () => {
  it("is FOCUS with no touches", () => {
    expect(density([])).toBe("FOCUS");
  });

  it("stays FOCUS after one other project page", () => {
    expect(density(["gaddi"], { currentSlug: "doori" })).toBe("FOCUS");
  });

  it("is GUIDED after two other project pages this session", () => {
    expect(density(["gaddi", "paymentslab-kmp"], { currentSlug: "doori" })).toBe("GUIDED");
  });

  it("excludes the current page from its own touched count", () => {
    // Two entries, but one of them IS the page being read — only one "other".
    expect(density(["doori", "gaddi"], { currentSlug: "doori" })).toBe("FOCUS");
  });

  it("is ANALYST once an evidence link opens, even with no touches", () => {
    expect(density([], { evidenceOpened: true })).toBe("ANALYST");
  });

  it("manual override beats every earned signal", () => {
    expect(density(["a", "b"], { evidenceOpened: true, manualOverride: "FOCUS" })).toBe("FOCUS");
    expect(density([], { manualOverride: "ANALYST" })).toBe("ANALYST");
  });
});

describe("markEvidenceOpened", () => {
  it("flips the module-scope flag once and stays flipped", () => {
    expect(getEvidenceOpened()).toBe(false);
    markEvidenceOpened();
    expect(getEvidenceOpened()).toBe(true);
    markEvidenceOpened();
    expect(getEvidenceOpened()).toBe(true);
  });
});
