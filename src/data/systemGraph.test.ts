import { describe, expect, it } from "vitest";
import { systemGraph } from "./systemGraph.ts";
import { RELATED_SERIES } from "./connections.ts";
import { projects, caseStudies } from "./profile.ts";
import { writing } from "./writing.ts";
import { STAMP_RE } from "./freshnessSla.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ids = new Set(systemGraph.nodes.map((n) => n.id));
const byId = new Map(systemGraph.nodes.map((n) => [n.id, n]));

describe("systemGraph: the registry every repo/employer/series/surface/channel connects through", () => {
  it.each(projects.map((p) => p.slug))("every project slug (%s) is a node", (slug) => {
    expect(ids.has(slug), `profile.ts's project "${slug}" has no systemGraph node`).toBe(true);
  });

  it("every RELATED_SERIES key resolves to a project, a case study, or the employer", () => {
    const projectSlugs = new Set(projects.map((p) => p.slug));
    const caseStudySlugs = new Set(caseStudies.map((c) => c.slug));
    for (const key of Object.keys(RELATED_SERIES)) {
      const resolves = projectSlugs.has(key) || caseStudySlugs.has(key);
      expect(resolves, `RELATED_SERIES["${key}"] names neither a project nor a case study`).toBe(true);
      const from = projectSlugs.has(key) ? key : "dice";
      expect(ids.has(from), `RELATED_SERIES["${key}"] resolves to "${from}", which has no systemGraph node`).toBe(true);
    }
  });

  it("names every series RELATED_SERIES points at as a systemGraph node", () => {
    const seriesInGraph = new Set(writing.series.map((s) => s.id));
    for (const seriesIds of Object.values(RELATED_SERIES)) {
      for (const sid of seriesIds) expect(ids.has(sid) && seriesInGraph.has(sid)).toBe(true);
    }
  });

  it("has no dead ends — every node touches at least one edge", () => {
    const touched = new Set<string>();
    for (const e of systemGraph.edges) { touched.add(e.from); touched.add(e.to); }
    const deadEnds = [...ids].filter((id) => !touched.has(id));
    expect(deadEnds, `these systemGraph nodes carry zero edges: ${deadEnds.join(", ")}`).toEqual([]);
  });

  it("every includeBuild edge names a repo node on both ends", () => {
    const includeBuildEdges = systemGraph.edges.filter((e) => e.kind === "includeBuild");
    for (const e of includeBuildEdges) {
      expect(byId.get(e.from)?.kind, `includeBuild edge ${e.from}->${e.to}: "${e.from}" is not a repo node`).toBe("repo");
      expect(byId.get(e.to)?.kind, `includeBuild edge ${e.from}->${e.to}: "${e.to}" is not a repo node`).toBe("repo");
    }
  });

  it("every edge names two nodes that actually exist", () => {
    for (const e of systemGraph.edges) {
      expect(ids.has(e.from), `edge ${e.kind} names "${e.from}", which has no node`).toBe(true);
      expect(ids.has(e.to), `edge ${e.kind} names "${e.to}", which has no node`).toBe(true);
    }
  });

  it("only ever tags an edge measured or declared", () => {
    for (const e of systemGraph.edges) expect(["measured", "declared"]).toContain(e.evidence);
  });

  it("carries a generatedAt stamp freshnessSla.ts / ops.ts can see", () => {
    const raw = readFileSync(fileURLToPath(new URL("./systemGraph.ts", import.meta.url)), "utf8");
    expect(STAMP_RE.test(raw)).toBe(true);
  });
});
