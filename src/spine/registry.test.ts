// The static half of the spine guard. See src/spine/registry.ts for why.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPINE, type SpineEntry } from "./registry.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "src");
const ROUTES_DIR = join(SRC, "routes");
const EXTS = [".ts", ".tsx"];

// ponytail: relative imports only; the repo has no path aliases (tsconfig.app.json, vite.config.ts). Add an alias map if that changes.
const walk = (d: string, out: string[] = []): string[] => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules") walk(p, out); }
    else if (EXTS.includes(extname(e)) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
};
const files = walk(SRC);
const known = new Set(files);
const IMPORT = /(?:import|export)\s+(?:[^'"]*?from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const resolveSpec = (from: string, spec: string) => {
  if (!spec.startsWith(".")) return null;
  const b = resolve(dirname(from), spec.split("?")[0]);
  return [b, ...EXTS.map((x) => b + x), ...EXTS.map((x) => join(b, "index" + x))].find((c) => known.has(c)) ?? null;
};
const deps = new Map(files.map((f) => [f, new Set([...readFileSync(f, "utf8").matchAll(IMPORT)].map((m) => resolveSpec(f, m[1] ?? m[2])).filter((x): x is string => !!x))]));

const rootFile = join(ROUTES_DIR, "__root.tsx");
const leaves = files.filter((f) => dirname(f) === ROUTES_DIR && f.endsWith(".tsx") && f !== rootFile);
/** THE RULE FOR N: a third of the leaf routes, so it scales with the site (R=26 -> 9). */
export const N = Math.ceil(leaves.length / 3);

const reach = new Map<string, number>();
for (const r of leaves) {
  const seen = new Set([r]), stack = [r];
  while (stack.length) for (const d of deps.get(stack.pop()!) ?? []) if (!seen.has(d)) { seen.add(d); stack.push(d); }
  seen.delete(r);
  for (const f of seen) reach.set(f, (reach.get(f) ?? 0) + 1);
}
const rootDirect = new Set([...(deps.get(rootFile) ?? [])].filter((f) => f.endsWith(".tsx")));
const routeText = leaves.map((f) => readFileSync(f, "utf8"));
const mountedIn = (f: string) => {
  const name = readFileSync(f, "utf8").match(/export (?:default )?function ([A-Z]\w*)/)?.[1];
  return name ? routeText.filter((t) => new RegExp(`<${name}[\\s/>]`).test(t)).length : 0;
};
const rel = (f: string) => relative(ROOT, f);

export function spineReasons(f: string): string[] {
  const why: string[] = [];
  if (rootDirect.has(f)) why.push("imported by __root.tsx");
  const m = mountedIn(f);
  if (m >= 3) why.push(`mounted in ${m} route files`);
  const r = reach.get(f) ?? 0;
  if (r >= N) why.push(`route reach ${r}/${leaves.length} >= N=${N}`);
  return why;
}
const candidates = files.filter((f) => f.endsWith(".tsx") && dirname(f) !== ROUTES_DIR);
export const unregistered = (registry: SpineEntry[]) => {
  const files = new Set(registry.map((e) => e.file));
  return candidates.filter((f) => spineReasons(f).length && !files.has(rel(f))).map(rel);
};
/** Landmark tags (<section|footer|header|aside|nav> opening a JSX line) without data-spine. */
export const untaggedBlocks = (file: string) => {
  const text = readFileSync(join(ROOT, file), "utf8");
  return [...text.matchAll(/^[ \t]*<(section|footer|header|aside|nav)\b[^>]*>/gm)]
    .filter((m) => !m[0].includes("data-spine="))
    .map((m) => `${file}:${text.slice(0, m.index).split("\n").length} <${m[1]}>`);
};
const STRICT = process.env.SPINE_STRICT === "1";

describe("the spine registry is complete (src/spine/registry.ts)", () => {
  it("registers every root-mounted, hand-mounted (>=3 routes) or high-reach (>=N) component", () => {
    expect(unregistered(SPINE), `spine components missing from src/spine/registry.ts (N=${N})`).toEqual([]);
  });

  it.each(SPINE.filter((e) => e.file.endsWith(".tsx") && !e.internal).map((e) => [e.id, e] as const))(
    "%s: every landmark block it renders carries data-spine",
    (_id, e) => {
      if (e.debt && !STRICT) return;
      expect(untaggedBlocks(e.file)).toEqual([]);
    },
  );

  it("every entry points at a real file, ids are unique, DOM chrome and blocks have budgets", () => {
    const ids = SPINE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SPINE) {
      if (!e.debt) expect(known.has(join(ROOT, e.file)) || e.file.endsWith(".css"), `${e.id}: ${e.file} does not exist`).toBe(true);
      if ((e.kind === "chrome" || e.kind === "block") && e.selector) expect(e.maxHeight, `${e.id} needs maxHeight at 1440 and 390`).toBeTruthy();
      if (e.selector) expect(e.routes, `${e.id} has a selector but no routes`).toBeTruthy();
    }
  });

  // G15 break-it, built in: dropping the FloatingChat entry must be caught.
  it("break-it: an unregistered FloatingChat is reported", () => {
    expect(unregistered(SPINE.filter((e) => e.file !== "src/FloatingChat.tsx"))).toContain("src/FloatingChat.tsx");
    expect(untaggedBlocks("src/FloatingChat.tsx").some((b) => b.includes("<section>")) || STRICT).toBe(true); // true until SP-01 moves the FAQ out
  });
});
