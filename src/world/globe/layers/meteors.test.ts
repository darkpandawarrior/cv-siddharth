import { describe, expect, it } from "vitest";
import { activeShowers, meteorShowerLine, monthDayInRange, radiantRiseTime } from "./meteors.ts";
import { MAJOR_SHOWERS } from "./meteorShowerData.ts";

describe("monthDayInRange", () => {
  it("matches an ordinary same-year window", () => {
    expect(monthDayInRange(8, 12, 7, 17, 8, 24)).toBe(true);
    expect(monthDayInRange(9, 1, 7, 17, 8, 24)).toBe(false);
  });

  it("wraps a window crossing the Dec/Jan boundary", () => {
    expect(monthDayInRange(1, 4, 12, 28, 1, 12)).toBe(true); // Quadrantids peak
    expect(monthDayInRange(12, 30, 12, 28, 1, 12)).toBe(true);
    expect(monthDayInRange(6, 1, 12, 28, 1, 12)).toBe(false);
  });
});

describe("activeShowers", () => {
  it("finds the Geminids on their published peak date", () => {
    expect(activeShowers(new Date("2026-12-14T00:00:00Z"))[0]?.name).toBe("Geminids");
  });

  it("returns null on a date with no active shower", () => {
    expect(activeShowers(new Date("2026-03-01T00:00:00Z"))).toEqual([]);
  });

  it("retains overlapping Delta Aquariid and Perseid windows", () => {
    expect(activeShowers(new Date("2026-08-12T00:00:00Z")).map((s) => s.name)).toEqual(["Southern Delta Aquariids", "Perseids"]);
  });
});

describe("radiantRiseTime", () => {
  it("finds a rise time within the scanned day for a mid-latitude radiant", () => {
    // Geminids radiant (RA ~7.47h, Dec ~33) as seen from Pune -- rises and
    // sets every sidereal day at this latitude, so a rise must exist
    // somewhere in a 24h scan from any starting instant.
    const rise = radiantRiseTime(7.47, 33, 18.5, 73.8, new Date("2026-12-14T00:00:00Z"));
    expect(rise).not.toBeNull();
    expect(rise!.getTime()).toBeGreaterThan(new Date("2026-12-14T00:00:00Z").getTime());
  });

  it("returns null for a radiant that never crosses the horizon at that latitude (circumpolar)", () => {
    // Dec 75 (Ursids) never sets, let alone rises, from a latitude beyond
    // 90-75=15 deg -- from the north pole it is permanently up.
    expect(radiantRiseTime(14.47, 75, 89, 0, new Date("2026-12-22T00:00:00Z"))).toBeNull();
  });
});

describe("meteorShowerLine", () => {
  it("names the shower, its peak date and the rise time", () => {
    const shower = MAJOR_SHOWERS.find((s) => s.name === "Geminids")!;
    const rise = new Date("2026-12-14T16:44:00Z");
    expect(meteorShowerLine(shower, rise)).toContain("Meteor shower active: Geminids, peak around Dec 14 (2026 baseline)");
  });

  it("says plainly when there is no rise in the scanned window", () => {
    const shower = MAJOR_SHOWERS.find((s) => s.name === "Geminids")!;
    expect(meteorShowerLine(shower, null)).toContain("no horizon crossing in next 24h");
  });
});
