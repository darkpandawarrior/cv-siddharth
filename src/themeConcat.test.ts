import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The silent one.
 *
 * A lot of this codebase appends an alpha suffix to a colour it read from a
 * data record: `ctx.fillStyle = `${zone.color}44``. That works for "#f0883e"
 * and produces "#f0883e44". Give the same code a token and it produces
 * "var(--color-warn)44", which is not a colour.
 *
 * Canvas does not throw on an invalid fillStyle — it keeps the previous value.
 * So the zones render in the wrong colour, no error is logged, and no visual
 * test that only checks "something was drawn" will notice. This happened twice
 * during the token migration (signalRoute.ts and CrashLab.tsx).
 *
 * Rule: a colour that gets concatenated stays a hex literal.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}

// `${something.color}` or `${color}` immediately followed by hex alpha digits.
const CONCAT = /\$\{[^}]*\bcolors?\b[^}]*\}[0-9a-fA-F]{2}/;
// A data-record colour field holding a CSS var.
const VAR_FIELD = /\bcolors?:\s*"var\(--/;

describe("token/alpha-concat safety", () => {
  const files = walk(SRC);

  it("finds the concat pattern (guard is not vacuous)", () => {
    expect(files.some((f) => CONCAT.test(readFileSync(f, "utf8")))).toBe(true);
  });

  it("never stores a var() colour in a file that alpha-concatenates one", () => {
    const offenders = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return CONCAT.test(s) && VAR_FIELD.test(s);
    });
    expect(offenders.map((f) => f.replace(SRC, "src"))).toEqual([]);
  });

  it("never assigns a var() straight to a canvas colour property", () => {
    const offenders = files.filter((f) =>
      /(fillStyle|strokeStyle|shadowColor)\s*=\s*"var\(/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => f.replace(SRC, "src"))).toEqual([]);
  });
});
