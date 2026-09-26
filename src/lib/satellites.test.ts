import { describe, expect, it } from "vitest";
import { lookAnglesFor, nextVisiblePass, risingWithin, sunlit, visibleNow, type TleObject } from "./satellites.ts";
import tleFixture from "../../e2e/fixtures/tle.json" with { type: "json" };

// open-data-spec.md §1: measured at this exact instant against the P2-02b
// fixture TLEs (scratchpad/od/satprobe.mjs, stations + visual snapshot).
const CLOCK = new Date("2026-09-23T22:26:56Z");
const OBJECTS = tleFixture.objects as TleObject[];
const ISS = OBJECTS.find((o) => o.norad === "25544")!;

describe("satellites", () => {
  it("visibleNow matches the measured snapshot: 7 above the horizon", () => {
    expect(visibleNow(OBJECTS, CLOCK)).toBe(7);
  });

  it("sunlit matches the measured snapshot: 3 of the visible are sunlit", () => {
    expect(sunlit(OBJECTS, CLOCK)).toBe(3);
  });

  it("risingWithin(600) matches the measured snapshot: 13 above within 10 min", () => {
    expect(risingWithin(OBJECTS, CLOCK, 600)).toBe(13);
  });

  it("ISS az/el matches the measured snapshot", () => {
    const look = lookAnglesFor(ISS, CLOCK);
    expect(look).not.toBeNull();
    expect(look!.azDeg).toBeCloseTo(146.8, 0);
    expect(Math.abs(look!.azDeg - 146.8)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(look!.elDeg - -39.3)).toBeLessThanOrEqual(0.3);
  });

  it("nextVisiblePass(ISS) matches the ledger row: 29 Sep 19:33 IST, max el ~11.5", async () => {
    const pass = await nextVisiblePass(ISS, CLOCK);
    expect(pass).not.toBeNull();
    const expectedStart = new Date("2026-09-29T14:02:56Z").getTime();
    expect(Math.abs(pass!.start.getTime() - expectedStart)).toBeLessThanOrEqual(60_000);
    expect(Math.abs(pass!.maxElDeg - 11.5)).toBeLessThanOrEqual(0.5);
  });

  it("drops elements older than 7 days from the passed-in clock", () => {
    const stale: TleObject = { ...ISS, l1: staleLine(ISS.l1, 8) };
    expect(visibleNow([stale], CLOCK)).toBe(0);
    expect(sunlit([stale], CLOCK)).toBe(0);
    expect(risingWithin([stale], CLOCK, 600)).toBe(0);
  });

  it("nextVisiblePass returns null for a stale element", async () => {
    const stale: TleObject = { ...ISS, l1: staleLine(ISS.l1, 8) };
    expect(await nextVisiblePass(stale, CLOCK)).toBeNull();
  });

  it("lookAnglesFor returns null for an unparseable/garbage TLE pair", () => {
    const junk: TleObject = { name: "junk", norad: "0", l1: "garbage", l2: "garbage" };
    expect(lookAnglesFor(junk, CLOCK)).toBeNull();
  });
});

/** Rewrites a TLE line-1's epoch to `daysAgo` before CLOCK, keeping the rest
 *  of the line (and thus the checksum-independent fields) intact — this test
 *  only needs the epoch field, not a re-checksummed line. */
function staleLine(l1: string, daysAgo: number): string {
  const past = new Date(CLOCK.getTime() - daysAgo * 86_400_000);
  const start = Date.UTC(past.getUTCFullYear(), 0, 1);
  const dayOfYear = (past.getTime() - start) / 86_400_000 + 1;
  const yy = String(past.getUTCFullYear() % 100).padStart(2, "0");
  const doy = dayOfYear.toFixed(8).padStart(12, "0");
  return l1.slice(0, 18) + yy + doy + l1.slice(32);
}
