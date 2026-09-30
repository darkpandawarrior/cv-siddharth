import { describe, expect, it } from "vitest";
import { feedEmptyState } from "./feedEmptyState.ts";
import { useGlobe } from "../globeStore.ts";
const on = { ...useGlobe.getState().layers, satellites: true };
const off = { ...on, satellites: false };
const failed = { satellites: { state: "failed" as const, detail: "TLE feed unreachable" } };
describe("feed empty state precedence", () => {
  it("clears a nonmatching filter before considering off or failed producers", () => {
    expect(feedEmptyState([{ kind: "quake" }], "satellite", off, failed)).toEqual({ text: "No satellites items in this session yet", action: "all", layers: [] });
  });
  it("names and enables off layers before considering failures", () => {
    expect(feedEmptyState([], "satellite", off, failed)).toEqual({ text: "Layers off: Satellites", action: "enable", layers: ["satellites"] });
  });
  it("names failed sources", () => {
    expect(feedEmptyState([], "satellite", on, failed).text).toContain("Unavailable: CelesTrak TLE");
  });
  it("waits for loading, connected, missing and mixed producers", () => {
    for (const status of [{}, { satellites: { state: "loading" as const } }, { satellites: { state: "live" as const } }]) {
      expect(feedEmptyState([], "satellite", on, status).action).toBeNull();
      expect(feedEmptyState([], "satellite", on, status).text).toContain("Nothing yet");
    }
    expect(feedEmptyState([], null, on, failed).text).toContain("Nothing yet");
    // HazardLayer cannot report the independent SpaceWeather publisher's health.
    for (const hazards of [false, true]) {
      expect(feedEmptyState([], "hazard", { ...on, hazards }, { hazards: { state: "failed" } })).toEqual({ text: "Nothing yet. The feed fills as things happen.", action: null, layers: [] });
    }
    expect(feedEmptyState([{ kind: "satellite" }], "hazard", { ...on, hazards: false }, { hazards: { state: "failed" } }).action).toBe("all");
  });
});
