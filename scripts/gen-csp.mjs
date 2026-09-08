/**
 * Computes the report-only CSP header and writes it into vercel.json's
 * catch-all header rule — a build-time step, not a live one: script-src
 * carries no 'unsafe-inline', so instead every inline hydration <script>
 * TanStack Start's SSR emits gets sha256-hashed and the UNION of every
 * route's hashes is what ships in the one shared header rule (vercel.json's
 * header source is a single glob, "/(.*)", so one value has to cover every
 * document — see e2e/csp.spec.ts for the per-route enforcement check).
 *
 * Reads the already-built dist/server/server.js in-process (the same fetch
 * entry api/ssr.mjs calls) rather than spinning up a real preview server —
 * no socket, no network, deterministic given a build. Run this AFTER
 * `npm run build`, before a deploy:
 *
 *   npm run build && node scripts/gen-csp.mjs
 *
 * Not wired into the prebuild/refresh chains: every other generator there
 * produces a SOURCE file the vite build then consumes; this one consumes
 * the vite build's OWN output, so it has to run after it, not before.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildCspHeader } from "../src/lib/csp.ts";
import { PERSON_LD, PROFILEPAGE_LD } from "../src/lib/structuredData.ts";
import { surfaces } from "../src/data/surfaces.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntryPath = join(root, "dist", "server", "server.js");
const vercelJsonPath = join(root, "vercel.json");

if (!existsSync(serverEntryPath)) {
  console.error("[gen-csp] dist/server/server.js is missing — run `npm run build` first.");
  process.exit(1);
}

// Same route universe a11y.spec.ts scans: every registered surface plus one
// representative each of the two $param routes (which need a concrete slug
// to render at all).
const ROUTES = ["/", "/read/deadline", "/project/doori", ...surfaces.map((s) => s.to)];

const { default: serverEntry } = await import(serverEntryPath);

// __root.tsx's `scripts:` head entries never render into the server-sent
// HTML on any route (see src/lib/csp.ts's buildCspHeader docstring) — hashed
// directly from the same constants rather than relying on any one crawled
// route's raw body to happen to contain them.
const hashes = new Set([
  createHash("sha256").update(JSON.stringify(PERSON_LD), "utf8").digest("base64"),
  createHash("sha256").update(JSON.stringify(PROFILEPAGE_LD), "utf8").digest("base64"),
]);
for (const path of ROUTES) {
  let res = await serverEntry.fetch(new Request(`http://localhost${path}`));
  // A route redirecting to its own default query (e.g. /excelsior -> ?year=…
  // &page=1) is a real render, not a broken one — follow the one hop rather
  // than refusing to write a policy over it.
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    res = await serverEntry.fetch(new Request(new URL(res.headers.get("location"), "http://localhost")));
  }
  if (!res.ok) {
    console.error(`[gen-csp] ${path} -> HTTP ${res.status}, refusing to write a policy from a broken render`);
    process.exit(1);
  }
  const html = await res.text();
  // Non-greedy, DOTALL: matches every <script>…</script> WITHOUT a src
  // attribute (an inline hydration payload), not the many <script src=...>
  // module/chunk tags — those load via script-src 'self' already.
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = m[1];
    if (!body.trim()) continue;
    hashes.add(createHash("sha256").update(body, "utf8").digest("base64"));
  }
}

const header = buildCspHeader([...hashes].sort());

const config = JSON.parse(readFileSync(vercelJsonPath, "utf8"));
const catchAll = config.headers.find((h) => h.source === "/(.*)");
if (!catchAll) {
  console.error('[gen-csp] vercel.json has no "/(.*)" header rule to attach the policy to.');
  process.exit(1);
}
const key = "Content-Security-Policy-Report-Only";
const existing = catchAll.headers.find((h) => h.key === key);
if (existing) existing.value = header;
else catchAll.headers.push({ key, value: header });

writeFileSync(vercelJsonPath, JSON.stringify(config, null, 2) + "\n");
console.log(`[gen-csp] ${ROUTES.length} routes, ${hashes.size} distinct inline-script hashes, wrote vercel.json`);
