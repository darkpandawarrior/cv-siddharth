// The design-system ratchet (M71, G-DS): the ONE design system is what
// already exists: the @theme block in src/index.css (--text-*, --space-*,
// --ease-*, --dur-*) plus Tailwind's default type/spacing scales, never a
// new list maintained here. This test counts drift AWAY from that system per
// file and fails a file that grows past its committed baseline.
//
// Three drift shapes, counted together per file:
//  1. Tailwind arbitrary values for type/spacing/motion (text-[, p-[, ...).
//  2. Raw font-size/transition/animation values in CSS outside @theme.
//  3. three.js lights outside the rig allowlist (StudioRig, src/world/**).
//
// Modes (env vars, mutually exclusive):
//  - default: every file's count must be <= its ds-baseline.json count.
//    A file absent from the baseline starts at 0.
//  - DS_WRITE_BASELINE=1: (re)writes ds-baseline.json from today's counts.
//    Run this, review the diff, commit it; the orchestrator reconciles it
//    across lanes the same way it reconciles src/data/repoStats.ts (M30).
//  - DS_STRICT=1: any non-zero count anywhere fails, printing the per-file
//    counts as the phase-5 (Phase U) worklist. Named timings and the 1ms
//    reduced-motion pattern share the rendered audit's exception list.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOTION_ALLOWLIST, SCENE_RIG_ALLOWLIST } from "./exceptions.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = path.join(ROOT, "src");
const BASELINE_PATH = path.join(ROOT, "src/design/ds-baseline.json");
const SELF = fileURLToPath(import.meta.url);

const ARBITRARY_RE = /\b(?:text|p|px|py|m|gap|leading|tracking|duration|ease|delay)-\[/g;
// Property start (after ^, whitespace, `;` or `{`) through the first
// literal ms/s duration in its value, skips `transition: none` and
// anything already reading a var(--dur-*)/var(--text-*) token.
const RAW_CSS_RE =
  /(?:^|[\s;{])(?:font-size|transition(?:-duration)?|animation(?:-duration)?)\s*:\s*[^;{}]*?\b\d+(?:\.\d+)?(?:ms|s)\b/g;
const LIGHT_JSX_RE = /<(?:directionalLight|ambientLight|hemisphereLight|pointLight|spotLight)\b/g;
const LIGHT_NEW_RE = /new THREE\.\w*Light\b/g;

function isRigAllowlisted(file: string): boolean {
  const rel = path.relative(SRC, file);
  return rel.startsWith(`world${path.sep}`) || path.basename(file) === "StudioRig.tsx";
}

function lightDrift(file: string, content: string): number {
  if (isRigAllowlisted(file)) return 0;
  const lights = (content.match(LIGHT_JSX_RE) ?? []).length + (content.match(LIGHT_NEW_RE) ?? []).length;
  const allowance = SCENE_RIG_ALLOWLIST.find((entry) => entry.file === path.relative(ROOT, file))?.lights ?? 0;
  return Math.max(0, lights - allowance);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function rawCssDrift(css: string): number {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@theme\s*\{[\s\S]*?\n\}/, "");
  const reducedRanges = [...source.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)].map((match) => {
    let depth = 1, end = match.index! + match[0].length;
    while (end < source.length && depth) {
      if (source[end] === "{") depth++;
      if (source[end] === "}") depth--;
      end++;
    }
    return [match.index!, end];
  });
  return [...source.matchAll(RAW_CSS_RE)].filter((match) => {
    const start = match.index!;
    const declaration = source.slice(start).replace(/^[\s;{]+/, "").split(/[;{}]/, 1)[0].trim();
    if (reducedRanges.some(([from, to]) => start >= from && start < to)
      && /^(?:animation|transition)-duration:\s*1ms$/.test(declaration)) return false;
    if (!declaration.startsWith("animation:")) return true;
    // Split animation lists without splitting timing functions such as steps(1, end).
    return !declaration.slice("animation:".length).split(/,(?![^()]*\))/).every((part) => {
      const raw = part.match(/\b\d+(?:\.\d+)?(?:ms|s)\b/g) ?? [];
      if (raw.length === 0) return true;
      const animation = /^\s*([\w-]+)\s+(\d+(?:\.\d+)?)(ms|s)\b/.exec(part);
      if (!animation || raw.length !== 1) return false;
      const duration = Number(animation[2]) / (animation[3] === "ms" ? 1000 : 1);
      return MOTION_ALLOWLIST.some((entry) => entry.name === animation[1] && entry.seconds === duration);
    });
  }).length;
}

function countFile(file: string): number {
  const content = fs.readFileSync(file, "utf8");
  let count = 0;

  count += (content.match(ARBITRARY_RE) ?? []).length;

  if (file.endsWith(".css")) {
    count += rawCssDrift(content);
  }

  if (!file.endsWith(".css")) count += lightDrift(file, content);

  return count;
}

function computeCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of walk(SRC)) {
    if (file === SELF) continue; // the regexes' own source text, not drift
    const n = countFile(file);
    if (n > 0) counts[path.relative(ROOT, file)] = n;
  }
  return counts;
}

const WRITE = process.env.DS_WRITE_BASELINE === "1";
const STRICT = process.env.DS_STRICT === "1";

describe("standalone scene rig limits", () => {
  it("counts an extra light beyond every exact scene allowance", () => {
    expect(new Set(SCENE_RIG_ALLOWLIST.map((entry) => entry.file)).size).toBe(SCENE_RIG_ALLOWLIST.length);
    for (const entry of SCENE_RIG_ALLOWLIST) {
      const file = path.join(ROOT, entry.file);
      const content = fs.readFileSync(file, "utf8");
      expect((content.match(LIGHT_JSX_RE) ?? []).length + (content.match(LIGHT_NEW_RE) ?? []).length).toBe(entry.lights);
      expect(lightDrift(file, content)).toBe(0);
      expect(lightDrift(file, `${content}\n<pointLight />`)).toBe(1);
      expect(lightDrift(file, `${content}\nnew THREE.PointLight()`)).toBe(1);
    }
    expect(lightDrift(path.join(SRC, "UnlistedScene.tsx"), "<ambientLight />")).toBe(1);
  });
});

describe("shared source timing exceptions", () => {
  it("accepts exact named timings and the reduced-motion pattern", () => {
    for (const entry of MOTION_ALLOWLIST) {
      if (entry.seconds !== undefined) expect(rawCssDrift(`.status { animation: ${entry.name} ${entry.seconds}s linear infinite; }`)).toBe(0);
    }
    expect(rawCssDrift("@media (prefers-reduced-motion: reduce) { .status { transition-duration: 1ms; } }")).toBe(0);
    expect(rawCssDrift(".status { animation: ops-node-in var(--dur-fast) both, ops-pulse 1.6s infinite; }")).toBe(0);
    expect(rawCssDrift(".status{opacity:1;animation:spin 1s infinite}")).toBe(0);
  });

  it("rejects raw durations outside the named and reduced-motion contexts", () => {
    expect(rawCssDrift(".status { transition: opacity 137ms; }")).toBe(1);
    expect(rawCssDrift(".status { animation: unknown 1s infinite; }")).toBe(1);
    expect(rawCssDrift(".status { animation: spin 1.37s infinite; }")).toBe(1);
    expect(rawCssDrift(".status { animation: spin 1s infinite, unknown 2s infinite; }")).toBe(1);
    expect(rawCssDrift(".status { transition-duration: 1ms; }")).toBe(1);
    expect(rawCssDrift("@media (prefers-reduced-motion: reduce) { .status { transition-duration: 2ms; } }")).toBe(1);
    expect(rawCssDrift("@media not (prefers-reduced-motion: reduce) { .status { transition-duration: 1ms; } }")).toBe(1);
  });
});

describe("globe glass surfaces", () => {
  it("uses the glass token rather than private opacity and blur pairs", () => {
    const offenders = walk(path.join(SRC, "world/globe")).filter((file) => {
      const classes = fs.readFileSync(file, "utf8").match(/"[^"\n]*"|`[^`]*`/g) ?? [];
      return classes.some((value) => /\bbg-ink\/\d+\b/.test(value) && /\bbackdrop-blur\b/.test(value));
    });
    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});

describe("design system ratchet (G-DS)", () => {
  const counts = computeCounts();

  if (WRITE) {
    it("writes ds-baseline.json from today's counts", () => {
      fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
      expect(fs.existsSync(BASELINE_PATH)).toBe(true);
    });
    return;
  }

  if (STRICT) {
    it("has zero design-system drift (DS_STRICT=1, phase-5 close)", () => {
      const offenders = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (offenders.length > 0) {
        console.error(
          "Design-system drift (phase-5 worklist):\n" +
            offenders.map(([file, n]) => `  ${n}\t${file}`).join("\n"),
        );
      }
      expect(offenders).toEqual([]);
    });
    return;
  }

  const baseline: Record<string, number> = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
    : {};

  it("stays within the committed baseline (ds-baseline.json)", () => {
    const regressions = Object.entries(counts).filter(([file, n]) => n > (baseline[file] ?? 0));
    expect(regressions).toEqual([]);
  });
});
