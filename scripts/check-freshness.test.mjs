import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * BREAK-IT (G15): scripts/check-freshness.mjs is the alarm that moved out of
 * `npm test` in this same lane (see freshness.test.ts and
 * self-healing-spec.md#2.2) — a guard with no fixture proving it can fail is
 * not proven at all. Each case below writes a one-file fixture directory
 * (store.ts, the one file with a real verifiedAt today) and spawns the real
 * CLI with `--dir` pointed at it, so this checks the actual exit code a
 * doctor run would see, not an internal function.
 */

const CLI = new URL("./check-freshness.mjs", import.meta.url).pathname;

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const dirs = [];
function fixture(source) {
  const dir = mkdtempSync(join(tmpdir(), "check-freshness-"));
  dirs.push(dir);
  writeFileSync(join(dir, "store.ts"), source, "utf8");
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function run(dir, extraArgs = []) {
  try {
    const stdout = execFileSync("node", [CLI, "--dir", dir, ...extraArgs], { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("check-freshness.mjs", () => {
  it("exits 1 and names the file when generatedAt is past SLA", () => {
    // store.ts's SLA is 45 days (freshnessSla.ts); 60 is a clean breach.
    const dir = fixture(`export const storeGeneratedAt = "${daysAgo(60)}";\n`);
    const { status, stderr } = run(dir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/store\.ts past SLA \(60 days, SLA 45\)/);
  });

  it("exits 0 once verifiedAt is today, generatedAt untouched", () => {
    const dir = fixture(
      `export const storeGeneratedAt = "${daysAgo(60)}";\n` + `export const storeVerifiedAt = "${daysAgo(0)}";\n`,
    );
    const { status } = run(dir);
    expect(status).toBe(0);
  });

  it("exits 1 for a MUST_BE_STAMPED file with neither stamp", () => {
    const dir = fixture(`export const storeApps = [] as const;\n`);
    const { status, stderr } = run(dir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/store\.ts carries no generatedAt or verifiedAt stamp/);
  });

  it("--json prints the row for a downstream reader (the doctor)", () => {
    const dir = fixture(`export const storeGeneratedAt = "${daysAgo(1)}";\n`);
    const { status, stdout } = run(dir, ["--json"]);
    expect(status).toBe(0);
    const rows = JSON.parse(stdout);
    expect(rows).toEqual([
      expect.objectContaining({ file: "store.ts", age: 1, sla: 45, ok: true }),
    ]);
  });
});
