#!/usr/bin/env node
/**
 * The colour-vision-deficiency separation gate for the world's four lanes.
 *
 * `src/world/palette.ts`'s `laneColors()` hands out four hex colours — one
 * per group (`proof`/`corpus`/`writing`/`runs`) — and `palette.test.ts` pins
 * that a room in one group never resolves to the same colour as a room in
 * another. That test proves the mapping doesn't collapse; it says nothing
 * about whether the four colours it names are still visibly four colours to
 * a colour-blind visitor. `worldPalette()` already reads only tokens that
 * exist, so the hues themselves were never audited for separation — this is
 * that audit, run as a script because it has nothing to do with jsdom or a
 * browser: four hex strings in, a pass/fail on stdout out.
 *
 * Method: simulate each of the three common dichromacies (protanopia,
 * deuteranopia, tritanopia) with the standard Machado/Oliveira/Fairchild
 * (2009) linear-RGB transforms, then require every PAIR of the four lane
 * colours to stay at least MIN_DISTANCE apart in simulated linear-RGB space,
 * under every simulation. A pair that collapses under one CVD type still
 * fails the gate even if the other two are fine — colour-blind visitors don't
 * get to pick which kind they have.
 *
 * Reads the *default* (`:root` / `@theme`) values straight out of index.css,
 * the same values `worldPalette()` falls back to when there is no DOM to read
 * a computed style from (SSR, and this script). `.ink-world`'s override is a
 * separate palette this gate does not chase — themeCoverage.test.ts already
 * pins that every scene token IS overridden there; auditing ITS separation
 * too is a straightforward follow-up, not a blocker for this gate existing.
 *
 * Usage: `node scripts/validate_palette.js` — exit 0 on pass, 1 on fail.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS_PATH = fileURLToPath(new URL("../src/index.css", import.meta.url));

/** The four lanes, in `laneColors()`'s own order — work/chess/writing/opensource. */
const LANE_TOKENS = [
  { name: "signal (work)", token: "--color-signal" },
  { name: "probe (chess)", token: "--color-probe" },
  { name: "accent (writing)", token: "--color-accent" },
  { name: "text (opensource)", token: "--color-text" },
];

/** Minimum simulated-space distance two lanes must keep, under every CVD
 *  type, to still read as different colours. 0-441.7 is the full range for
 *  three 0-255 channels (√(255²×3)); 40 is a conservative "clearly still two
 *  colours" floor, picked before running this once (not fitted to the four
 *  lanes' own numbers after the fact — a threshold reverse-engineered from
 *  its own dataset proves nothing). Run today, probe (cyan) vs. text
 *  (near-white) clears every simulation except protanopia, at 39.4 — a real,
 *  narrow miss this gate is supposed to catch, not paper over by loosening
 *  the number until it's quiet. See the PR notes for the follow-up this
 *  surfaced; the fix belongs to whoever owns the site-wide --color-text
 *  token, not to a number in this file. */
const MIN_DISTANCE = 40;

function readDefaultToken(css, token) {
  // Token names are plain identifiers (`--color-signal`) — "-" carries no
  // regex meaning outside a character class, so nothing here needs escaping.
  const re = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`);
  const m = css.match(re);
  if (!m) throw new Error(`${token} not found in index.css`);
  return m[1];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB (0-255) -> linear (0-1), the standard piecewise transfer function. */
function toLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function fromLinear(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

/** Machado/Oliveira/Fairchild 2009 full-severity dichromacy matrices, applied
 *  in linear RGB. Published and widely reused by CVD simulators (Chrome
 *  DevTools' own emulation among them) rather than invented here. */
const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulate(rgb, matrix) {
  const lin = rgb.map(toLinear);
  return matrix.map((row) => fromLinear(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
}

function distance(a, b) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

function main() {
  const css = readFileSync(CSS_PATH, "utf8");
  const theme = css.slice(css.indexOf("@theme {"), css.indexOf("\n}\n", css.indexOf("@theme {")));
  const lanes = LANE_TOKENS.map((l) => ({ ...l, hex: readDefaultToken(theme, l.token), rgb: hexToRgb(readDefaultToken(theme, l.token)) }));

  let failed = false;
  const report = [];

  for (const [cvd, matrix] of Object.entries(CVD_MATRICES)) {
    const simulated = lanes.map((l) => ({ ...l, sim: simulate(l.rgb, matrix) }));
    for (let i = 0; i < simulated.length; i++) {
      for (let j = i + 1; j < simulated.length; j++) {
        const d = distance(simulated[i].sim, simulated[j].sim);
        const ok = d >= MIN_DISTANCE;
        if (!ok) failed = true;
        report.push(`${ok ? "PASS" : "FAIL"}  ${cvd.padEnd(12)} ${simulated[i].name} vs ${simulated[j].name}: ${d.toFixed(1)} (min ${MIN_DISTANCE})`);
      }
    }
  }

  console.log(`world palette CVD-separation gate — lanes: ${lanes.map((l) => `${l.name}=${l.hex}`).join(", ")}`);
  for (const line of report) console.log(line);

  if (failed) {
    console.error("\nFAILED: two lanes read as the same colour under at least one dichromacy simulation.");
    process.exit(1);
  }
  console.log("\nOK: all four lanes stay separated under protanopia, deuteranopia and tritanopia.");
}

main();
