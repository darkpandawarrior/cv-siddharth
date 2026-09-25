import { describe, it, expect } from "vitest";
import { moonRow, starsRow, seasonRow, festivalRow, meteorClause, normalMmForDate } from "./skyText.ts";

describe("moonRow", () => {
  it("names the phase, rounds the percentage, and appends a rise time when given one", () => {
    const rise = new Date("2026-09-24T16:59:00+05:30");
    expect(moonRow({ fraction: 0.94, waxing: true, phaseAngleDeg: 150 }, rise)).toBe(
      "Moon · waxing gibbous 94%, rises 16:59 · computed",
    );
  });

  it("omits the rise clause when there isn't one today", () => {
    expect(moonRow({ fraction: 0.02, waxing: true, phaseAngleDeg: 10 }, null)).toBe("Moon · new 2% · computed");
  });
});

describe("starsRow", () => {
  it("reports the count and magnitude limit with attribution", () => {
    expect(starsRow(1637)).toBe("Stars · 1,637 to magnitude 5.0 · HYG v41 CC BY-SA 4.0 · computed positions");
  });
});

describe("normalMmForDate / seasonRow", () => {
  it("looks up the same normal regardless of the calling year's leap-ness", () => {
    expect(normalMmForDate(new Date("2026-03-01T00:00:00Z"))).toBe(normalMmForDate(new Date("2024-03-01T00:00:00Z")));
  });

  it("wraps ledgerText's seasonRow with this date's normal", () => {
    const row = seasonRow({ days: 30, sumMm: 140 }, new Date("2026-09-24T00:00:00Z"));
    expect(row.startsWith("Season ·")).toBe(true);
    expect(row.endsWith("· computed")).toBe(true);
  });
});

describe("festivalRow", () => {
  it("names the active festival on the day itself", () => {
    expect(festivalRow(new Date("2026-11-08T12:00:00Z"))).toContain("Diwali today");
  });

  it("names the next festival and a day count otherwise", () => {
    const row = festivalRow(new Date("2026-11-01T00:00:00Z"));
    expect(row).toContain("next Diwali in 5 d");
  });
});

describe("meteorClause", () => {
  it("names the next shower within the window, in nights", () => {
    expect(meteorClause(new Date("2026-09-24T00:00:00Z"))).toBe("Draconids peaks in 14 nights");
  });

  it("is null once nothing is within the window", () => {
    expect(meteorClause(new Date("2026-09-24T00:00:00Z"), 3)).toBeNull();
  });
});
