import { describe, expect, it } from "vitest";
import { isDayAt } from "../geoMath.ts";
import { nextGlobalEclipses, shadowAxisPoint, umbraTrack } from "./eclipse.ts";

// NASA GSFC published the greatest-eclipse point for the 2027-08-02 total
// solar eclipse at https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2027Aug02Tpath.html
// (Fred Espenak, "Greatest Eclipse and Greatest Duration" section), fetched
// 2026-09-29: "Time = 10:06:37.7 UT   Lat = 25 deg30.3'N   Long = 033 deg11.0'E".
// Copied here verbatim rather than recalled, per this lane's brief.
const NASA_GSFC_2027AUG02 = {
  sourceUrl: "https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2027Aug02Tpath.html",
  fetchedAt: "2026-09-29",
  timeUtc: "2027-08-02T10:06:37.7Z",
  latitude: 25 + 30.3 / 60,
  longitude: 33 + 11.0 / 60,
};

function angularSeparationDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (aLat - bLat) * rad;
  const dLon = (aLon - bLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  return Math.hypot(dLat, dLon) / rad;
}

describe("nextGlobalEclipses", () => {
  it("returns the next two global solar eclipses from 2026-09-29, in order", () => {
    const [first, second] = nextGlobalEclipses(new Date("2026-09-29T00:00:00Z"), 2);
    expect(first.kind).toBe("annular");
    expect(first.peak.toISOString().slice(0, 10)).toBe("2027-02-06");
    expect(second.kind).toBe("total");
    expect(second.peak.toISOString().slice(0, 10)).toBe("2027-08-02");
  });

  it("matches NASA GSFC's published greatest-eclipse point within 0.5 degrees", () => {
    const [, total] = nextGlobalEclipses(new Date("2026-09-29T00:00:00Z"), 2);
    expect(total.latitude).toBeDefined();
    expect(total.longitude).toBeDefined();
    const sep = angularSeparationDeg(total.latitude!, total.longitude!, NASA_GSFC_2027AUG02.latitude, NASA_GSFC_2027AUG02.longitude);
    expect(sep).toBeLessThan(0.5);
  });
});

describe("shadowAxisPoint", () => {
  it("also lands within 0.5 degrees of NASA GSFC at the published greatest-eclipse instant", () => {
    const p = shadowAxisPoint(new Date(NASA_GSFC_2027AUG02.timeUtc));
    expect(p).not.toBeNull();
    const sep = angularSeparationDeg(p!.lat, p!.lon, NASA_GSFC_2027AUG02.latitude, NASA_GSFC_2027AUG02.longitude);
    expect(sep).toBeLessThan(0.5);
  });

  it("returns null a week away from any eclipse", () => {
    expect(shadowAxisPoint(new Date("2027-07-26T10:06:00Z"))).toBeNull();
  });
});

describe("umbraTrack", () => {
  it("is on the day side at every point's own timestamp", () => {
    const track = umbraTrack(new Date(NASA_GSFC_2027AUG02.timeUtc));
    expect(track.length).toBeGreaterThan(10);
    for (const p of track) {
      // Independent check: the app's own subsolar/day-side math (geoMath.ts,
      // a different implementation from astronomy-engine), not a re-run of
      // this file's own geometry.
      expect(isDayAt(p.time, p.lat, p.lon)).toBe(true);
    }
  });
});
