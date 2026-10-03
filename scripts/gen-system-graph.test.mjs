import { afterEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const temporaryTrees = [];
afterEach(() => {
  for (const dir of temporaryTrees.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(previous, settings) {
  const tree = mkdtempSync(join(tmpdir(), "system-graph-"));
  temporaryTrees.push(tree);
  const root = join(tree, "Interview", "portfolio");
  const write = (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync(new URL("./gen-system-graph.mjs", import.meta.url), join(root, "scripts", "gen-system-graph.mjs"));
  const inputs = {
    "data/profile.ts": "export const projects = [];",
    "data/connections.ts": "export const RELATED_SERIES = {};",
    "data/writing.ts": "export const writing = { series: [] };",
    "lib/assetBase.ts": 'export const HEAVY_ASSET_BASE = "https://example.test/cv";',
    "data/surfaces.ts": "export const surfaces = [];",
    "data/writingMeta.ts": 'export const BOOKS_BEFORE_BROS = { url: "https://example.test/books" }; export const SERIES_PROJECT = {};',
    "data/profile/openSource.ts": "export const upstreamMergedPRs = 0;",
    "data/careerOpsUpstream.ts": "export const mifosMergedPRs = 0;",
  };
  for (const [path, text] of Object.entries(inputs)) write(join(root, "src", path), text);
  write(join(root, "src", "data", "systemGraph.ts"), `export const includeBuildPairs = ${JSON.stringify(previous)} as const;\n`);
  for (const [consumer, text] of Object.entries(settings)) write(join(tree, "Android", consumer, "settings.gradle.kts"), text);
  return {
    tree,
    run() {
      execFileSync(process.execPath, [join(root, "scripts", "gen-system-graph.mjs")], { cwd: root });
      const output = readFileSync(join(root, "src", "data", "systemGraph.ts"), "utf8");
      return {
        pairs: JSON.parse(/export const includeBuildPairs = (\[[\s\S]*?\]) as const;/.exec(output)[1]),
        graph: JSON.parse(/export const systemGraph: SystemGraph = (\{[\s\S]*?\});/.exec(output)[1]),
      };
    },
  };
}

it("keeps a missing consumer's edges while replacing a scanned consumer's edges", () => {
  const previous = [
    ["doori", "kmp-build-logic"], ["doori", "kmp-toolkit"],
    ["candidai", "kmp-build-logic"], ["candidai", "kmp-toolkit"],
  ];
  const { pairs, graph } = fixture(previous, { Doori: 'includeBuild("external/kmp-build-logic")\n' }).run();
  const expected = [previous[0], ...previous.slice(2)];
  expect(pairs).toEqual(expected);
  expect(graph.edges.filter((edge) => edge.kind === "includeBuild")).toEqual(expected.map(([from, to]) => ({
    from, to, kind: "includeBuild", evidence: "measured", detail: `${from}/settings.gradle.kts`,
  })));
});

it("keeps the committed pairs unchanged when no siblings are available", () => {
  const previous = [["candidai", "kmp-toolkit"], ["doori", "kmp-build-logic"]];
  expect(fixture(previous, {}).run().pairs).toEqual(previous);
});

it("clears a scanned consumer that no longer includes any foundation builds", () => {
  const previous = [["doori", "kmp-toolkit"], ["candidai", "kmp-toolkit"]];
  expect(fixture(previous, { Doori: 'includeBuild("build-logic")\n' }).run().pairs).toEqual([previous[1]]);
});

it("keeps cached edges when a sibling directory has no readable settings input", () => {
  const previous = [["candidai", "kmp-toolkit"]];
  const setup = fixture(previous, { Doori: 'includeBuild("external/kmp-build-logic")\n' });
  mkdirSync(join(setup.tree, "Android", "Candidai"));
  expect(setup.run().pairs).toContainEqual(previous[0]);
});
