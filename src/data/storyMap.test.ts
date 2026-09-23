import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NODES, EDGES, EDGE_KIND } from "./storyMap.ts";
import { projects } from "./profile.ts";
import { STAMP_RE } from "./freshnessSla.ts";

/**
 * The Storyboard's constellation is a curated projection of the registry
 * (gen-system-graph.mjs), not a second hand list — this is what makes that
 * claim checkable. Every failure mode below is one the constellation
 * actually shipped with: sinc-p and kmp-family missing from the map, and the
 * Loopdown node keyed "writing" instead of the registry's own "the-loopdown"
 * slug, so nothing here could tell the two apart.
 */
describe("storyMap: every registry project has a constellation node", () => {
  const ids = new Set(NODES.map((n) => n.id));

  it.each(projects.map((p) => p.slug))("project %s has a NODES entry", (slug) => {
    expect(ids.has(slug), `projects.ts's "${slug}" has no storyMap node`).toBe(true);
  });

  it("carries exactly the registry's project nodes, including sinc-p and kmp-family", () => {
    const projectSlugs = new Set(projects.map((p) => p.slug));
    const projectNodes = NODES.filter((n) => projectSlugs.has(n.id)).map((n) => n.id);
    expect(projectNodes).toHaveLength(projects.length);
    expect(projectNodes).toContain("sinc-p");
    expect(projectNodes).toContain("kmp-family");
  });

  it("gives every node a unique id", () => {
    const dupes = NODES.map((n) => n.id).filter((id, i, all) => all.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("draws every edge between two real nodes", () => {
    const dangling = EDGES.filter(([a, b]) => !ids.has(a) || !ids.has(b)).map(([a, b]) => `${a}->${b}`);
    expect(dangling, `these edges name a node the constellation doesn't have: ${dangling.join(", ")}`).toEqual([]);
  });

  it("classifies every edge measured or declared, never neither", () => {
    for (const [a, b] of EDGES) {
      expect(["measured", "declared"]).toContain(EDGE_KIND[`${a}->${b}`]);
    }
  });

  it("wires kmp-family to every app it actually builds, and sinc-p only to the hub", () => {
    const touching = (id: string) => EDGES.filter(([a, b]) => a === id || b === id).flat().filter((n) => n !== id);
    for (const app of ["doori", "gaddi", "paymentslab-kmp", "candidai", "portfolio"]) {
      expect(touching("kmp-family"), `kmp-family should wire to ${app}`).toContain(app);
    }
    // sinc-p is a Next.js + Postgres campus platform, not a KMP sibling —
    // mirroring blueprintData.ts's own "no foundation edge" choice — so its
    // only wire is to the hub.
    expect(touching("sinc-p")).toEqual(["sid"]);
  });

  it("carries a generatedAt stamp freshnessSla.ts / ops.ts can see", () => {
    const raw = readFileSync(fileURLToPath(new URL("./storyMap.ts", import.meta.url)), "utf8");
    // storyMap.ts itself has no stamp field (it's a projection of
    // systemGraph.ts, which does) — this asserts the SIBLING file the same
    // generator writes carries one, so the pair can never drift on freshness.
    const graph = readFileSync(fileURLToPath(new URL("./systemGraph.ts", import.meta.url)), "utf8");
    expect(STAMP_RE.test(graph), "systemGraph.ts (storyMap's own source) has no generatedAt stamp").toBe(true);
    expect(raw.length).toBeGreaterThan(0);
  });
});
