import { describe, it, expect } from "vitest";
import { NODES, ARROWS, METRICS } from "./blueprintData.ts";
import { projects, metrics } from "./data/profile.ts";
import { writing } from "./data/writing.ts";

/**
 * The Blueprint Room draws a map of the work and pins a note on it saying
 * "Every arrow is real". This test is what makes that claim checkable.
 *
 * Every failure mode below is one the canvas actually shipped with: three of
 * eight writing series on the map, `portfolio` missing entirely, the four
 * headline numbers hand-copied out of profile.ts, and three duplicate metric
 * tiles parked beside the animated ones.
 */
describe("the blueprint maps what actually exists", () => {
  const keys = new Set(NODES.map((n) => n.key));

  it("has a node for every project in the registry", () => {
    const missing = projects.map((p) => p.slug).filter((s) => !keys.has(s));
    expect(missing, `projects absent from the map: ${missing.join(", ")}`).toEqual([]);
  });

  it("has a node for every writing series", () => {
    const missing = writing.series.map((s) => `series-${s.id}`).filter((k) => !keys.has(k));
    expect(missing, `series absent from the map: ${missing.join(", ")}`).toEqual([]);
  });

  it("draws every arrow — no endpoint that silently resolves to nothing", () => {
    // Blueprint3D renders `null` for an arrow whose endpoints it cannot find,
    // so a bad key here deletes a relationship with no error at runtime.
    const dangling = ARROWS.filter(([a, b]) => !keys.has(a) || !keys.has(b))
      .map(([a, b]) => `${a} → ${b}`);
    expect(dangling, `these arrows point at nodes that do not exist: ${dangling.join(", ")}`).toEqual([]);
  });

  it("carries the same four numbers the homepage does", () => {
    expect(METRICS).toHaveLength(metrics.length);
    expect(METRICS.map((m) => m.value)).toEqual(metrics.map((m) => m.value));
  });

  it("says each number once — no tile duplicating a metric tile", () => {
    const metricValues = METRICS.map((m) => m.value);
    const echoes = NODES.filter((n) => metricValues.some((v) => n.label.includes(v)))
      .map((n) => n.key);
    expect(echoes, `these nodes repeat a metric tile: ${echoes.join(", ")}`).toEqual([]);
  });

  it("gives every node a unique key", () => {
    const dupes = NODES.map((n) => n.key).filter((k, i, a) => a.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it("keeps node labels short enough to render inside their shape", () => {
    // Measured against each node's OWN width — roughly 9px per character in
    // the 3D scene's mono face — not a flat number, because the shapes range
    // from 220 to 280px. Labels that ran past their box were rendering as
    // "Active · 24 PRs merged to pub…", and an ellipsis is not a fact, so a
    // long clause is now dropped rather than cut.
    const tooLong = NODES.flatMap((n) => {
      const budget = Math.floor((n.w ?? 220) / 9);
      return n.label
        .split("\n")
        .filter((line) => line.length > budget)
        .map((line) => `${n.key} (${budget} chars): "${line}"`);
    });
    expect(tooLong, `these labels will overflow their node: ${tooLong.join(", ")}`).toEqual([]);
  });
});
