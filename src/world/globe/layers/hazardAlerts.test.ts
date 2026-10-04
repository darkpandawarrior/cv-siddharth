import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseGdacsAlerts, matchGdacsAlerts } from "./hazardAlerts.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../../../../e2e/fixtures/hazards/gdacs.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("parseGdacsAlerts", () => {
  it("keeps only orange/red from the committed fixture", () => {
    const alerts = parseGdacsAlerts(fixture);
    expect(alerts).not.toBeNull();
    expect(alerts!.length).toBe(4);
    expect(alerts!.every((a) => a.alertLevel === "orange" || a.alertLevel === "red")).toBe(true);
  });

  it("drops a green alert", () => {
    const feed = { features: [{ geometry: { type: "Point", coordinates: [1, 2] }, properties: { eventtype: "FL", eventid: 1, alertlevel: "Green" } }] };
    expect(parseGdacsAlerts(feed)).toEqual([]);
  });

  it("returns null on a malformed feed", () => {
    expect(parseGdacsAlerts(null)).toBeNull();
    expect(parseGdacsAlerts({ features: "nope" })).toBeNull();
  });
});

describe("matchGdacsAlerts", () => {
  it("matches an EQ alert to the nearest quake within threshold", () => {
    const alerts = [{ id: "EQ-1", eventType: "EQ", alertLevel: "red" as const, name: "n", lat: 10, lon: 20, url: "u" }];
    const quakes = [{ id: "q1", lat: 10.1, lon: 20.1 }, { id: "q2", lat: -40, lon: 100 }];
    const matched = matchGdacsAlerts(alerts, quakes, []);
    expect(matched[0].matchId).toBe("q1");
    expect(matched[0].matchKind).toBe("quake");
  });

  it("matches a WF alert to the nearest wildfires-category EONET event", () => {
    const alerts = [{ id: "WF-1", eventType: "WF", alertLevel: "orange" as const, name: "n", lat: 44.9, lon: 21.2, url: "u" }];
    const eonet = [{ id: "e1", lat: 44.87, lon: 21.17, category: "wildfires" }, { id: "e2", lat: 44.87, lon: 21.17, category: "severeStorms" }];
    const matched = matchGdacsAlerts(alerts, [], eonet);
    expect(matched[0].matchId).toBe("e1");
  });

  it("stands alone when nothing is within threshold, or the type has no glyph (FL, DR)", () => {
    const alerts = [
      { id: "TC-1", eventType: "TC", alertLevel: "orange" as const, name: "n", lat: 0, lon: 0, url: "u" },
      { id: "FL-1", eventType: "FL", alertLevel: "red" as const, name: "n", lat: 5, lon: 5, url: "u" },
    ];
    const eonet = [{ id: "far", lat: 80, lon: 80, category: "severeStorms" }];
    const matched = matchGdacsAlerts(alerts, [], eonet);
    expect(matched[0].matchId).toBeNull();
    expect(matched[1].matchId).toBeNull();
    expect(matched[1].matchKind).toBeNull();
  });
});
