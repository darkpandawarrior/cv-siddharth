import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { landOf, worldModel } from "./worldModel.ts";
import { GRAMMAR } from "./grammar.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";
import { buildFixtureNow } from "./__fixtures__/grammar/now.ts";
import { buildFixtureYou } from "./__fixtures__/grammar/you.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("worldModel: D1 deterministic", () => {
  it("worldModel(ledger, now, you) called twice, in-process, is deep-equal", () => {
    const ledger = buildFixtureLedger();
    const now = buildFixtureNow();
    const you = buildFixtureYou();
    const a = worldModel(ledger, now, you);
    const b = worldModel(ledger, now, you);
    expect(a).toEqual(b);
  });

  it("landOf(ledger) called twice, in-process, is deep-equal", () => {
    const ledger = buildFixtureLedger();
    expect(landOf(ledger)).toEqual(landOf(ledger));
  });

  it("worldModel is deterministic in a FRESH process too (not just in-process memoisation)", () => {
    const script = `
      import { worldModel } from "${join(HERE, "worldModel.ts")}";
      import { buildFixtureLedger } from "${join(HERE, "__fixtures__/grammar/ledger.ts")}";
      import { buildFixtureNow } from "${join(HERE, "__fixtures__/grammar/now.ts")}";
      import { buildFixtureYou } from "${join(HERE, "__fixtures__/grammar/you.ts")}";
      const wm = worldModel(buildFixtureLedger(), buildFixtureNow(), buildFixtureYou());
      process.stdout.write(JSON.stringify(wm));
    `;
    const run = (label: string) => {
      const result = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr}`);
      return result.stdout;
    };
    const inProcess = JSON.stringify(worldModel(buildFixtureLedger(), buildFixtureNow(), buildFixtureYou()));
    const freshProcess1 = run("fresh-1");
    const freshProcess2 = run("fresh-2");
    expect(freshProcess1).toBe(freshProcess2);
    expect(freshProcess1).toBe(inProcess);
  });
});

describe("worldModel: shape", () => {
  const ledger = buildFixtureLedger();
  const wm = worldModel(ledger, buildFixtureNow(), buildFixtureYou());

  it("produces one ledger row per GRAMMAR rule", () => {
    expect(wm.rows).toHaveLength(GRAMMAR.length);
  });

  it("every feature carries a rule id that is a real GRAMMAR rule", () => {
    const ruleIds = new Set(GRAMMAR.map((r) => r.id));
    for (const f of wm.features) expect(ruleIds.has(f.rule)).toBe(true);
  });

  it("every feature id is `${rule}:${placementSeed}` and unique", () => {
    const ids = wm.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of wm.features) expect(f.id.startsWith(`${f.rule}:`)).toBe(true);
  });

  it("landOf(ledger, asOf) never returns a feature dated after asOf", () => {
    const asOf = "2026-05";
    const features = landOf(ledger, asOf);
    for (const f of features) {
      if (f.date !== null) expect(f.date.slice(0, 7) <= asOf).toBe(true);
    }
  });
});
