import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * BREAK-IT (G15): the mirror-failure path is proven by pointing --mirrors at
 * ports nothing listens on, so every attempt genuinely fails, rather than
 * trusting that a real network outage would behave the same way.
 */

const CLI = new URL("./gen-river-osm.mjs", import.meta.url).pathname;
const FIXTURE = new URL("./__fixtures__/overpass-mula-mutha-2026-09-23.json", import.meta.url).pathname;

const dirs = [];
function tmpOut(name) {
  const dir = mkdtempSync(join(tmpdir(), "gen-river-osm-"));
  dirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function run(args) {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("gen-river-osm.mjs, from the fixture", () => {
  it("matches the measured real-world geometry within tolerance", () => {
    const out = tmpOut("mutha.json");
    const { status } = run(["--fixture", FIXTURE, "--out", out]);
    expect(status).toBe(0);
    const data = JSON.parse(readFileSync(out, "utf8"));

    expect(data.muthaLengthKm).toBeGreaterThanOrEqual(28.52 - 0.05);
    expect(data.muthaLengthKm).toBeLessThanOrEqual(28.52 + 0.05);

    expect(data.sinuosity).toBeGreaterThanOrEqual(1.147 - 0.002);
    expect(data.sinuosity).toBeLessThanOrEqual(1.147 + 0.002);

    expect(data.outflowBearingDeg).toBeGreaterThanOrEqual(58.4 - 0.2);
    expect(data.outflowBearingDeg).toBeLessThanOrEqual(58.4 + 0.2);

    expect(data.chordBearingDeg).toBeGreaterThanOrEqual(53.0 - 0.5);
    expect(data.chordBearingDeg).toBeLessThanOrEqual(53.0 + 0.5);

    expect(Math.abs(data.confluence.lat - 18.5315656)).toBeLessThan(1e-5);
    expect(Math.abs(data.confluence.lon - 73.8603474)).toBeLessThan(1e-5);

    expect(data.bends.length).toBeGreaterThan(2);
    expect(data.bends[0][1]).toBe(0);
    expect(data.bends[data.bends.length - 1][1]).toBe(0);

    expect(data.license).toBe("ODbL-1.0");
  });

  it("is byte-identical across two runs", () => {
    const outA = tmpOut("mutha-a.json");
    const outB = tmpOut("mutha-b.json");
    expect(run(["--fixture", FIXTURE, "--out", outA]).status).toBe(0);
    expect(run(["--fixture", FIXTURE, "--out", outB]).status).toBe(0);
    expect(readFileSync(outA, "utf8")).toBe(readFileSync(outB, "utf8"));
  });
});

describe("gen-river-osm.mjs, every mirror failing", () => {
  it("keeps the committed snapshot byte-identical and exits 0", () => {
    const out = tmpOut("mutha.json");
    // seed a "committed snapshot" the run must not touch
    const seeded = readFileSync(FIXTURE, "utf8");
    writeFileSync(out, seeded);

    const deadMirrors = "http://127.0.0.1:1,http://127.0.0.1:2";
    const { status, stdout } = run(["--mirrors", deadMirrors, "--backoff-ms", "5", "--out", out]);

    expect(status).toBe(0);
    expect(stdout).toMatch(/kept committed snapshot/);
    expect(readFileSync(out, "utf8")).toBe(seeded);
  });
});
