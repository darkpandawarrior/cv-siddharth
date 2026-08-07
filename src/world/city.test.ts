import { describe, expect, it } from "vitest";
import { dateZ, yearZ, zToYear } from "./city.ts";

describe("yearZ", () => {
  it("matches the design doc's band-centre table", () => {
    // year -> z, one row per year 2017..2026, 16m apart, centred on 2021.5.
    const table: [number, number][] = [
      [2017, -72],
      [2018, -56],
      [2019, -40],
      [2020, -24],
      [2021, -8],
      [2022, 8],
      [2023, 24],
      [2024, 40],
      [2025, 56],
      [2026, 72],
    ];
    for (const [year, z] of table) expect(yearZ(year), `year ${year}`).toBe(z);
  });

  it("inverts cleanly through zToYear", () => {
    for (const z of [-72, -8, 0, 8, 72, 96]) expect(yearZ(zToYear(z))).toBeCloseTo(z, 6);
    for (const year of [2017, 2021.5, 2026]) expect(zToYear(yearZ(year))).toBeCloseTo(year, 6);
  });
});

describe("dateZ", () => {
  it("parses an ISO date to the day", () => {
    // 2019-05-09 sits partway through 2019's band, not at its centre.
    const z = dateZ("2019-05-09");
    expect(z).not.toBeNull();
    expect(z as number).toBeGreaterThan(yearZ(2019));
    expect(z as number).toBeLessThan(yearZ(2020));
  });

  it("parses a full-month period string to its start", () => {
    // June 2023 is Dice's start — the design doc's own reference point
    // (z ≈ +30.7) for where the era ground-colour ramp begins.
    expect(dateZ("June 2023 - Present")).toBeCloseTo(30.67, 1);
    expect(dateZ("January 2021 - May 2023")).toBeCloseTo(-8, 6);
    expect(dateZ("May 2020 - July 2020")).toBeCloseTo(-18.67, 1);
  });

  it("parses a bare year", () => {
    expect(dateZ("2021")).toBe(yearZ(2021));
    expect(dateZ("2018")).toBe(yearZ(2018));
  });

  it("never guesses at an unparseable date", () => {
    // Prose eras, and the one string with two 4-digit numbers in it where
    // neither is the real year — a naive "find any 4 digits" scan would
    // wrongly parse this as 2069 or 2020.
    for (const value of ["campus-lore", "personal-essay", "humor", "2069 (written 2020)"]) {
      expect(dateZ(value), value).toBeNull();
    }
  });
});
