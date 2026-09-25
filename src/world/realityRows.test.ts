import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildRealityRows, recentPushes, siteCiGlow } from "./realityRows.ts";
import type { Ops } from "../../api/_lib/ops-handler.ts";
import type { GithubActivityItem } from "../../api/_lib/github-activity-handler.ts";
import type { Weather } from "../lib/sky.ts";

const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../e2e/fixtures/${name}`, import.meta.url)), "utf8"));

const OPS: Ops = fixture("ops.json");
const ACTIVITY_ITEMS: GithubActivityItem[] = fixture("activity.json").items;
// The same fixed instant e2e/world-reality.spec.ts and the rest of this
// suite use for "now" — 2026-09-24T12:27 IST.
const NOW_MS = new Date("2026-09-24T12:27:00+05:30").getTime();

describe("recentPushes", () => {
  it("keeps only his own, non-upstream pushes inside the trailing 24h", () => {
    const kept = recentPushes(ACTIVITY_ITEMS, NOW_MS);
    expect(kept.map((i) => i.repo)).toEqual([
      "darkpandawarrior/Doori",
      "darkpandawarrior/Gaddi",
      "darkpandawarrior/PaymentsLab-KMP",
    ]);
  });

  it("break-it: an upstream push inside the window is still excluded", () => {
    const upstream: GithubActivityItem = {
      repo: "openMF/mifos-mobile",
      type: "push",
      message: "x",
      url: "https://github.com/openMF/mifos-mobile/commit/x",
      at: new Date(NOW_MS - 60_000).toISOString(),
      upstream: true,
    };
    expect(recentPushes([upstream], NOW_MS)).toEqual([]);
  });

  it("break-it: a push exactly on the 24h boundary is dropped, not kept", () => {
    const boundary: GithubActivityItem = {
      repo: "darkpandawarrior/Doori",
      type: "push",
      message: "x",
      url: "x",
      at: new Date(NOW_MS - 24 * 60 * 60 * 1000 - 1).toISOString(),
      upstream: false,
    };
    expect(recentPushes([boundary], NOW_MS)).toEqual([]);
  });
});

describe("siteCiGlow", () => {
  it("is 'ok' when ci.yml and refresh-media.yml both last succeeded (the ops.json fixture)", () => {
    expect(siteCiGlow(OPS)).toBe("ok");
  });

  it("break-it: one failing workflow reads 'degraded', never 'ok'", () => {
    const degraded: Ops = { ...OPS, runs: OPS.runs.map((r) => (r.workflow === "ci.yml" ? { ...r, conclusion: "failure" } : r)) };
    expect(siteCiGlow(degraded)).toBe("degraded");
  });

  it("is 'base' when stale", () => {
    expect(siteCiGlow({ ...OPS, stale: true })).toBe("base");
  });

  it("is 'base' when disconnected or null", () => {
    expect(siteCiGlow({ ...OPS, connected: false })).toBe("base");
    expect(siteCiGlow(null)).toBe("base");
  });

  it("is 'base' when a workflow has never run, never a false 'degraded'", () => {
    expect(siteCiGlow({ ...OPS, runs: OPS.runs.filter((r) => r.workflow !== "refresh-media.yml") })).toBe("base");
  });
});

describe("buildRealityRows", () => {
  const WEATHER: Weather = {
    at: "2026-09-24T03:30",
    intervalSec: 900,
    tempC: 21.4,
    code: 61,
    cloudPct: 100,
    precipMmH: 2.4,
    windKmh: 14,
    windFromDeg: 220,
    humidityPct: 98,
    visibilityM: 6000,
  };

  it("Lamps row states the count and the 24h/last-20 label", () => {
    const rows = buildRealityRows({
      sky: null,
      air: null,
      river: null,
      lampPushes: recentPushes(ACTIVITY_ITEMS, NOW_MS),
      visitorCount: 0,
      ops: null,
      touched: [],
    });
    const lamps = rows.find((r) => r.key === "lamps")!;
    expect(lamps.text).toContain("3");
    expect(lamps.text).toContain("pushes in 24 h");
  });

  it("Weather row carries the wet fixture's rate, unit and all", () => {
    const rows = buildRealityRows({
      sky: { now: new Date(), sun: { altitudeDeg: 0, azimuthDeg: 0 }, times: { sunrise: new Date(), solarNoon: new Date(), sunset: new Date() }, daypart: "day", progress: 0, k: { u: 1, sun: [1, 1, 1], sunI: 1, hemiSky: "#fff", hemiGround: "#000", hemiI: 1, zenith: "#000", horizon: "#000", fogNear: 1, fogFar: 1, lamp: 0, ghost: 0 }, weather: WEATHER, preview: false },
      air: null,
      river: null,
      lampPushes: [],
      visitorCount: 0,
      ops: null,
      touched: [],
    });
    const weather = rows.find((r) => r.key === "weather")!;
    expect(weather.text).toContain("2.4 mm/h");
  });

  it("CI row is labelled 'this site' and shows two passes from the ops.json fixture", () => {
    const rows = buildRealityRows({ sky: null, air: null, river: null, lampPushes: [], visitorCount: 0, ops: OPS, touched: [] });
    const ci = rows.find((r) => r.key === "ci")!;
    expect(ci.text).toContain("this site");
    expect((ci.text.match(/✓/g) ?? []).length).toBe(2);
  });

  it("CI row marks a missing workflow run 'unmeasured', never an em dash (G8)", () => {
    const missing: Ops = { ...OPS, runs: OPS.runs.filter((r) => r.workflow !== "refresh-media.yml") };
    const rows = buildRealityRows({ sky: null, air: null, river: null, lampPushes: [], visitorCount: 0, ops: missing, touched: [] });
    const ci = rows.find((r) => r.key === "ci")!;
    expect(ci.text).toContain("refresh-media unmeasured");
    expect(ci.text).not.toContain("—");
  });

  it("You row names every touched slug, and reads honestly when nothing is touched yet", () => {
    const withTouch = buildRealityRows({ sky: null, air: null, river: null, lampPushes: [], visitorCount: 0, ops: null, touched: ["gaddi", "doori"] });
    expect(withTouch.find((r) => r.key === "you")!.text).toContain("doori");

    const empty = buildRealityRows({ sky: null, air: null, river: null, lampPushes: [], visitorCount: 0, ops: null, touched: [] });
    expect(empty.find((r) => r.key === "you")!.text).not.toContain("undefined");
  });

  it("Visitors row states the count, never the word fireflies (M1)", () => {
    const rows = buildRealityRows({ sky: null, air: null, river: null, lampPushes: [], visitorCount: 2, ops: null, touched: [] });
    const visitors = rows.find((r) => r.key === "visitors")!;
    expect(visitors.text).toContain("2 here now");
    expect(rows.map((r) => r.text).join(" ")).not.toMatch(/firefl/i);
  });

  it("emits exactly the eight rows the lane brief names, in order", () => {
    const rows = buildRealityRows({ sky: null, air: null, river: null, lampPushes: [], visitorCount: 0, ops: null, touched: [] });
    expect(rows.map((r) => r.key)).toEqual(["sun", "weather", "air", "river", "lamps", "visitors", "ci", "you"]);
  });
});
