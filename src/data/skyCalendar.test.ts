import { describe, it, expect } from "vitest";
import { SKY_CALENDAR, validUntil, activeFestival, nextFestival, nextMeteorShower } from "./skyCalendar.ts";

describe("SKY_CALENDAR", () => {
  it("has every row start <= end, a non-empty source URL, and a year <= validUntil's year", () => {
    const validUntilYear = Number(validUntil.slice(0, 4));
    for (const row of SKY_CALENDAR) {
      expect(row.start <= row.end).toBe(true);
      expect(row.source.length).toBeGreaterThan(0);
      expect(() => new URL(row.source)).not.toThrow();
      expect(Number(row.start.slice(0, 4))).toBeLessThanOrEqual(validUntilYear);
      expect(Number(row.end.slice(0, 4))).toBeLessThanOrEqual(validUntilYear);
    }
  });

  it("has exactly 4 festivals for each of 2026 and 2027, and 8 meteor showers", () => {
    const festivals = SKY_CALENDAR.filter((r) => r.kind === "festival");
    const meteors = SKY_CALENDAR.filter((r) => r.kind === "meteor");
    expect(festivals.filter((r) => r.start.startsWith("2026")).length).toBe(4);
    expect(festivals.filter((r) => r.start.startsWith("2027")).length).toBe(4);
    expect(meteors.length).toBe(8);
  });
});

describe("activeFestival", () => {
  it("finds Diwali 2026 inside its span and null just outside it", () => {
    expect(activeFestival(new Date("2026-11-08T12:00:00Z"))?.name).toBe("Diwali");
    expect(activeFestival(new Date("2026-11-05T12:00:00Z"))).toBeNull();
    expect(activeFestival(new Date("2026-11-12T12:00:00Z"))).toBeNull();
  });

  it("is null for a date past validUntil", () => {
    expect(activeFestival(new Date("2028-01-01T00:00:00Z"))).toBeNull();
  });
});

describe("nextFestival / nextMeteorShower", () => {
  it("finds Diwali 2026 as the next festival from just before it", () => {
    const next = nextFestival(new Date("2026-11-01T00:00:00Z"));
    expect(next?.row.name).toBe("Diwali");
    expect(next?.daysUntil).toBe(5);
  });

  it("finds Draconids as the next shower from 2026-09-24", () => {
    const next = nextMeteorShower(new Date("2026-09-24T00:00:00Z"));
    expect(next?.row.name).toBe("Draconids");
  });
});
