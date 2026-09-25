import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import rawFixture from "./__fixtures__/adsb-lol-point-60nm-2026-09-23T2221Z.json" with { type: "json" };
import { normalizeAircraft, buildAircraftResponse, type AircraftEntry } from "./aircraft-handler";

type FixtureRow = { _synthetic?: string; flight?: string } & Record<string, unknown>;

const allRows = rawFixture.ac as unknown as FixtureRow[];
const realRows = allRows.filter((a) => !a._synthetic);

function csOf(entries: AircraftEntry[]): string[] {
  return entries.map((a) => a.cs);
}

describe("normalizeAircraft", () => {
  it("the 11 real rows yield exactly 10 aircraft — the ground row is dropped", () => {
    expect(realRows).toHaveLength(11);
    expect(normalizeAircraft(realRows as never)).toHaveLength(10);
  });

  it("with the 6 synthetic rows added the result is 11: military, LADD, PIA, no-callsign and seen_pos 90 dropped; 7700 kept without its squawk", () => {
    expect(allRows).toHaveLength(17);
    const result = normalizeAircraft(allRows as never);
    expect(result).toHaveLength(11);

    const callsigns = csOf(result);
    expect(callsigns).not.toContain("IAF441"); // military flag
    expect(callsigns).not.toContain("EXC012"); // LADD flag
    expect(callsigns).not.toContain("PVT007"); // PIA flag
    expect(callsigns).not.toContain("IGO9001"); // seen_pos 90

    const kept7700 = result.find((a) => a.cs === "AIC777");
    expect(kept7700).toBeDefined();
    expect(kept7700).not.toHaveProperty("squawk");
  });

  it("no emitted key matches the stripped-field pattern", () => {
    // The exact upstream field names this route must never re-emit — a bare
    // prefix test would also flag legitimate output fields that happen to
    // start with the same letter, e.g. rangeKm.
    const exactlyForbidden = new Set(["hex", "r", "squawk", "emergency", "dbFlags", "messages", "rssi"]);
    for (const entry of normalizeAircraft(allRows as never)) {
      for (const key of Object.keys(entry)) {
        expect(exactlyForbidden.has(key)).toBe(false);
        expect(key.startsWith("nav_")).toBe(false);
      }
    }
  });

  it("sorts by distance ascending and caps at 64", () => {
    const result = normalizeAircraft(allRows as never);
    const ranges = result.map((a) => a.rangeKm);
    expect(ranges).toEqual([...ranges].sort((a, b) => a - b));
    expect(result.length).toBeLessThanOrEqual(64);
  });

  it("drops a row with no callsign and one whose callsign fails the ICAO pattern", () => {
    const noCallsign = normalizeAircraft([{ ...realRows[1], flight: "   " }] as never);
    expect(noCallsign).toHaveLength(0);
    const badPattern = normalizeAircraft([{ ...realRows[1], flight: "N12345" }] as never);
    expect(badPattern).toHaveLength(0);
  });
});

describe("buildAircraftResponse", () => {
  it("wraps the normalised list with the response envelope", () => {
    const response = buildAircraftResponse(rawFixture as never, "2026-09-23T22:26:56Z", false);
    expect(response).toMatchObject({
      connected: true,
      stale: false,
      at: "2026-09-23T22:26:56Z",
      radiusNm: 60,
      total: 11,
      source: "adsb.lol (ODbL 1.0)",
      sourceUrl: "https://adsb.lol",
    });
    expect(response.aircraft).toHaveLength(11);
  });
});

describe("getAircraft / handleAircraft", () => {
  // aircraft-handler.ts's governor state is module-scope, keyed "aircraft" —
  // resetModules + a fresh dynamic import gives each test its own instance
  // instead of leaking cooldown/last-good across cases.
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serves connected:true, stale:false on a clean upstream response", async () => {
    const { getAircraft } = await import("./aircraft-handler");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(rawFixture), { status: 200 }));
    const result = await getAircraft(fetchImpl as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.aircraft).toHaveLength(11);
  });

  it("last-good older than 5 min gives {connected:false, aircraft:[]}", async () => {
    vi.useFakeTimers();
    const { getAircraft } = await import("./aircraft-handler");
    const good = vi.fn(async () => new Response(JSON.stringify(rawFixture), { status: 200 }));
    const first = await getAircraft(good as unknown as typeof fetch);
    expect(first.connected).toBe(true);

    vi.advanceTimersByTime(5 * 60_000 + 1_000); // just past the 5 min maxStaleMs
    const down = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await getAircraft(down as unknown as typeof fetch);
    expect(result).toEqual({
      connected: false,
      stale: false,
      at: null,
      radiusNm: 60,
      total: 0,
      source: "adsb.lol (ODbL 1.0)",
      sourceUrl: "https://adsb.lol",
      aircraft: [],
    });
  });

  it("handleAircraft always answers status 200 with the exact cache header, even disconnected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const { handleAircraft } = await import("./aircraft-handler");
    const res = await handleAircraft(new Request("http://localhost/api/aircraft"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=30, stale-while-revalidate=60");
    const body = await res.json();
    expect(body).toMatchObject({ connected: false, aircraft: [] });
  });
});
