import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseEonetEvents, eventsAtTime, eonetFadeAlpha, trackAtTime } from "./eonet.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../../../../e2e/fixtures/hazards/eonet.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("parseEonetEvents", () => {
  it("parses the committed fixture into the three categories this lane draws", () => {
    const events = parseEonetEvents(fixture);
    expect(events).not.toBeNull();
    const cats = new Set(events!.map((e) => e.category));
    expect(cats).toEqual(new Set(["wildfires", "severeStorms", "volcanoes"]));
  });

  it("keeps the storm's dated track, oldest to newest, and drops it for point events", () => {
    const events = parseEonetEvents(fixture)!;
    const storm = events.find((e) => e.category === "severeStorms")!;
    expect(storm.track).not.toBeNull();
    expect(storm.track!.length).toBeGreaterThan(1);
    for (let i = 1; i < storm.track!.length; i++) expect(storm.track![i].dateMs).toBeGreaterThanOrEqual(storm.track![i - 1].dateMs);
    expect(storm.lat).toBeCloseTo(storm.track![storm.track!.length - 1].lat, 6);

    const fire = events.find((e) => e.category === "wildfires")!;
    expect(fire.track).toBeNull();
  });

  it("returns null on a malformed feed", () => {
    expect(parseEonetEvents(null)).toBeNull();
    expect(parseEonetEvents({ events: "nope" })).toBeNull();
  });

  it("ignores a category this lane doesn't draw", () => {
    const dustStorm = { events: [{ id: "x", title: "t", categories: [{ id: "dustHaze", title: "Dust and Haze" }], geometry: [{ type: "Point", date: "2026-01-01T00:00:00Z", coordinates: [1, 2] }] }] };
    expect(parseEonetEvents(dustStorm)).toEqual([]);
  });
});

describe("time filtering (task 7)", () => {
  const events = parseEonetEvents(fixture)!;
  it("drops events after the simulated instant", () => {
    const earliest = Math.min(...events.map((e) => e.dateMs));
    expect(eventsAtTime(events, earliest - 1)).toEqual([]);
  });
  it("fades with a floor, never to zero", () => {
    const now = Date.now();
    expect(eonetFadeAlpha(now, now)).toBe(1);
    expect(eonetFadeAlpha(now, now - 30 * 24 * 3600_000)).toBe(0.15);
  });
  it("clips a storm track to the simulated instant", () => {
    const storm = events.find((e) => e.category === "severeStorms")!;
    const midPoint = storm.track![1].dateMs;
    const clipped = trackAtTime(storm.track!, midPoint);
    expect(clipped.length).toBe(2);
    expect(clipped.every((p) => p.dateMs <= midPoint)).toBe(true);
  });
});
