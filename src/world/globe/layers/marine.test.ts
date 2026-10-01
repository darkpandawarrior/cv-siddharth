import { describe, expect, it, vi } from "vitest";
import { fetchMarine, marineLabel, marineUrl, parseMarine } from "./marine.ts";

describe("marineUrl", () => {
  it("builds the current-reading request for a lat/lon", () => {
    expect(marineUrl(18.95, 72.6)).toBe(
      "https://marine-api.open-meteo.com/v1/marine?latitude=18.950&longitude=72.600&current=wave_height,swell_wave_height,swell_wave_period",
    );
  });
});

describe("parseMarine", () => {
  it("reads a coastal current reading", () => {
    const json = { current: { wave_height: 0.94, swell_wave_height: 0.66, swell_wave_period: 6.95 } };
    expect(parseMarine(json)).toEqual({ waveHeightM: 0.94, swellHeightM: 0.66, swellPeriodS: 6.95 });
  });

  it("returns null for a landlocked point's null-filled current block", () => {
    const json = { current: { wave_height: null, swell_wave_height: null, swell_wave_period: null } };
    expect(parseMarine(json)).toBeNull();
  });

  it("returns null for a shape that isn't the real response", () => {
    expect(parseMarine(null)).toBeNull();
    expect(parseMarine({})).toBeNull();
    expect(parseMarine({ current: { wave_height: "0.9" } })).toBeNull();
  });
});

describe("marineLabel", () => {
  it("formats wave height, swell height and period", () => {
    expect(marineLabel({ waveHeightM: 0.94, swellHeightM: 0.66, swellPeriodS: 6.95 })).toBe("0.9 m waves, 0.7 m swell @ 7 s");
  });
});

describe("fetchMarine", () => {
  it("fetches, parses and returns a reading", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ current: { wave_height: 1, swell_wave_height: 0.5, swell_wave_period: 5 } }), { status: 200 }));
    const reading = await fetchMarine(18.95, 72.6, fetchImpl as unknown as typeof fetch);
    expect(reading).toEqual({ waveHeightM: 1, swellHeightM: 0.5, swellPeriodS: 5 });
    expect(fetchImpl).toHaveBeenCalledWith(marineUrl(18.95, 72.6));
  });

  it("returns null on a non-ok response instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    expect(await fetchMarine(18.95, 72.6, fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});
