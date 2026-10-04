import { afterEach, describe, expect, it } from "vitest";
import { ledger } from "./ledger.ts";
import { GRAMMAR } from "./grammar.ts";
import { landmarkPositions } from "./landmarkPositions.ts";
import { landOf } from "./worldModel.ts";
import { DEFAULT_TOUR, estimatedDurationS, getTourStop, setTourStop, subscribeTour, tourStops, tourTransition } from "./tour.ts";

afterEach(() => setTourStop(null));

describe("one guided tour", () => {
  it("keeps the declared order and estimates dwell plus transitions within 90 to 240 seconds", () => {
    const stops = tourStops(ledger);
    expect(stops.map(({ id }) => id)).toEqual(["bridge", "doori", "paymentslab-kmp", "deepmal-niche", "pr-stone", "portfolio", "stutter"]);
    expect(stops).toHaveLength(DEFAULT_TOUR.length);
    expect(estimatedDurationS(stops)).toBeGreaterThanOrEqual(90);
    expect(estimatedDurationS(stops)).toBeLessThanOrEqual(240);
    expect(estimatedDurationS(stops)).toBe(stops.reduce((total, stop) => total + stop.dwellS + stop.transitionS, 0));
    expect(estimatedDurationS([])).toBe(0);
  });

  it("uses existing captions, positions and legal boat moorings", async () => {
    const { mooredStateAt } = await import("./Hodi.tsx");
    const features = landOf(ledger);
    const positions = landmarkPositions();
    for (const stop of tourStops(ledger)) {
      if (stop.kind === "grammar") {
        const rule = GRAMMAR.find((rule) => rule.id === stop.id)!;
        const row = rule.ledgerRow(rule.source(ledger), ledger);
        expect(stop.label).toBe(row.label);
        expect(stop.sourceFile).toBe(row.sourceFile);
        expect(stop.position).toEqual(features.find((feature) => feature.rule === stop.id)!.pos);
      } else {
        expect(stop.position).toEqual(positions[stop.id]);
        const facet = features.find((feature) => feature.id.startsWith(`landmark-facet:${stop.id}:`));
        expect(stop.label).toBe(facet?.label ?? ledger.systemGraph.nodes.find((node) => node.id === stop.id)!.label);
      }
      expect(stop.position.every(Number.isFinite)).toBe(true);
      const mooring = mooredStateAt({ x: stop.position[0], z: stop.position[2] });
      expect([mooring.x, mooring.z, mooring.heading].every(Number.isFinite)).toBe(true);
      expect(mooring.speed).toBe(0);
      expect(mooring.autopilot).toBe(false);
    }
  });

  it("drops missing targets rather than inventing a place or caption", () => {
    expect(tourStops(ledger, [{ kind: "landmark", id: "unknown" }, { kind: "grammar", id: "unknown" }])).toEqual([]);
  });

  it("pauses, resumes, bounds steps and stops at the end", () => {
    const start = tourTransition({ index: null, playing: false }, "start", 7, false);
    expect(start).toEqual({ index: 0, playing: true });
    const paused = tourTransition(start, "toggle", 7, false);
    expect(tourTransition(paused, "tick", 7, false)).toBe(paused);
    expect(tourTransition(paused, "toggle", 7, false)).toEqual(start);
    expect(tourTransition(start, "previous", 7, false).index).toBe(0);
    expect(tourTransition(start, "tick", 7, false).index).toBe(1);
    expect(tourTransition({ index: 5, playing: true }, "next", 7, false)).toEqual({ index: 6, playing: false });
    expect(tourTransition({ index: 5, playing: true }, "tick", 7, false)).toEqual({ index: 6, playing: true });
    expect(tourTransition({ index: 6, playing: true }, "tick", 7, false)).toEqual({ index: 6, playing: false });
    expect(tourTransition({ index: 6, playing: false }, "next", 7, false)).toEqual({ index: 6, playing: false });
    expect(tourTransition(start, "stop", 7, false)).toEqual({ index: null, playing: false });
    expect(tourTransition(start, "start", 0, false)).toEqual({ index: null, playing: false });
  });

  it("never auto-advances with reduced motion, including a live preference change", () => {
    const state = tourTransition({ index: null, playing: false }, "start", 7, true);
    expect(state).toEqual({ index: 0, playing: false });
    expect(tourTransition(state, "tick", 7, true)).toBe(state);
    expect(tourTransition(state, "toggle", 7, true).playing).toBe(false);
    const next = tourTransition(state, "next", 7, true);
    expect(next).toEqual({ index: 1, playing: false });
    expect(tourTransition(next, "previous", 7, true)).toEqual(state);
    const moving = { index: 0, playing: true };
    expect(tourTransition(moving, "tick", 7, true)).toBe(moving);
  });

  it("publishes camera stops, clears on exit and unsubscribes", () => {
    const stops = tourStops(ledger);
    const seen: unknown[] = [];
    const unsubscribe = subscribeTour(() => seen.push(getTourStop()));
    setTourStop(stops[0]);
    setTourStop(stops[0]);
    setTourStop(stops[1]);
    setTourStop(null);
    unsubscribe();
    setTourStop(stops[2]);
    expect(seen).toEqual([stops[0], stops[1], null]);
  });
});
