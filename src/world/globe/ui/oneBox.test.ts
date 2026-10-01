import { describe, expect, test } from "vitest";
import { describeAction, describeActions, buildUndo, EXAMPLE_CHIPS } from "./oneBox.ts";
import type { GlobeAction } from "../copilot/actions.ts";
import { LAYER_IDS, type LayerId } from "../globeStore.ts";

const allLayersOff = Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<LayerId, boolean>;

describe("describeAction / describeActions", () => {
  test("covers every action kind with human text, no em dash", () => {
    const samples: GlobeAction[] = [
      { type: "flyTo", lat: 12.3, lon: 45.6 },
      { type: "flyToPlace", query: "Tokyo" },
      { type: "follow", entityId: "sat:25544" },
      { type: "setLayer", id: "hazards", on: true },
      { type: "setStyle", style: "imagery" },
      { type: "setTime", offsetMin: 0 },
      { type: "setTime", offsetMin: -120 },
      { type: "setTime", isoDate: "2026-09-27T00:00:00.000Z" },
      { type: "select", kind: "quake", id: "q1" },
      { type: "filter", quakeMinMag: 5 },
      { type: "setView", view: "orbit" },
      { type: "narrate", text: "hello" },
    ];
    for (const action of samples) {
      const line = describeAction(action);
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain("—"); // no em dash in visitor-facing copy
    }
  });

  test("joins multiple actions and falls back to a generic label for an empty list", () => {
    expect(describeActions([{ type: "setLayer", id: "hazards", on: true }, { type: "filter", quakeMinMag: 5 }])).toBe("show hazards; quakes at least 5");
    expect(describeActions([])).toBe("run command");
  });
});

describe("buildUndo", () => {
  test("restores the layer's PRE-run value, not just the opposite of the new one", () => {
    const before = { layers: { ...allLayersOff, hazards: true }, timeOffsetMin: 0 };
    // The action turns hazards on; the store was already on, so undo must
    // put it back to on too (a plain flip would wrongly turn it off).
    const undo = buildUndo([{ type: "setLayer", id: "hazards", on: true }], before);
    expect(undo).toEqual([{ type: "setLayer", id: "hazards", on: true }]);
  });

  test("restores the pre-run time offset", () => {
    const before = { layers: allLayersOff, timeOffsetMin: -60 };
    const undo = buildUndo([{ type: "setTime", offsetMin: 120 }], before);
    expect(undo).toEqual([{ type: "setTime", offsetMin: -60 }]);
  });

  test("dedupes repeated targets and drops non-cheap actions", () => {
    const before = { layers: { ...allLayersOff, markers: true }, timeOffsetMin: 0 };
    const undo = buildUndo(
      [
        { type: "flyToPlace", query: "Pune" },
        { type: "setLayer", id: "markers", on: false },
        { type: "setLayer", id: "markers", on: true },
      ],
      before,
    );
    expect(undo).toEqual([{ type: "setLayer", id: "markers", on: true }]);
  });

  test("no cheap actions in the list yields no undo", () => {
    expect(buildUndo([{ type: "flyToPlace", query: "Pune" }], { layers: allLayersOff, timeOffsetMin: 0 })).toEqual([]);
  });
});

test("EXAMPLE_CHIPS has exactly three real phrases", () => {
  expect(EXAMPLE_CHIPS).toHaveLength(3);
  for (const chip of EXAMPLE_CHIPS) expect(chip.length).toBeGreaterThan(0);
});
