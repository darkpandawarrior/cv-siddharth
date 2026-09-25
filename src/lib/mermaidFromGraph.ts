// The kmp-family Mermaid diagram, generated from kmpGraph.ts instead of
// hand-typed in projects.ts. Adding module 44 to kmp-toolkit (kmpGraph.ts's
// next regen) adds one line here with no edit — see idea-atlas.md#I2.
import type { KmpGraph } from "../data/kmpGraph.ts";

const slug = (id: string): string => id.replace(/[^a-zA-Z0-9_]/g, "_");

/** Pure and deterministic: same graph in, same Mermaid source out — no
 *  wall-clock, no random ordering (kmpGraph.ts's own arrays are already in a
 *  stable, generator-determined order). */
export function mermaidFromGraph(graph: KmpGraph): string {
  const labelOf = Object.fromEntries(graph.consumers.map((c) => [c.id, c.label]));
  const consumerNode = (id: string): string => `${slug(id)}["${labelOf[id] ?? id}"]`;

  const lines = ["graph LR"];

  // Repo-level spine: kmp-build-logic and kmp-toolkit into every consumer,
  // including the portfolio twin — the "kmp-toolkit -.->|includeBuild| cv"
  // and "bl -> cv" lines idea-atlas.md#REC-1 calls out by name.
  for (const edge of graph.dependencySpine) {
    lines.push(`  ${slug(edge.from)} -.->|"includeBuild"| ${consumerNode(edge.to)}`);
  }

  // One node per toolkit module, whether adopted yet or not — the "no
  // consumer yet" niches REC-1 wants are just modules with an empty usedBy.
  for (const mod of graph.modules) {
    const label = mod.usedBy.length ? mod.usedBy.map((u) => labelOf[u.app] ?? u.app).join(", ") : "no consumer yet";
    lines.push(`  m_${slug(mod.id)}["${mod.id} · ${label}"]`);
  }

  return lines.join("\n");
}
