import { describe, expect, it } from "vitest";
import { shortId } from "./ghostId.ts";

// Imports ghostId.ts rather than Ghosts.tsx on purpose: Ghosts.tsx pulls in
// `@playhtml/react`, which reads `document` at module load, and vitest runs
// this project under `environment: "node"` (pulse.test.ts's own comment
// names the identical trap). Pointing this file at Ghosts.tsx fails on the
// import line, before a single assertion runs.
describe("shortId — the ghost billboard's 6-char id", () => {
  it("is always exactly 6 uppercase alphanumeric characters", () => {
    expect(shortId("p1a2b3c4d5")).toBe("P1A2B3");
    expect(shortId("p1a2b3c4d5")).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("is deterministic — the same key always yields the same id", () => {
    expect(shortId("pXyZ987654")).toBe(shortId("pXyZ987654"));
  });

  it("pads a short key rather than returning fewer than 6 characters", () => {
    expect(shortId("p1")).toBe("P10000");
  });

  it("strips characters a presence key could carry but a 6-char id shouldn't (dashes, underscores)", () => {
    expect(shortId("p1-2_3")).toBe("P12300");
  });
});
