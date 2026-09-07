import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { GENERATORS, root } from "./generators.mjs";

/**
 * The gate this whole file exists for: scripts/generators.mjs claims to be
 * the ONE place every generator is declared. These tests make that claim
 * mechanically checked instead of merely written down.
 */

const onDisk = readdirSync(join(root, "scripts"))
  .filter((f) => /^gen-.*\.mjs$/.test(f))
  .filter((f) => !f.endsWith(".test.mjs")); // gen-loopdown.test.mjs matches the glob and is a vitest, not a generator.

describe("every scripts/gen-*.mjs script has exactly one node", () => {
  it("has no script on disk that generators.mjs doesn't know about", () => {
    const declared = new Set(GENERATORS.map((g) => g.script));
    const undeclared = onDisk.filter((f) => !declared.has(f));
    expect(undeclared, "add a node in scripts/generators.mjs for each of these").toEqual([]);
  });

  it("names no script that doesn't exist", () => {
    const missing = GENERATORS.filter((g) => !existsSync(join(root, "scripts", g.script))).map((g) => g.id);
    expect(missing, "these nodes name a script that isn't on disk").toEqual([]);
  });

  it("has no two nodes sharing one script", () => {
    const seen = new Map();
    for (const g of GENERATORS) seen.set(g.script, (seen.get(g.script) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s);
    expect(dupes).toEqual([]);
  });

  it("declares exactly one node per gen-*.mjs script on disk (the derived count)", () => {
    const genNodes = GENERATORS.filter((g) => /^gen-.*\.mjs$/.test(g.script));
    expect(genNodes.length, "scripts/gen-*.mjs on disk (excluding *.test.mjs)").toBe(onDisk.length);
  });
});

/**
 * The other direction: a file this repo ships as generated (its own banner
 * says so) must be a node's declared output, or it is an orphan nothing
 * regenerates and nothing checks for drift.
 */
describe("every banner-carrying file is a declared output", () => {
  const BANNER = /(?:AUTO-GENERATED|GENERATED) by scripts\/([\w.-]+\.mjs)/;
  const SCAN_DIRS = ["src", "api"];
  const SKIP = new Set(["node_modules", "dist", ".git"]);

  function walk(dir, acc = []) {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, acc);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) acc.push(p);
    }
    return acc;
  }

  const declaredOutputs = new Set(
    GENERATORS.flatMap((g) => g.outputs).map((o) => join(root, o.replace(/\/\*.*$/, ""))),
  );
  const bannerFiles = SCAN_DIRS.flatMap((d) => walk(join(root, d)))
    .map((p) => ({ path: p, m: BANNER.exec(readFileSync(p, "utf8").slice(0, 400)) }))
    .filter((x) => x.m);

  it.each(bannerFiles.map((x) => [x.path.slice(root.length + 1), x.m[1]]))(
    "%s (banner names %s) is declared as an output",
    (relPath) => {
      const abs = join(root, relPath);
      const owner = GENERATORS.find((g) => g.outputs.some((o) => join(root, o.replace(/\/\*.*$/, "")) === abs));
      expect(owner, `${relPath} carries a generated banner but no node's outputs list it`).toBeDefined();
    },
  );

  it("found at least the known generated files (sanity: the scan isn't silently empty)", () => {
    expect(bannerFiles.length).toBeGreaterThanOrEqual(15);
  });
});

describe("the three derived consumers stay in sync with the manifest", () => {
  it("BUILD_CHAIN, REFRESH_STEPS and CHECK_DETERMINISTIC only ever name declared nodes", async () => {
    const { BUILD_CHAIN, REFRESH_STEPS, CHECK_DETERMINISTIC } = await import("./generators.mjs");
    const scripts = new Set(GENERATORS.map((g) => g.script));
    const npmNames = new Set(GENERATORS.map((g) => g.npmName).filter(Boolean));
    for (const node of BUILD_CHAIN) expect(scripts.has(node.script)).toBe(true);
    for (const step of REFRESH_STEPS) expect(npmNames.has(step)).toBe(true);
    for (const script of CHECK_DETERMINISTIC) expect(scripts.has(script)).toBe(true);
  });

  it("orders every consumer before its dependents (inputs really do run first)", async () => {
    const { stageOrder } = await import("./generators.mjs");
    for (const stage of ["build", "refresh", "check"]) {
      const order = stageOrder(stage);
      const posOf = new Map(order.map((g, i) => [g.id, i]));
      const outputOwner = new Map();
      for (const g of order) for (const o of g.outputs) outputOwner.set(o, g.id);
      for (const g of order) {
        for (const input of g.inputs) {
          const producer = outputOwner.get(input);
          if (producer) expect(posOf.get(producer)).toBeLessThan(posOf.get(g.id));
        }
      }
    }
  });
});
