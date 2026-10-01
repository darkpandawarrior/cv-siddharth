import { describe, expect, it } from "vitest";
import {
  describeZoom,
  interpolateLatLon,
  MAX_RENDERED,
  nearestPlaceName,
  QUANTUM_DEG,
  PUBLISH_MS,
  quantizeLatLon,
  selectOthers,
  shouldPublish,
  zoomBucket,
  type ViewPresence,
} from "./together.ts";

const view = (lat: number, lon: number, zoom: ViewPresence["zoom"] = "region", mode: ViewPresence["mode"] = "orbit"): ViewPresence => ({
  lat,
  lon,
  zoom,
  mode,
});

describe("quantizeLatLon", () => {
  it("rounds to the nearest QUANTUM_DEG on both axes", () => {
    expect(quantizeLatLon(19.9, 73.4)).toEqual({ lat: 21, lon: 72 });
    expect(quantizeLatLon(0.4, -0.4)).toEqual({ lat: 0, lon: 0 });
  });

  it("clamps latitude to +/-90 and wraps longitude back into range", () => {
    expect(quantizeLatLon(91, 0)).toEqual({ lat: 90, lon: 0 });
    expect(quantizeLatLon(-91, 0)).toEqual({ lat: -90, lon: 0 });
    // 370 quantizes to 369, one full turn past 9 degrees.
    expect(quantizeLatLon(0, 370).lon).toBeCloseTo(9, 5);
  });
});

describe("zoomBucket", () => {
  it("buckets ground/follow-level and tight orbit as close", () => {
    expect(zoomBucket(0.02)).toBe("close");
    expect(zoomBucket(3)).toBe("close");
  });

  it("buckets a mid zoom as region and a wide one as orbit", () => {
    expect(zoomBucket(10)).toBe("region");
    expect(zoomBucket(36)).toBe("orbit");
  });
});

describe("shouldPublish — the throttle", () => {
  it("never publishes before PUBLISH_MS has elapsed, even with a real change", () => {
    const last = view(0, 0);
    const next = view(30, 30);
    expect(shouldPublish(last, next, PUBLISH_MS - 1)).toBe(false);
  });

  it("publishes past the elapsed gate when nothing changed by more than one quantum", () => {
    const last = view(21, 72);
    const next = view(21, 72);
    expect(shouldPublish(last, next, PUBLISH_MS)).toBe(false);
  });
});

describe("shouldPublish — the change threshold", () => {
  it("publishes the very first reading unconditionally (no `last` yet)", () => {
    expect(shouldPublish(null, view(0, 0), 0)).toBe(true);
  });

  it("does not publish a move of exactly one quantum (needs MORE than one)", () => {
    const last = view(0, 0);
    const next = view(QUANTUM_DEG, 0);
    expect(shouldPublish(last, next, PUBLISH_MS)).toBe(false);
  });

  it("publishes once the move exceeds one quantum", () => {
    const last = view(0, 0);
    const next = view(QUANTUM_DEG * 2, 0);
    expect(shouldPublish(last, next, PUBLISH_MS)).toBe(true);
  });

  it("publishes a bucket or mode change even with an unchanged lat/lon", () => {
    const last = view(0, 0, "orbit", "orbit");
    expect(shouldPublish(last, view(0, 0, "close", "orbit"), PUBLISH_MS)).toBe(true);
    expect(shouldPublish(last, view(0, 0, "orbit", "ground"), PUBLISH_MS)).toBe(true);
  });
});

describe("interpolateLatLon", () => {
  it("returns the start point at t=0 and the end point at t=1", () => {
    const a = { lat: 10, lon: 20 };
    const b = { lat: -30, lon: 100 };
    const start = interpolateLatLon(a, b, 0);
    const end = interpolateLatLon(a, b, 1);
    expect(start.lat).toBeCloseTo(a.lat, 4);
    expect(start.lon).toBeCloseTo(a.lon, 4);
    expect(end.lat).toBeCloseTo(b.lat, 4);
    expect(end.lon).toBeCloseTo(b.lon, 4);
  });

  it("glides monotonically toward the target rather than jumping", () => {
    const a = { lat: 0, lon: 0 };
    const b = { lat: 0, lon: 30 };
    const mid = interpolateLatLon(a, b, 0.5);
    // Eased, so the midpoint isn't exactly halfway, but it must sit
    // strictly between the endpoints on the great-circle path, never past b.
    expect(mid.lon).toBeGreaterThan(a.lon);
    expect(mid.lon).toBeLessThan(b.lon);
  });
});

describe("nearestPlaceName", () => {
  it("finds India from a point over Pune", () => {
    expect(nearestPlaceName(18.52, 73.86)).toBe("India");
  });

  it("finds a different country from the opposite side of the globe", () => {
    expect(nearestPlaceName(39.5, -98.5)).toBe("United States of America");
  });
});

describe("describeZoom", () => {
  it("has a distinct phrase per bucket", () => {
    const phrases = new Set([describeZoom("close"), describeZoom("region"), describeZoom("orbit")]);
    expect(phrases.size).toBe(3);
  });
});

describe("selectOthers — self filtering", () => {
  it("excludes any entry flagged isMe, keeps the rest", () => {
    const entries: [string, ReturnType<typeof view> & { isMe?: boolean }][] = [
      ["me", { ...view(0, 0), isMe: true }],
      ["peer-1", view(10, 10)],
    ];
    const { rendered, total } = selectOthers(entries);
    expect(rendered.map(([k]) => k)).toEqual(["peer-1"]);
    expect(total).toBe(1);
  });

  it("drops an entry that hasn't published every field yet", () => {
    const entries: [string, Partial<ViewPresence>][] = [["peer-1", { lat: 0 }]];
    const { rendered, total } = selectOthers(entries);
    expect(rendered).toEqual([]);
    expect(total).toBe(0);
  });
});

describe("selectOthers — the render cap", () => {
  it("caps `rendered` at MAX_RENDERED but reports the true `total`", () => {
    const entries: [string, ViewPresence][] = Array.from({ length: MAX_RENDERED + 5 }, (_, i) => [`peer-${i}`, view(i, i)]);
    const { rendered, total } = selectOthers(entries);
    expect(rendered).toHaveLength(MAX_RENDERED);
    expect(total).toBe(MAX_RENDERED + 5);
  });
});
