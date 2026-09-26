import type { Now } from "../../worldModel.ts";

export function buildFixtureNow(at: Date = new Date("2026-06-30T12:00:00.000Z")): Now {
  return {
    at,
    sky: { daypart: "day", cloud: 0.3, tempC: 28 },
    moon: { phase: 0.5, altitudeDeg: 10 },
    rain6h: 0,
    air: { pm25: 30, aqiUs: 80, aod: 0.4 },
    river: { levelDeltaM: 0.1, flowSpeed: 1, foam: 0.2 },
    overhead: { aircraft: 2, satellites: 1 },
    pushes24h: [],
    ci: { state: "pass" },
    presence: { here: 1, countries: { IN: 1 } },
    radio: null,
  };
}
