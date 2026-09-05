// scripts/gen-system-graph.mjs
/**
 * Emits src/data/systemGraph.ts — one registry of every repo, employer,
 * writing series, distribution channel and "room/corpus" surface, and how
 * they actually connect. Two kinds of edge, and the file never blurs them:
 *
 *   measured — read from a source that can be re-checked: a sibling repo's
 *              settings.gradle.kts (`includeBuild`), a project's own
 *              `deployments`/`targets[].liveUrl` in profile.ts, or the simple
 *              fact that a surface is a route on this domain.
 *   declared — hand-documented elsewhere and merely projected here:
 *              connections.ts's RELATED_SERIES, and the dice → doori →
 *              kmp-toolkit extraction lineage in
 *              AgentHarness/plans/portfolio-extraction/CAPABILITY-GAP-ROADMAP.md.
 *
 * Also derives src/data/storyMap.ts's NODES/EDGES from this graph: the
 * constellation keeps its own curated topology (a force-directed render of
 * the FULL graph — 30+ nodes, most of them infra repos and distribution
 * channels nobody clicks through to — would be unreadable next to the
 * "everything connects" pitch it exists to make), but the x/y layout is
 * computed by BFS layering from "sid" rather than hand-placed, and the
 * project → portfolio `runs-here` edges are pulled from the graph rather than
 * re-declared.
 * // ponytail: the constellation's node/label/color manifest and its
 * // "declared" hub-spoke wiring stay a small hand-curated table (same
 * // shape as RELATED_SERIES — a legibility choice, not a measurement).
 * // Upgrade path if the full graph ever needs its own view: a second,
 * // denser page reusing the same systemGraph.ts rather than growing this one.
 *
 * Sibling-checkout scan (`includeBuild`) follows gen-ops.mjs's contract:
 * absent siblings (CI, a fresh clone, this repo checked out somewhere the
 * relative `../../Android` / `../../KMP` guess doesn't resolve) keep whatever
 * was last committed and the run still exits 0, same as gen-timeline.mjs.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "src", "data");
const graphOut = join(dataDir, "systemGraph.ts");
const storyOut = join(dataDir, "storyMap.ts");

const { projects } = await import(join(dataDir, "profile.ts"));
const { RELATED_SERIES } = await import(join(dataDir, "connections.ts"));
const { writing } = await import(join(dataDir, "writing.ts"));
const { surfaces } = await import(join(dataDir, "surfaces.ts"));
const { BOOKS_BEFORE_BROS, SERIES_PROJECT } = await import(join(dataDir, "writingMeta.ts"));

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ── Nodes ─────────────────────────────────────────────────────────────── */

// Repos this site's own generated data (profile.ts) never mentions, but which
// the rest of the system (the ops leverage board, AgentHarness's own memory)
// already treats as real repos: the two convention/library repos every KMP
// app vendors, the template a new one starts from, and the two repos that
// build and run this whole multi-repo setup rather than shipping a product.
const INFRA_REPOS = ["kmp-build-logic", "kmp-toolkit", "kmp-app-template", "career-ops", "agent-harness"];

const repoNodes = [
  ...projects.map((p) => ({ id: p.slug, kind: "repo", label: p.name ?? p.slug })),
  ...INFRA_REPOS.map((id) => ({ id, kind: "repo", label: id })),
];
const repoIds = new Set(repoNodes.map((n) => n.id));

const employerNodes = [{ id: "dice", kind: "employer", label: "Dice.tech" }];

const seriesNodes = writing.series.map((s) => ({ id: s.id, kind: "series", label: s.title }));

// "room or corpus": a full-screen instrument (kind === "room") or a long
// record read as evidence (group === "corpus") — the two surface flavours a
// visitor experiences as a destination in its own right, as opposed to an
// ordinary scroll section of the homepage.
const surfaceNodes = surfaces
  .filter((s) => s.kind === "room" || s.group === "corpus")
  .map((s) => ({ id: s.to, kind: "surface", label: s.label }));

const channels = [...new Set(projects.flatMap((p) => (p.deployments ?? []).map((d) => d.channel)))].sort();
const channelNodes = channels.map((c) => ({ id: `channel:${slugify(c)}`, kind: "channel", label: c }));

const nodes = [...repoNodes, ...employerNodes, ...seriesNodes, ...surfaceNodes, ...channelNodes];

/* ── Edges ─────────────────────────────────────────────────────────────── */

const edges = [];
const add = (from, to, kind, evidence, detail, url) => edges.push({ from, to, kind, evidence, detail, url });

// born-from (declared): connections.RELATED_SERIES, project → series. A key
// that names a Dice case study rather than one of this site's own projects
// (crash-reduction, gps-accuracy, compose-migration — connections.test.ts
// already pins RELATED_SERIES to only ever be keyed by a project or a case
// study) rolls up to the employer: that work happened at Dice, not in a repo
// this site can point at.
const projectSlugs = new Set(projects.map((p) => p.slug));
for (const [key, seriesIds] of Object.entries(RELATED_SERIES)) {
  const from = projectSlugs.has(key) ? key : "dice";
  for (const sid of seriesIds) add(from, sid, "born-from", "declared", SERIES_PROJECT[sid]?.label, `/loopdown#series-${sid}`);
}

// ships (measured): profile.ts deployments, project → distribution channel.
for (const p of projects) {
  for (const d of p.deployments ?? []) {
    add(p.slug, `channel:${slugify(d.channel)}`, "ships", "measured", d.detail, d.url);
  }
}

// runs-here (measured): any targets[].liveUrl hosted on this domain (a
// relative path), project → portfolio. Guarded against portfolio's own
// liveUrl, which would otherwise draw an edge to itself.
for (const p of projects) {
  if (p.slug === "portfolio") continue;
  for (const t of p.targets ?? []) {
    if (t.liveUrl?.startsWith("/")) add(p.slug, "portfolio", "runs-here", "measured", t.liveUrl);
  }
}
// Every room/corpus surface is, definitionally, a route on this same domain —
// the measured half of "runs-here" extended to the surfaces, which is also
// what keeps a surface node from being a dead end.
for (const s of surfaceNodes) add(s.id, "portfolio", "runs-here", "measured", "site route");

// extracted-from (declared): the roadmap this site does not re-derive, only
// cites — AgentHarness/plans/portfolio-extraction/CAPABILITY-GAP-ROADMAP.md.
const ROADMAP = "AgentHarness/plans/portfolio-extraction/CAPABILITY-GAP-ROADMAP.md";
add("dice", "doori", "extracted-from", "declared", ROADMAP);
add("doori", "kmp-toolkit", "extracted-from", "declared", ROADMAP);

// operates (declared): agent-harness runs every repo here, including itself
// excluded, per AgentHarness's own reference_all_repos memory.
for (const id of repoIds) if (id !== "agent-harness") add("agent-harness", id, "operates", "declared", "AgentHarness reference_all_repos.md");

// includeBuild (measured): parsed from each sibling repo's settings.gradle.kts,
// same local-sibling pattern gen-ops.mjs uses for the leverage board. Absent
// siblings keep the last committed includeBuild edges and exit 0.
const ANDROID = join(root, "..", "..", "Android");
const KMP = join(root, "..", "..", "KMP");
const CANDIDATE_DIRS = {
  doori: [join(ANDROID, "Doori"), join(ANDROID, "Mileway")],
  gaddi: [join(ANDROID, "Gaddi"), join(ANDROID, "Kursi")],
  "paymentslab-kmp": [join(ANDROID, "PaymentsLab-KMP"), join(ANDROID, "PaymentsLab")],
  candidai: [join(ANDROID, "Candidai"), join(ANDROID, "HireSignal")],
  "kmp-toolkit": [join(KMP, "kmp-toolkit")],
  "kmp-app-template": [join(KMP, "kmp-app-template")],
};
// The only basenames an includeBuild(...) argument can resolve to that this
// graph also has a node for — "build-logic" (a repo's OWN convention plugins)
// is deliberately unmatched, the same exclusion gen-ops.mjs's VENDORED set
// makes for the same reason: it declares the ids, it does not consume them.
const REPO_BASENAMES = new Set(["kmp-build-logic", "kmp-toolkit", "kmp-app-template"]);

function scanIncludeBuild(dir) {
  const settingsPath = join(dir, "settings.gradle.kts");
  if (!existsSync(settingsPath)) return [];
  const text = readFileSync(settingsPath, "utf8");
  const deps = new Set();
  for (const m of text.matchAll(/includeBuild\(\s*"([^"]+)"/g)) {
    const dep = basename(m[1]);
    if (REPO_BASENAMES.has(dep)) deps.add(dep);
  }
  return [...deps];
}

let anySiblingFound = false;
const scannedIncludeBuild = [];
for (const [consumer, dirs] of Object.entries(CANDIDATE_DIRS)) {
  const dir = dirs.find(existsSync);
  if (!dir) continue;
  anySiblingFound = true;
  for (const dep of scanIncludeBuild(dir)) if (dep !== consumer) scannedIncludeBuild.push([consumer, dep]);
}

let includeBuildPairs = anySiblingFound ? scannedIncludeBuild : null;
if (!includeBuildPairs && existsSync(graphOut)) {
  const prev = readFileSync(graphOut, "utf8");
  const m = /export const includeBuildPairs = (\[[\s\S]*?\]) as const;/.exec(prev);
  if (m) includeBuildPairs = JSON.parse(m[1]);
}
if (!includeBuildPairs) includeBuildPairs = [];
for (const [from, to] of includeBuildPairs) add(from, to, "includeBuild", "measured", `${from}/settings.gradle.kts`);

/* ── Emit systemGraph.ts ──────────────────────────────────────────────── */

const generatedAt = new Date().toISOString().slice(0, 10);

const graphBanner =
  "// AUTO-GENERATED by scripts/gen-system-graph.mjs — do not edit by hand.\n" +
  "// Every repo, employer, writing series, distribution channel and room/corpus\n" +
  "// surface on this site, and how they measurably or declaredly connect. See the\n" +
  "// generator for what each edge kind means and where it comes from.\n" +
  "// Run `npm run gen:system-graph` to refresh.\n";

writeFileSync(
  graphOut,
  graphBanner +
    `export type SystemNodeKind = "repo" | "employer" | "series" | "surface" | "channel";\n` +
    `export interface SystemNode { id: string; kind: SystemNodeKind; label: string }\n\n` +
    `export type SystemEdgeKind = "includeBuild" | "born-from" | "ships" | "runs-here" | "extracted-from" | "operates";\n` +
    `export type SystemEdgeEvidence = "measured" | "declared";\n` +
    `export interface SystemEdge { from: string; to: string; kind: SystemEdgeKind; evidence: SystemEdgeEvidence; detail?: string; url?: string }\n\n` +
    `export interface SystemGraph { generatedAt: string; nodes: SystemNode[]; edges: SystemEdge[] }\n\n` +
    `export const systemGraph: SystemGraph = ${JSON.stringify({ generatedAt, nodes, edges }, null, 2)};\n\n` +
    `// The sibling-scanned half of \`includeBuild\`, kept separate so a run with no\n` +
    `// sibling checkouts on disk can fall back to what was last committed here\n` +
    `// instead of shipping an empty scan as if it were a measured zero.\n` +
    `export const includeBuildPairs = ${JSON.stringify(includeBuildPairs)} as const;\n`,
);

/* ── Reader: the "In the system" strip ───────────────────────────────────
 * Kept here (not just in the generator) so ProjectDetail.tsx and the
 * homepage cards read one function instead of re-deriving the same four
 * groups from raw edges twice.
 */
console.log(
  `[gen-system-graph] ${nodes.length} nodes, ${edges.length} edges` +
    (anySiblingFound ? "" : " (kept committed includeBuild edges — sibling repos not found)"),
);

/* ── storyMap.ts: a curated projection, with computed layout ─────────── */

const GREEN = "#3ddc84";
const CYAN = "#5ee6ff";
const PURPLE = "#8f74ff";
const ORANGE = "#f0883e";

// Declared: hand-curated, same footing as RELATED_SERIES — which of everything
// on this site earns a place on the storyboard, and how big/what colour it
// reads as. `sid` is the hub every layer is measured from.
const STORY_MANIFEST = [
  { id: "sid", label: "SID", sub: "prototype → platform", r: 26, color: GREEN, target: "#top" },
  { id: "work", label: "Case studies", sub: "the numbers", r: 15, color: GREEN, target: "#work" },
  { id: "doori", label: "Doori", sub: "5 platforms", r: 14, color: GREEN, target: "#project/doori" },
  { id: "gaddi", label: "Gaddi", sub: "live web build", r: 12, color: GREEN, target: "#project/gaddi" },
  { id: "paymentslab-kmp", label: "PaymentsLab-KMP", sub: "gateway lab", r: 12, color: GREEN, target: "#project/paymentslab-kmp" },
  { id: "candidai", label: "Candidai", sub: "25-module KMP", r: 12, color: GREEN, target: "#project/candidai" },
  { id: "stutter", label: "STUTTER", sub: "time-loop game", r: 12, color: GREEN, target: "#project/stutter" },
  { id: "portfolio", label: "Portfolio", sub: "this build, twice", r: 12, color: GREEN, target: "#project/portfolio" },
  { id: "experience", label: "Experience", r: 11, color: CYAN, target: "#experience" },
  { id: "skills", label: "Skills", r: 11, color: CYAN, target: "#skills" },
  { id: "writing", label: "The Loopdown", sub: "field notes", r: 15, color: PURPLE, target: "#loopdown" },
  { id: "books", label: "Books Before Bros", sub: "the origin blog", r: 13, color: ORANGE, target: BOOKS_BEFORE_BROS.url },
  { id: "chat", label: "Ask my AI", sub: "knows all of this", r: 13, color: CYAN, target: "chat" },
  { id: "blueprint", label: "Blueprint Room", sub: "infinite canvas", r: 12, color: ORANGE, target: "#blueprint" },
];

// Declared wiring: hub feeds everything; the work feeds the writing; the
// writing descends from the blog; the AI has read the lot.
const DECLARED_WIRES = [
  ["sid", "work"], ["sid", "doori"], ["sid", "gaddi"], ["sid", "paymentslab-kmp"],
  ["sid", "candidai"], ["sid", "stutter"], ["sid", "portfolio"],
  ["sid", "experience"], ["sid", "skills"], ["sid", "writing"], ["sid", "chat"],
  ["doori", "writing"], ["work", "writing"], ["books", "writing"],
  ["doori", "gaddi"], ["gaddi", "paymentslab-kmp"], ["paymentslab-kmp", "candidai"], ["candidai", "stutter"],
  ["chat", "writing"], ["chat", "work"],
  ["sid", "blueprint"],
];

// Measured wiring: pulled straight from the graph's own `runs-here` edges,
// restricted to the projects the constellation already draws — real proof
// that a project ships live on this exact site, not editorial wiring.
const storyIds = new Set(STORY_MANIFEST.map((n) => n.id));
const MEASURED_WIRES = edges
  .filter((e) => e.kind === "runs-here" && e.to === "portfolio" && storyIds.has(e.from) && e.from !== "portfolio")
  .map((e) => [e.from, "portfolio"]);

const seenWire = new Set();
const STORY_EDGES = [];
const EDGE_KIND = {};
for (const [a, b] of [...DECLARED_WIRES, ...MEASURED_WIRES]) {
  const key = `${a}->${b}`;
  if (seenWire.has(key)) continue;
  seenWire.add(key);
  STORY_EDGES.push([a, b]);
  EDGE_KIND[key] = MEASURED_WIRES.some(([x, y]) => x === a && y === b) ? "measured" : "declared";
}

// Layout: BFS layers from "sid" (a longest-path layering — every node's layer
// is the length of the shortest chain of declared/measured wiring back to the
// hub), computed, never hand-placed. Layer 1 spreads evenly by angle around
// the hub; every layer after inherits its angle from wherever its own
// already-placed neighbours landed, so a chain reads as radiating outward
// instead of doubling back across the hub.
const adjacency = new Map(STORY_MANIFEST.map((n) => [n.id, new Set()]));
for (const [a, b] of STORY_EDGES) { adjacency.get(a)?.add(b); adjacency.get(b)?.add(a); }

const layer = new Map([["sid", 0]]);
{
  const queue = ["sid"];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adjacency.get(cur) ?? []) {
      if (layer.has(next)) continue;
      layer.set(next, layer.get(cur) + 1);
      queue.push(next);
    }
  }
}

const CENTER = { x: 0.5, y: 0.46 };
const pos = new Map([["sid", { ...CENTER }]]);
const maxLayer = Math.max(...layer.values());
const round = (n) => Math.round(n * 10000) / 10000;
for (let L = 1; L <= maxLayer; L++) {
  const idsInLayer = STORY_MANIFEST.map((n) => n.id).filter((id) => layer.get(id) === L);
  const rx = 0.26 + (L - 1) * 0.14;
  const ry = 0.22 + (L - 1) * 0.12;
  idsInLayer.forEach((id, i) => {
    const parents = [...(adjacency.get(id) ?? [])].filter((p) => (layer.get(p) ?? Infinity) < L);
    let angle;
    if (parents.length && parents.some((p) => pos.has(p) && p !== "sid")) {
      // Radiate outward along the average direction of already-placed,
      // non-hub neighbours (the hub sits at the centre, so its own direction
      // is undefined and would collapse every first-ring angle to the same
      // spot).
      const placed = parents.filter((p) => pos.has(p) && p !== "sid");
      const avg = placed.reduce((acc, p) => acc + Math.atan2(pos.get(p).y - CENTER.y, pos.get(p).x - CENTER.x), 0) / placed.length;
      angle = avg;
    } else {
      // First ring: no meaningful parent direction, so spread evenly.
      angle = -Math.PI / 2 + (2 * Math.PI * i) / idsInLayer.length;
    }
    const x = round(Math.min(0.9, Math.max(0.1, CENTER.x + rx * Math.cos(angle))));
    const y = round(Math.min(0.84, Math.max(0.12, CENTER.y + ry * Math.sin(angle))));
    pos.set(id, { x, y });
  });
}

const storyNodes = STORY_MANIFEST.map((n) => ({ ...n, ...pos.get(n.id) }));

const storyBanner =
  "// AUTO-GENERATED by scripts/gen-system-graph.mjs — do not edit by hand.\n" +
  "//\n" +
  "// The Storyboard's constellation. NODES' colour/label/target manifest and\n" +
  "// which pairs wire together (EDGES) are curated here in the generator, same\n" +
  "// footing as connections.ts's RELATED_SERIES; x/y is computed by BFS layering\n" +
  "// from \"sid\" rather than hand-placed, so two labels can no longer land on top\n" +
  "// of each other just because someone picked close-together numbers.\n" +
  "//\n" +
  "// EDGE_KIND says which edges are measured (pulled straight from\n" +
  "// systemGraph.ts's own `runs-here` facts) vs declared (editorial wiring) —\n" +
  "// /map renders them solid vs dashed and its legend explains which is which.\n" +
  "//\n" +
  "// StoryMap.tsx re-exports all three original names, so importers keep their\n" +
  "// old path; the extra EDGE_KIND export is additive.\n";

writeFileSync(
  storyOut,
  storyBanner +
    `export type StoryNode = {\n` +
    `  id: string;\n` +
    `  label: string;\n` +
    `  sub?: string;\n` +
    `  x: number; // normalized 0..1\n` +
    `  y: number;\n` +
    `  r: number;\n` +
    `  color: string;\n` +
    `  target: string; // "#hash", external url, or "chat"\n` +
    `};\n\n` +
    `export const NODES: StoryNode[] = ${JSON.stringify(storyNodes, null, 2)};\n\n` +
    `export const EDGES: [string, string][] = ${JSON.stringify(STORY_EDGES)};\n\n` +
    `/** "measured" edges are read straight from systemGraph.ts's own runs-here\n` +
    ` *  facts; "declared" edges are curated wiring — the same distinction\n` +
    ` *  systemGraph.ts's own edges carry, extended to the constellation. */\n` +
    `export const EDGE_KIND: Record<string, "measured" | "declared"> = ${JSON.stringify(EDGE_KIND, null, 2)};\n`,
);

console.log(`[gen-system-graph] storyMap: ${storyNodes.length} nodes, ${STORY_EDGES.length} edges (${MEASURED_WIRES.length} measured)`);
