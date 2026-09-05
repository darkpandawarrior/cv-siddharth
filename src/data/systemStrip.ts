// Reads systemGraph.ts into the "In the system" strip: built on · feeds ·
// ships to · written up in. One function so ProjectDetail.tsx and the
// homepage project cards can't drift on what each of those four words means.
import { systemGraph, type SystemEdgeKind } from "./systemGraph.ts";

export type SystemStripItem = { id: string; label: string; url?: string };
export type SystemStripGroup = { kind: "built-on" | "feeds" | "ships-to" | "written-up-in"; label: string; items: SystemStripItem[] };

const byId = new Map(systemGraph.nodes.map((n) => [n.id, n]));

const GROUPS: { edgeKind: SystemEdgeKind; kind: SystemStripGroup["kind"]; label: string }[] = [
  // "this project is built on" — its includeBuild dependencies.
  { edgeKind: "includeBuild", kind: "built-on", label: "built on" },
  // "this project feeds" — code extracted upward out of it.
  { edgeKind: "extracted-from", kind: "feeds", label: "feeds" },
  { edgeKind: "ships", kind: "ships-to", label: "ships to" },
  { edgeKind: "born-from", kind: "written-up-in", label: "written up in" },
];

/** Every non-empty "In the system" group for a project or employer slug, read
 *  straight from the graph — nothing here is hand-typed per project. */
export function systemStripFor(slug: string): SystemStripGroup[] {
  const groups: (SystemStripGroup | null)[] = GROUPS.map(({ edgeKind, kind, label }) => {
    const items: SystemStripItem[] = systemGraph.edges
      .filter((e) => e.kind === edgeKind && e.from === slug)
      .map((e) => ({ id: e.to, label: byId.get(e.to)?.label ?? e.to, url: e.url }));
    return items.length ? { kind, label, items } : null;
  });
  return groups.filter((g): g is SystemStripGroup => g !== null);
}
