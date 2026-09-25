import { describe, it, expect } from "vitest";
import { experience } from "./profile/experience.ts";
import { employerMarkers, employersUnresolved, GEOCODE } from "./globeGeo.ts";

describe("globeGeo", () => {
  it("employersUnresolved equals exactly the unresolvable experience.ts location strings", () => {
    const expected = [...new Set(experience.map((e) => e.location))].filter((loc) => !(loc in GEOCODE));
    expect(employersUnresolved).toEqual(expected);
    // Pinned to the two known-unresolved locations so a silent GEOCODE edit,
    // or a new employer row, fails loudly here instead of drifting quiet.
    expect(employersUnresolved).toEqual(["Contract, India", "Remote, India"]);
  });

  it("never invents a coordinate for an unresolved location", () => {
    for (const loc of employersUnresolved) {
      expect(GEOCODE[loc]).toBeUndefined();
    }
  });

  it("resolves both Pune employers to the same city-precision point, nothing else", () => {
    const puneRows = experience.filter((e) => e.location === "Pune, India");
    expect(puneRows.length).toBeGreaterThanOrEqual(2);
    for (const row of puneRows) {
      const marker = employerMarkers.find((m) => m.company === row.company);
      expect(marker).toBeDefined();
      expect(marker).toMatchObject(GEOCODE["Pune, India"]);
    }
    expect(employerMarkers.length).toBe(puneRows.length);
  });
});
