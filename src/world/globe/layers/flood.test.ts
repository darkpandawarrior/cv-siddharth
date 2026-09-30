import { describe, expect, it, vi } from "vitest";
import { fetchFlood, floodLabel, floodUrl, parseFlood } from "./flood.ts";

describe("floodUrl", () => {
  it("builds the daily-reading request for a lat/lon", () => {
    expect(floodUrl(23.725, 90.375)).toBe(
      "https://flood-api.open-meteo.com/v1/flood?latitude=23.725&longitude=90.375&daily=river_discharge&forecast_days=1",
    );
  });
});

describe("parseFlood", () => {
  it("reads today's discharge value", () => {
    expect(parseFlood({ daily: { river_discharge: [2.08] } })).toEqual({ riverDischargeM3s: 2.08 });
  });

  it("keeps a real zero reading (a dry-but-modelled riverbed), not treated as absent", () => {
    expect(parseFlood({ daily: { river_discharge: [0] } })).toEqual({ riverDischargeM3s: 0 });
  });

  it("returns null for an ocean/no-river cell's null reading", () => {
    expect(parseFlood({ daily: { river_discharge: [null] } })).toBeNull();
  });

  it("returns null for a shape that isn't the real response", () => {
    expect(parseFlood(null)).toBeNull();
    expect(parseFlood({})).toBeNull();
    expect(parseFlood({ daily: { river_discharge: [] } })).toBeNull();
  });
});

describe("floodLabel", () => {
  it("formats river discharge", () => {
    expect(floodLabel({ riverDischargeM3s: 2.08 })).toBe("2.1 m³/s river discharge");
  });
});

describe("fetchFlood", () => {
  it("fetches, parses and returns a reading", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ daily: { river_discharge: [12.84] } }), { status: 200 }));
    const reading = await fetchFlood(18.52, 73.85, fetchImpl as unknown as typeof fetch);
    expect(reading).toEqual({ riverDischargeM3s: 12.84 });
    expect(fetchImpl).toHaveBeenCalledWith(floodUrl(18.52, 73.85));
  });

  it("returns null on a non-ok response instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    expect(await fetchFlood(18.52, 73.85, fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});
