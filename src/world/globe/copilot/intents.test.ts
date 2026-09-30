import { describe, expect, it } from "vitest";
import { parseIntent } from "./intents.ts";

// A fixed clock for the "tomorrow noon" cases — otherwise the expected ISO
// date would drift with whatever day the suite happens to run on.
const NOW = new Date("2026-09-28T10:00:00.000Z").getTime();

describe("parseIntent — layer show/hide", () => {
  it.each([
    ["show satellites", "satellites"],
    ["show stars", "stars"],
    ["enable wind", "wind"],
    ["turn on aircraft", "aircraft"],
    ["display presence", "presence"],
    ["satellites on", "satellites"],
  ])("%s -> setLayer %s on", (text, id) => {
    expect(parseIntent(text)).toEqual([{ type: "setLayer", id, on: true }]);
  });

  it.each([
    ["hide satellites", "satellites"],
    ["disable wind", "wind"],
    ["turn off aircraft", "aircraft"],
    ["pulses off", "pulses"],
  ])("%s -> setLayer %s off", (text, id) => {
    expect(parseIntent(text)).toEqual([{ type: "setLayer", id, on: false }]);
  });
});

describe("parseIntent — night lights only", () => {
  it("turns off every layer and switches to imagery", () => {
    const actions = parseIntent("night lights only");
    expect(actions?.[0]).toEqual({ type: "setStyle", style: "imagery" });
    expect(actions?.slice(1)).toEqual(
      expect.arrayContaining([{ type: "setLayer", id: "satellites", on: false }, { type: "setLayer", id: "hazards", on: false }]),
    );
    expect(actions?.every((a) => a.type === "setLayer" || a.type === "setStyle")).toBe(true);
  });
});

describe("parseIntent — style", () => {
  it.each([
    ["switch to dots", "dots"],
    ["use imagery", "imagery"],
    ["dots", "dots"],
    ["satellite imagery", "imagery"],
  ])("%s -> setStyle %s", (text, style) => {
    expect(parseIntent(text)).toEqual([{ type: "setStyle", style }]);
  });
});

describe("parseIntent — views", () => {
  it.each([
    ["orbit", "orbit"],
    ["ground view", "ground"],
    ["look up", "ground"],
    ["street view", "street"],
  ])("%s -> setView %s", (text, view) => {
    expect(parseIntent(text)).toEqual([{ type: "setView", view }]);
  });
});

describe("parseIntent — follow", () => {
  it.each(["follow the iss", "follow iss", "track the space station", "FOLLOW THE ISS"])("%s -> follow sat:25544", (text) => {
    expect(parseIntent(text)).toEqual([{ type: "follow", entityId: "sat:25544" }]);
  });
});

describe("parseIntent — time: tomorrow", () => {
  it('"tomorrow noon" sets noon tomorrow', () => {
    const actions = parseIntent("tomorrow noon", NOW);
    expect(actions).toHaveLength(1);
    const action = actions![0];
    expect(action.type).toBe("setTime");
    if (action.type === "setTime" && "isoDate" in action) {
      const d = new Date(action.isoDate);
      expect(d.getUTCDate()).toBe(new Date(NOW).getUTCDate() + 1);
      expect(d.getHours()).toBe(12);
    } else {
      throw new Error("expected an isoDate setTime action");
    }
  });

  it('"tomorrow at 3pm" sets 15:00 tomorrow', () => {
    const actions = parseIntent("tomorrow at 3pm", NOW);
    const action = actions![0];
    if (action.type === "setTime" && "isoDate" in action) {
      expect(new Date(action.isoDate).getHours()).toBe(15);
    } else {
      throw new Error("expected an isoDate setTime action");
    }
  });
});

describe("parseIntent — time: relative shifts", () => {
  it.each([
    ["back 6 hours", -360],
    ["go back 6 hours", -360],
    ["forward 2 days", 2 * 1440],
    ["go forward 30 minutes", 30],
    ["+2h", 120],
    ["-30m", -30],
    ["+1d", 1440],
  ])("%s -> offsetMin %d", (text, offsetMin) => {
    expect(parseIntent(text)).toEqual([{ type: "setTime", offsetMin }]);
  });

  it.each(["now", "back to now", "reset time", "current time"])("%s -> offsetMin 0", (text) => {
    expect(parseIntent(text)).toEqual([{ type: "setTime", offsetMin: 0 }]);
  });
});

describe("parseIntent — quake filters", () => {
  it.each([
    ["show quakes above 5", 5, undefined],
    ["quakes above 5", 5, undefined],
    ["earthquakes over 4", 4, undefined],
    ["quakes at least 6.5", 6.5, undefined],
  ])("%s -> quakeMinMag %s", (text, mag) => {
    const actions = parseIntent(text)!;
    expect(actions[0]).toEqual({ type: "setLayer", id: "hazards", on: true });
    expect(actions[1]).toEqual({ type: "filter", quakeMinMag: mag });
  });

  it.each([
    ["quakes this week", 24 * 7],
    ["show quakes in the last 24 hours", 24],
    ["quakes since yesterday", 48],
  ])("%s -> quakeSinceHours", (text, hours) => {
    const actions = parseIntent(text)!;
    expect(actions[1]).toEqual({ type: "filter", quakeSinceHours: hours });
  });

  it('"quakes above 5 this week" combines both', () => {
    const actions = parseIntent("quakes above 5 this week")!;
    expect(actions[1]).toEqual({ type: "filter", quakeMinMag: 5, quakeSinceHours: 24 * 7 });
  });

  it('"show all quakes" clears the magnitude floor', () => {
    expect(parseIntent("show all quakes")).toEqual([
      { type: "setLayer", id: "hazards", on: true },
      { type: "filter", quakeMinMag: -2 },
    ]);
  });
});

describe("parseIntent — fly to a place", () => {
  it.each([
    ["fly to Tokyo", "Tokyo"],
    ["go to Paris", "Paris"],
    ["take me to New York", "New York"],
    ["navigate to Mumbai", "Mumbai"],
    ["zoom in to London", "London"],
    ["show me Berlin", "Berlin"],
  ])("%s -> flyToPlace %s", (text, query) => {
    expect(parseIntent(text)).toEqual([{ type: "flyToPlace", query }]);
  });
});

describe("parseIntent — unrecognised text falls through to the LLM (returns null)", () => {
  it.each(["what's happening in Japan", "compare today with last Monday", "hello", "", "   "])("%s -> null", (text) => {
    expect(parseIntent(text)).toBeNull();
  });
});
