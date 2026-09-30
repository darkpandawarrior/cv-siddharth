import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { buildWindQuery, parseWindUpstream, toUV, type WindGridSpec } from "./wind-handler";

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/", import.meta.url));
// A real, committed, trimmed response: the first row of the production
// 648-point grid (lat -85, lon -180/-170/-160/-150), fetched live 2026-09-28.
const fixtureText = readFileSync(`${FIXTURE_DIR}openmeteo-wind-2026-09-28.json`, "utf8");
const FIXTURE_GRID: WindGridSpec = { latStart: -85, latStep: 10, latCount: 1, lonStart: -180, lonStep: 10, lonCount: 4 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildWindQuery", () => {
  it("emits row-major lat/lon CSVs (lat outer, lon inner) matching the upstream's own response order", () => {
    const grid: WindGridSpec = { latStart: -10, latStep: 10, latCount: 2, lonStart: 70, lonStep: 10, lonCount: 3 };
    const { latitude, longitude } = buildWindQuery(grid);
    expect(latitude).toBe("-10,-10,-10,0,0,0");
    expect(longitude).toBe("70,80,90,70,80,90");
  });

  it("the production grid asks for exactly 648 points, the brief's own target density", () => {
    const grid: WindGridSpec = { latStart: -85, latStep: 10, latCount: 18, lonStart: -180, lonStep: 10, lonCount: 36 };
    const { latitude } = buildWindQuery(grid);
    expect(latitude.split(",")).toHaveLength(648);
  });
});

describe("toUV", () => {
  it("wind FROM the north blows toward the south: u=0, v=-speed", () => {
    const [u, v] = toUV(36, 0); // 36 km/h = 10 m/s
    expect(u).toBeCloseTo(0, 6);
    expect(v).toBeCloseTo(-10, 6);
  });
  it("wind FROM the east blows toward the west: u=-speed, v=0", () => {
    const [u, v] = toUV(36, 90);
    expect(u).toBeCloseTo(-10, 6);
    expect(v).toBeCloseTo(0, 6);
  });
});

describe("parseWindUpstream", () => {
  it("parses the committed fixture's 4 points against a matching 1x4 grid", () => {
    const result = parseWindUpstream(fixtureText, FIXTURE_GRID);
    expect(result).not.toBeNull();
    expect(result!.u).toHaveLength(4);
    expect(result!.v).toHaveLength(4);
    expect(result!.modelTime).toBe("2026-09-28T07:30");
    // Fixture point 0: wind_speed_10m 23.3 km/h, wind_direction_10m 176.
    const [expectedU, expectedV] = toUV(23.3, 176);
    expect(result!.u[0]).toBeCloseTo(expectedU, 6);
    expect(result!.v[0]).toBeCloseTo(expectedV, 6);
  });

  it("returns null when the array length doesn't match the grid (truncated or malformed body)", () => {
    const wrongGrid: WindGridSpec = { ...FIXTURE_GRID, lonCount: 5 };
    expect(parseWindUpstream(fixtureText, wrongGrid)).toBeNull();
  });

  it("returns null on unparseable JSON", () => {
    expect(parseWindUpstream("not json", FIXTURE_GRID)).toBeNull();
  });

  it("a point with no current block reads as calm (0,0) rather than failing the whole grid", () => {
    const points = JSON.parse(fixtureText);
    points[1] = { latitude: points[1].latitude, longitude: points[1].longitude };
    const result = parseWindUpstream(JSON.stringify(points), FIXTURE_GRID);
    expect(result).not.toBeNull();
    expect(result!.u[1]).toBe(0);
    expect(result!.v[1]).toBe(0);
    // The other three points are untouched.
    expect(result!.u[0]).not.toBe(0);
  });
});

describe("handleWind", () => {
  // wind-handler.ts's governor state is module-scope, keyed "wind" —
  // resetModules + a fresh dynamic import gives each test its own instance
  // instead of leaking cooldown/last-good across cases (same pattern as
  // aircraft-handler.test.ts's getAircraft/handleAircraft block).
  beforeEach(() => {
    vi.resetModules();
  });

  it("a dead upstream still answers 200, disconnected, with the short error cache header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const { handleWind: freshHandleWind } = await import("./wind-handler");
    const res = await freshHandleWind(new Request("http://localhost/api/wind"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
    const body = await res.json();
    expect(body).toMatchObject({ connected: false, u: [], v: [], grid: null });
  });

  it("a healthy upstream answers connected with the hour-long shared cache header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(buildFullGridFixture()), { status: 200 })),
    );
    const { handleWind: freshHandleWind } = await import("./wind-handler");
    const res = await freshHandleWind(new Request("http://localhost/api/wind"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.u).toHaveLength(648);
    expect(body.grid).toMatchObject({ latCount: 18, lonCount: 36 });
  });
});

/** A synthetic 648-point upstream body, one per production-grid point, built
 *  from a single real fixture point repeated — enough to exercise the
 *  "healthy" path's shape (648 in, 648 out) without a second live fetch. */
function buildFullGridFixture(): unknown[] {
  const sample = JSON.parse(fixtureText)[0];
  return new Array(648).fill(0).map(() => sample);
}
