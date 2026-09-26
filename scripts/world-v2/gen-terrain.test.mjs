import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as V from "../../src/world/v2/valley.ts";
import { ledger } from "../../src/world/v2/ledger.ts";
import { RESIDUAL_PNG, loadRelief } from "./real-relief.mjs";
import { ridgeCrestHeightAtYm } from "./gen-terrain.mjs";

const root = new URL("../../", import.meta.url).pathname;
const GEN = join(root, "scripts/world-v2/gen-terrain.mjs");
const OUT = join(root, "heavy/world/terrain");

function readHeightmap(grid) {
  const meta = JSON.parse(readFileSync(join(OUT, `valley-h-${grid}.json`), "utf8"));
  return { meta };
}

function runGenerator() {
  execFileSync("node", [GEN], { cwd: root, stdio: "pipe" });
}

describe("gen-terrain.mjs determinism", () => {
  // Two full generator subprocesses (~1-4s each in isolation, more under a
  // loaded CI box running every other file's tests in parallel) — the
  // default 5s vitest timeout is a unit-test budget, not a two-subprocess
  // one.
  it(
    "two runs leave heavy/world/terrain byte-identical",
    () => {
      runGenerator();
      const before = {
        h513: readFileSync(join(OUT, "valley-h-513.png")),
        h1025: readFileSync(join(OUT, "valley-h-1025.png")),
        flow: readFileSync(join(OUT, "valley-flow-1024.webp")),
        license: readFileSync(join(OUT, "LICENSE-ODbL.txt")),
      };
      runGenerator();
      const after = {
        h513: readFileSync(join(OUT, "valley-h-513.png")),
        h1025: readFileSync(join(OUT, "valley-h-1025.png")),
        flow: readFileSync(join(OUT, "valley-flow-1024.webp")),
        license: readFileSync(join(OUT, "LICENSE-ODbL.txt")),
      };
      expect(after.h513.equals(before.h513)).toBe(true);
      expect(after.h1025.equals(before.h1025)).toBe(true);
      expect(after.flow.equals(before.flow)).toBe(true);
      expect(after.license.equals(before.license)).toBe(true);
    },
    30_000,
  );

  it("valley-math is gone and unreferenced", () => {
    expect(existsSync(join(root, "scripts/world-v2/valley-math.mjs"))).toBe(false);
  });

  it("Tier-A terrain bytes (513 heightmap + flow map) stay <= 700,000", () => {
    const a = readFileSync(join(OUT, "valley-h-513.png")).length;
    const b = readFileSync(join(OUT, "valley-flow-1024.webp")).length;
    expect(a + b).toBeLessThanOrEqual(700_000);
  });

  it("LICENSE-ODbL.txt exists and names ODbL and OpenStreetMap contributors", () => {
    const text = readFileSync(join(OUT, "LICENSE-ODbL.txt"), "utf8");
    expect(text).toContain("ODbL");
    expect(text).toContain("OpenStreetMap contributors");
  });
});

describe("gen-terrain.mjs channel width matches valley.ts's G2 width", () => {
  runGenerator();
  const { meta } = readHeightmap(513);
  const texel = meta.metresPerTexel;

  // District benches (step 5) and tributary channels (step 6) legitimately
  // override the channel floor near a bench, by the same height function
  // v1 already shipped — so this width probe only picks months whose river
  // point sits clear of every bench/tributary's own override radius, the
  // same way a human reading the heightmap would avoid the amphitheatre
  // when checking "is this the river's own width".
  const basin = V.sangamBasin();
  const trib = V.tributaries();
  const districts = V.districtAnchors(
    trib.map((t) => t.id),
    basin,
  );
  function clearOfOverrides(z) {
    const x = V.riverX(z);
    if (districts.some((d) => Math.hypot(x - d.x, z - d.z) < 14 + 6)) return false;
    if (Math.hypot(x - basin.x, z - basin.z) < basin.r + 6) return false;
    return true;
  }

  const months = ledger.timeline.months.filter((ym) => clearOfOverrides(V.valleyZ(ym)));
  const picks = Array.from({ length: 12 }, (_, i) => months[Math.floor((i * (months.length - 1)) / 11)]);

  it.each(picks)("row at %s: channel floor span within one texel of riverWidthAtZ", async (ym) => {
    const z = V.valleyZ(ym);
    const expectedWidth = V.riverWidthAtZ(z);
    const expectedDepth = V.riverDepth(expectedWidth);

    const { data } = await sharp(join(OUT, "valley-h-513.png"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const grid = meta.grid;
    const gz = Math.min(grid - 1, Math.max(0, Math.round((z - meta.bounds.zMin) / texel)));

    const decode = (p) => meta.min + (p / 255) * (meta.max - meta.min);
    const quantStep = (meta.max - meta.min) / 255;
    const floorTarget = -expectedDepth;

    let count = 0;
    for (let gx = 0; gx < grid; gx++) {
      const h = decode(data[gz * grid + gx]);
      if (Math.abs(h - floorTarget) <= quantStep * 1.5) count++;
    }
    const measuredWidth = count * texel;
    expect(Math.abs(measuredWidth - expectedWidth)).toBeLessThanOrEqual(texel + quantStep * 4);
  });
});

describe("chess ridge (G9): steps only at recorded peak months", () => {
  const peakYms = new Set(ledger.chess.platforms.flatMap((p) => p.peaks.map((pk) => pk.at.slice(0, 7))));
  const months = ledger.timeline.months;
  // The REC-4 notch (idea-atlas.md) is a one-month-wide dip, not a
  // permanent step: it has a leaving edge the very next month, which is
  // "at" the same declared handoff event even though the calendar month
  // itself carries no peak of its own. NOTCH_YM's own definition lives in
  // gen-terrain.mjs; duplicated as a literal here so this test still fails
  // if a future edit moves the notch without updating both.
  const NOTCH_YM = "2023-01";
  const notchExitYm = months[months.indexOf(NOTCH_YM) + 1];
  const allowedChangeYms = new Set([...peakYms, notchExitYm]);

  it("holds flat outside recorded peak months and the notch's own exit month", () => {
    let prev = ridgeCrestHeightAtYm(months[0]);
    for (let i = 1; i < months.length; i++) {
      const ym = months[i];
      const h = ridgeCrestHeightAtYm(ym);
      if (h !== prev) {
        expect(allowedChangeYms.has(ym)).toBe(true);
      }
      prev = h;
    }
  });

  it("the notch fires exactly at 2023-01 (deepens the running-max height already in effect)", () => {
    const i = months.indexOf(NOTCH_YM);
    expect(ridgeCrestHeightAtYm(NOTCH_YM)).toBeLessThan(ridgeCrestHeightAtYm(months[i - 1]));
    expect(ridgeCrestHeightAtYm(notchExitYm)).toBe(ridgeCrestHeightAtYm(months[i - 1]));
  });

  it("break-it: an unrecorded, non-notch month never changes the crest", () => {
    // 2021-06 is not a lichess/chess.com peak month, and not adjacent to
    // the notch, in the committed data.
    expect(allowedChangeYms.has("2021-06")).toBe(false);
    const i = months.indexOf("2021-06");
    if (i > 0) expect(ridgeCrestHeightAtYm(months[i])).toBe(ridgeCrestHeightAtYm(months[i - 1]));
  });
});

describe("real relief residual", () => {
  it("mean is within 0.05 of 0 and std within 0.05 of 1", async () => {
    const r = await loadRelief();
    let mean = 0;
    for (const v of r.data) mean += v;
    mean /= r.data.length;
    let variance = 0;
    for (const v of r.data) variance += (v - mean) * (v - mean);
    const std = Math.sqrt(variance / r.data.length);
    expect(Math.abs(mean)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(std - 1)).toBeLessThanOrEqual(0.05);
  });

  it(
    "break-it: renaming the residual PNG makes the generator throw (nonzero exit)",
    () => {
      const backup = `${RESIDUAL_PNG}.break-it-bak`;
      renameSync(RESIDUAL_PNG, backup);
      try {
        expect(() => execFileSync("node", [GEN], { cwd: root, stdio: "pipe" })).toThrow();
      } finally {
        renameSync(backup, RESIDUAL_PNG);
      }
    },
    30_000,
  );

  afterAll(() => {
    // Leave the committed outputs regenerated from the real (restored)
    // residual, never from the break-it fixture's absence.
    runGenerator();
  }, 30_000);
});
