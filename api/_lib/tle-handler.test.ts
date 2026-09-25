import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import { parseTleGroup, buildTleResponse, handleTle } from "./tle-handler";

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/", import.meta.url));
const stationsText = readFileSync(`${FIXTURE_DIR}celestrak-stations-2026-09-23.tle`, "utf8");
const visualText = readFileSync(`${FIXTURE_DIR}celestrak-visual-2026-09-23.tle`, "utf8");

// The snapshot every fixture epoch was measured against — day 266-267 2026.
const FIXTURE_NOW = new Date("2026-09-24T00:00:00Z");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseTleGroup", () => {
  it("parses 20 stations objects and 156 visual objects from the committed fixtures", () => {
    expect(parseTleGroup(stationsText)).toHaveLength(20);
    expect(parseTleGroup(visualText)).toHaveLength(156);
  });
});

describe("buildTleResponse", () => {
  it("fixtures yield exactly 158 objects: stations filtered to 25544/48274, plus every visual object", () => {
    const result = buildTleResponse(stationsText, visualText, FIXTURE_NOW.toISOString(), false, FIXTURE_NOW);
    expect(result.objects).toHaveLength(158);
    const norads = result.objects.map((o) => o.norad);
    expect(norads).toContain("25544");
    expect(norads).toContain("48274");
    // No other station NORAD from the 20-object stations fixture survives.
    const stationOnlyNorads = parseTleGroup(stationsText)
      .map((o) => o.norad)
      .filter((n) => n !== "25544" && n !== "48274");
    for (const n of stationOnlyNorads) expect(norads).not.toContain(n);
  });

  it("a corrupted checksum drops exactly that one object (157, not 158)", () => {
    const lines = visualText.split("\n");
    // Line 2 of the first visual triplet (name, l1, l2) is line index 2.
    const target = lines[2];
    const badDigit = target[68] === "0" ? "1" : "0";
    lines[2] = target.slice(0, 68) + badDigit;
    const corruptedVisual = lines.join("\n");

    const clean = buildTleResponse(stationsText, visualText, FIXTURE_NOW.toISOString(), false, FIXTURE_NOW);
    const corrupted = buildTleResponse(stationsText, corruptedVisual, FIXTURE_NOW.toISOString(), false, FIXTURE_NOW);
    expect(clean.objects).toHaveLength(158);
    expect(corrupted.objects).toHaveLength(157);
  });

  it("drops an object whose epoch is older than 7 days from the reference clock", () => {
    const farFuture = new Date(FIXTURE_NOW.getTime() + 30 * 24 * 60 * 60_000);
    const result = buildTleResponse(stationsText, visualText, FIXTURE_NOW.toISOString(), false, farFuture);
    expect(result.objects).toHaveLength(0);
  });
});

describe("handleTle", () => {
  it("always answers status 200 with the exact cache header, even disconnected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const res = await handleTle(new Request("http://localhost/api/tle"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=7200, stale-while-revalidate=86400");
    const body = await res.json();
    expect(body).toMatchObject({ connected: false, objects: [] });
  });
});
