import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseLaunches, formatCountdown, getCachedLaunches, setCachedLaunches } from "./launches.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../../../../e2e/fixtures/hazards/launches.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
// The fixture's own real NETs run 2026-09-26 through 2026-10-07; this sits
// between the already-flown one and the rest, matching what "now" would
// have been the day this fixture was pulled.
const NOW = Date.parse("2026-09-27T13:00:00Z");

describe("parseLaunches", () => {
  it("drops the already-flown entry and keeps the forward-looking ones, soonest first", () => {
    const launches = parseLaunches(fixture, NOW);
    expect(launches).not.toBeNull();
    expect(launches!.every((l) => l.netMs > NOW)).toBe(true);
    expect(launches!.some((l) => l.name.includes("USSF-385"))).toBe(false);
    for (let i = 1; i < launches!.length; i++) expect(launches![i].netMs).toBeGreaterThanOrEqual(launches![i - 1].netMs);
  });

  it("flags the next-24h launch and only that one", () => {
    const launches = parseLaunches(fixture, NOW)!;
    const within = launches.filter((l) => l.within24h);
    expect(within.length).toBe(1);
    expect(within[0].name).toContain("Starship");
  });

  it("carries a numeric pad position", () => {
    const launches = parseLaunches(fixture, NOW)!;
    for (const l of launches) {
      expect(Number.isFinite(l.lat)).toBe(true);
      expect(Number.isFinite(l.lon)).toBe(true);
    }
  });

  it("returns null on a malformed feed", () => {
    expect(parseLaunches(null, NOW)).toBeNull();
    expect(parseLaunches({ results: "nope" }, NOW)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("steps minutes, hours, days", () => {
    const now = 0;
    expect(formatCountdown(now, now + 5 * 60_000)).toBe("T-5m");
    expect(formatCountdown(now, now + 3 * 3600_000 + 20 * 60_000)).toBe("T-3h 20m");
    expect(formatCountdown(now, now + 2 * 86_400_000 + 5 * 3600_000)).toBe("T-2d 5h");
  });
});

describe("sessionStorage cache", () => {
  function fakeStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; store: Map<string, string> } {
    const store = new Map<string, string>();
    return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
  }

  it("round-trips within the TTL", () => {
    const storage = fakeStorage();
    const launches = parseLaunches(fixture, NOW)!;
    setCachedLaunches(storage, launches, NOW);
    expect(getCachedLaunches(storage, NOW + 10 * 60_000)).toEqual(launches);
  });

  it("expires past the 30 min TTL", () => {
    const storage = fakeStorage();
    setCachedLaunches(storage, [], NOW);
    expect(getCachedLaunches(storage, NOW + 31 * 60_000)).toBeNull();
  });

  it("returns null rather than throwing on a corrupt entry", () => {
    const storage = fakeStorage();
    storage.store.set("cv-siddharth:hazard-launches", "{not json");
    expect(getCachedLaunches(storage, NOW)).toBeNull();
  });
});
