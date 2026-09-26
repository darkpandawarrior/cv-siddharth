import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STREAMS } from "./streams.ts";

/**
 * streamFence.test.ts (living-ledger-spec §9.3): a module bound to a
 * `claim: false` (ambient) stream never imports ledger.ts, grammar.ts,
 * data/profile/* or globeGeo.ts, and never reaches for the amber, cyan or
 * green "live" status tokens — an ambient stream carries no claim and must
 * not be able to dress itself up as one.
 *
 * Renderer modules for a stream live at src/world/v2/live/<streamId>.ts by
 * convention; none exist yet in this lane, so every real check below is
 * skipped, not failed (same convention as purity.test.ts), until a later
 * lane adds one.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_IMPORTS = ["ledger.ts", "grammar.ts", "data/profile", "globeGeo.ts"];
const FORBIDDEN_TOKENS = /\b(amber|cyan|green)\b/i;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** The checker under test: a pure function of source text. */
export function fenceViolations(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];
  for (const bad of FORBIDDEN_IMPORTS) {
    const re = new RegExp(`import[^;]*from\\s*["'][^"']*${bad.replace(/[./]/g, "\\$&")}["']`);
    if (re.test(code)) violations.push(`imports ${bad}`);
  }
  if (FORBIDDEN_TOKENS.test(code)) violations.push("references an amber/cyan/green token");
  return violations;
}

function liveModulePath(streamId: string): string {
  return join(HERE, "live", `${streamId}.ts`);
}

describe("streamFence: claim:false streams stay honest", () => {
  const ambient = STREAMS.filter((s) => s.claim === false);

  it("every STREAMS entry declares its claim explicitly (true or false)", () => {
    for (const s of STREAMS) expect(typeof s.claim).toBe("boolean");
  });

  for (const stream of ambient) {
    const path = liveModulePath(stream.id);
    if (!existsSync(path)) {
      it.skip(`live/${stream.id}.ts (not written yet)`, () => {});
      continue;
    }
    it(`live/${stream.id}.ts stays inside the fence`, () => {
      expect(fenceViolations(readFileSync(path, "utf8"))).toEqual([]);
    });
  }
});

describe("streamFence: the checker actually fires (break-it, G15)", () => {
  const fixture = readFileSync(join(HERE, "__fixtures__/core/impureAmbient.fixture.ts"), "utf8");
  const found = fenceViolations(fixture);

  it("flags the ledger import and the amber token in the fixture", () => {
    expect(found).toContain("imports ledger.ts");
    expect(found).toContain("references an amber/cyan/green token");
  });

  it("is not merely a pass-through (a clean snippet reports nothing)", () => {
    expect(fenceViolations("export const x = 1 + 2;")).toEqual([]);
  });
});

describe("STREAMS provenance", () => {
  it("every entry has non-empty source, licence, attribution and failure strings", () => {
    for (const s of STREAMS) {
      expect(s.source.length, `${s.id}.source`).toBeGreaterThan(0);
      expect(s.licence.length, `${s.id}.licence`).toBeGreaterThan(0);
      expect(s.attribution.length, `${s.id}.attribution`).toBeGreaterThan(0);
      expect(s.failure.length, `${s.id}.failure`).toBeGreaterThan(0);
    }
  });
});
