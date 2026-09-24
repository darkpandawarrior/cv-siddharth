// The design-system ratchet (M71, G-DS): the ONE design system is what
// already exists — the @theme block in src/index.css (--text-*, --space-*,
// --ease-*, --dur-*) plus Tailwind's default type/spacing scales — never a
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
//    Run this, review the diff, commit it — the orchestrator reconciles it
//    across lanes the same way it reconciles src/data/repoStats.ts (M30).
//  - DS_STRICT=1: any non-zero count anywhere fails, printing the per-file
//    counts as the phase-5 (Phase U) worklist.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = path.join(ROOT, "src");
const BASELINE_PATH = path.join(ROOT, "src/design/ds-baseline.json");
const SELF = fileURLToPath(import.meta.url);

const ARBITRARY_RE = /\b(?:text|p|px|py|m|gap|leading|tracking|duration|ease|delay)-\[/g;
// Property start (after ^, whitespace, `;` or `{`) through the first
// literal ms/s duration in its value — skips `transition: none` and
// anything already reading a var(--dur-*)/var(--text-*) token.
const RAW_CSS_RE =
  /(?:^|[\s;{])(?:font-size|transition(?:-duration)?|animation(?:-duration)?)\s*:\s*[^;{}]*?\b\d+(?:\.\d+)?(?:ms|s)\b/g;
const LIGHT_JSX_RE = /<(?:directionalLight|ambientLight|hemisphereLight|pointLight|spotLight)\b/g;
const LIGHT_NEW_RE = /new THREE\.\w*Light\b/g;

function isRigAllowlisted(file: string): boolean {
  const rel = path.relative(SRC, file);
  return rel.startsWith(`world${path.sep}`) || path.basename(file) === "StudioRig.tsx";
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function countFile(file: string): number {
  const content = fs.readFileSync(file, "utf8");
  let count = 0;

  count += (content.match(ARBITRARY_RE) ?? []).length;

  if (file.endsWith(".css")) {
    const withoutTheme = content.replace(/@theme\s*\{[\s\S]*?\n\}/, "");
    count += (withoutTheme.match(RAW_CSS_RE) ?? []).length;
  }

  if (!file.endsWith(".css") && !isRigAllowlisted(file)) {
    count += (content.match(LIGHT_JSX_RE) ?? []).length;
    count += (content.match(LIGHT_NEW_RE) ?? []).length;
  }

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
        // eslint-disable-next-line no-console -- intentional worklist dump
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
