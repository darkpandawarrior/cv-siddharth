import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { TleObject } from "../../../lib/satellites.ts";
import { azimuthToCompass, formatDurationMin, formatPuneClock, nextVisiblePassDetail, tonightLine } from "./satPasses.ts";

// Same committed fixture e2e/globe-L3.spec.ts already reads — ISS's own TLE,
// still fresh (isFresh's 7-day window measures from the element's own
// epoch, not from this test's clock).
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "e2e", "fixtures");
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8")) as { objects: TleObject[] };
const ISS = tleFixture.objects.find((o) => o.norad === "25544")!;

// Recorded once by scanning the fixture ISS element forward from this
// instant (scratchpad probe, same discipline e2e/globe-L3.spec.ts's own
// header comment describes for its own overhead-instant): the next visible
// pass is short — the ISS enters Earth's shadow (isSunlitAt flips false)
// just 15s after the pass clears the 10 deg/dark-sky bar, ending it there.
const SCAN_FROM = new Date("2026-09-23T22:26:56Z");

describe("nextVisiblePassDetail", () => {
  it("finds the ISS's next real (sunlit + observer-dark) pass, with a start/end and a compass direction each end", async () => {
    const pass = await nextVisiblePassDetail(ISS, SCAN_FROM);
    expect(pass).not.toBeNull();
    expect(pass!.start.toISOString()).toBe("2026-09-29T14:02:56.000Z");
    expect(pass!.maxElDeg).toBeGreaterThan(10);
    expect(pass!.end.getTime()).toBeGreaterThanOrEqual(pass!.start.getTime());
    expect(azimuthToCompass(pass!.startAzDeg)).toBe("NNE");
  });

  it("break-it: an object with no qualifying pass in the scan window (element too stale to trust) returns null, never a guessed pass", async () => {
    const stale: TleObject = { ...ISS, l1: ISS.l1.slice(0, 18) + "00" + ISS.l1.slice(20) }; // epoch year columns (19-20) rewritten to "00" -> year 2000, far outside isFresh's 7-day window from SCAN_FROM
    const pass = await nextVisiblePassDetail(stale, SCAN_FROM);
    expect(pass).toBeNull();
  });
});

describe("azimuthToCompass", () => {
  it.each([
    [0, "N"],
    [90, "E"],
    [180, "S"],
    [270, "W"],
    [359, "N"],
    [-10, "N"],
  ])("%s deg -> %s", (deg, point) => {
    expect(azimuthToCompass(deg)).toBe(point);
  });
});

describe("formatDurationMin / formatPuneClock", () => {
  it("formats a sub-minute pass as m:ss", () => {
    expect(formatDurationMin(0.25)).toBe("0:15");
  });

  it("renders the pass start in IST wall-clock time", () => {
    expect(formatPuneClock(new Date("2026-09-29T14:02:56.000Z"))).toBe("19:32");
  });
});

describe("tonightLine", () => {
  it("names the object and the Pune clock time when the pass starts within 24h", async () => {
    const now = new Date("2026-09-29T10:00:00Z");
    const pass = await nextVisiblePassDetail(ISS, now);
    expect(tonightLine(pass, now, "ISS")).toBe("ISS visible tonight at 19:33 from Pune");
  });

  it("stays silent for a pass more than 24h out — never a claim about a pass a week away", () => {
    const now = new Date("2026-09-23T22:26:56Z");
    const farPass = { start: new Date("2026-09-29T14:02:56Z"), end: new Date("2026-09-29T14:03:11Z"), maxElDeg: 11.5, startAzDeg: 17, endAzDeg: 21, durationMin: 0.25 };
    expect(tonightLine(farPass, now, "ISS")).toBeNull();
  });

  it("a null pass (nothing in the scan window) never produces a line", () => {
    expect(tonightLine(null, new Date(), "ISS")).toBeNull();
  });
});
