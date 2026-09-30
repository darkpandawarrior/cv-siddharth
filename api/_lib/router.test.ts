import { handleBuoys } from "./buoys-handler.js";
import { handleVolcanoes } from "./volcano-handler.js";
import { handleSun } from "./sun-handler.js";
import { describe, it, expect } from "vitest";
import { ROUTES, routeNameFrom, dispatch } from "./router";
import { handleAircraft } from "./aircraft-handler";
import { handleChat } from "./chat-handler";
import { handleGithubActivity } from "./github-activity-handler";
import { handleOps } from "./ops-handler";
import { handlePipeline } from "./pipeline-handler";
import { handleSignals } from "./signals-handler";
import { handleSpotify } from "./spotify-handler";
import { handleTerrain } from "./terrain-handler";
import { handleTle } from "./tle-handler";
import { handleWeather } from "./weather-handler";
import { handleWhereami } from "./whereami-handler";
import { handleWind } from "./wind-handler";

// Every route this table replaced (the 11 former top-level api/*.ts files),
// plus every route added since (lane/globe-P10B's terrain) — one entry per
// handler, so a route quietly dropped from the table fails this list, not
// just a runtime 404 nobody wrote a test for.
const EXPECTED: Record<string, unknown> = {
  buoys: handleBuoys,
  volcanoes: handleVolcanoes,
  sun: handleSun,
  aircraft: handleAircraft,
  chat: handleChat,
  "github-activity": handleGithubActivity,
  ops: handleOps,
  pipeline: handlePipeline,
  signals: handleSignals,
  spotify: handleSpotify,
  terrain: handleTerrain,
  tle: handleTle,
  weather: handleWeather,
  whereami: handleWhereami,
  wind: handleWind,
};

describe("ROUTES", () => {
  it("has every registered route", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.keys(EXPECTED))("%s resolves to the same handler function it always did", (name) => {
    expect(ROUTES[name]).toBe(EXPECTED[name]);
  });
});

describe("routeNameFrom", () => {
  it("reads the first path segment after /api/", () => {
    expect(routeNameFrom(new Request("https://cv.example/api/wind"))).toBe("wind");
  });

  it("ignores a query string", () => {
    expect(routeNameFrom(new Request("https://cv.example/api/pipeline?slug=doori"))).toBe("pipeline");
  });

  it("keeps a hyphenated route name whole", () => {
    expect(routeNameFrom(new Request("https://cv.example/api/github-activity"))).toBe("github-activity");
  });
});

describe("dispatch", () => {
  it("routes a known name to its real handler (whereami: no upstream, safe to run for real)", async () => {
    const res = await dispatch(new Request("https://cv.example/api/whereami", { headers: { "x-vercel-ip-country": "IN" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ country: "IN" });
  });

  it("returns 404 JSON for a route that was never a function", async () => {
    const res = await dispatch(new Request("https://cv.example/api/nonexistent"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("returns 404 for /api/ with no segment", async () => {
    const res = await dispatch(new Request("https://cv.example/api/"));
    expect(res.status).toBe(404);
  });
});
