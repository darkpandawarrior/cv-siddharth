// Fails when the client bundle exceeds a ceiling in budgets.json.
//
// WHY THIS EXISTS. There is no bundle tooling anywhere in this repo — every
// chunk boundary (what merges into the homepage entry, what becomes a shared
// chunk, what stays on its own) is an unreviewed side effect of Rollup's
// default heuristic, and it could double with no signal. It already has:
// react-dom and the scheduler ride inside the homepage's own route chunk, 39
// forced modulepreloads add up before a single user click, and a 1.6+ MB
// SketchBoard chunk landed with no design even noticing.
//
// budgets.json's ceilings are set to TODAY's measured bytes — this gate is a
// ratchet, not a target. It cannot go green by itself; a real regression
// fails it, and a deliberate size increase requires a reviewed, human edit to
// budgets.json, never a silent one.
//
// WHAT "eager JS" MEANS HERE. TanStack Start's client build has exactly ONE
// Vite entry (its own default-entry/client.tsx) shared by every route; each
// `src/routes/*.tsx` file is its own dynamically-imported split point on top
// of that. So "the homepage's forced JS" is not one chunk, it is the STATIC
// (`imports`, never `dynamicImports`) import graph reachable from the route's
// own manifest key — exactly the set Vite emits as <link rel="modulepreload">
// for that route, which already transitively includes the shared entry.
//
// ponytail: only "/" is budgeted today (the one route the council's findings
// and metrics named). Add a route to budgets.json's `routes` array when its
// own cold-load weight is worth gating — the mechanism below is already
// per-route, so that's a one-line addition, not a rewrite.
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "dist", "client");
const manifestPath = join(clientDir, ".vite", "manifest.json");
const budgets = JSON.parse(readFileSync(join(root, "budgets.json"), "utf8"));

if (!existsSync(manifestPath)) {
  console.error(`check-budget: no manifest at ${manifestPath} — run \`npx vite build\` first.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const sizeOf = (file) => {
  const p = join(clientDir, file);
  return existsSync(p) ? statSync(p).size : 0;
};
const transferOf = (file) => {
  const p = join(clientDir, file);
  return existsSync(p) ? gzipSync(readFileSync(p)).length : 0;
};

/** The STATIC import graph reachable from `key` — never `dynamicImports`,
 *  those are the lazy chunks a budget exists to keep lazy. */
function eagerGraph(key, seen = new Set()) {
  if (seen.has(key) || !manifest[key]) return seen;
  seen.add(key);
  for (const imp of manifest[key].imports ?? []) eagerGraph(imp, seen);
  return seen;
}

function eagerBytes(key) {
  const files = new Set();
  let raw = 0;
  let transfer = 0;
  for (const k of eagerGraph(key)) {
    for (const f of [manifest[k].file, ...(manifest[k].css ?? [])]) {
      if (!f || files.has(f)) continue;
      files.add(f);
      raw += sizeOf(f);
      transfer += transferOf(f);
    }
  }
  return { raw, transfer, fileCount: files.size };
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

const report = [];
const failures = [];
// arch-L14: the same pass/fail this loop already computes, kept as data
// instead of only as a console line, so /ops can render a real row rather
// than re-deriving one from text. One entry per check below, in the same
// order the console report prints them.
const checks = [];

for (const route of budgets.routes) {
  if (!(route.entry in manifest)) {
    failures.push(`route "${route.route}": no manifest entry "${route.entry}" — it was renamed or removed; update budgets.json`);
    checks.push({ name: `route "${route.route}" raw`, actual: null, ceiling: route.rawBytes, pass: false });
    continue;
  }
  const { raw, transfer, fileCount } = eagerBytes(route.entry);
  report.push(`route "${route.route}" (${manifest[route.entry].file}, ${fileCount} forced files): raw ${raw.toLocaleString("en-US")} B (ceiling ${route.rawBytes.toLocaleString("en-US")}), transfer ${transfer.toLocaleString("en-US")} B (ceiling ${route.transferBytes.toLocaleString("en-US")})`);
  checks.push({ name: `route "${route.route}" raw JS`, actual: raw, ceiling: route.rawBytes, pass: raw <= route.rawBytes });
  checks.push({ name: `route "${route.route}" transfer JS`, actual: transfer, ceiling: route.transferBytes, pass: transfer <= route.transferBytes });
  if (raw > route.rawBytes) {
    failures.push(`route "${route.route}": eager JS raw ${raw.toLocaleString("en-US")} B > ceiling ${route.rawBytes.toLocaleString("en-US")} B (chunk ${manifest[route.entry].file})`);
  }
  if (transfer > route.transferBytes) {
    failures.push(`route "${route.route}": eager JS transfer ${transfer.toLocaleString("en-US")} B > ceiling ${route.transferBytes.toLocaleString("en-US")} B (chunk ${manifest[route.entry].file})`);
  }
}

// Largest single chunk anywhere in the client manifest — the ceiling that
// would have caught SketchBoard on day one instead of via a council audit.
let largest = { file: null, bytes: 0 };
for (const key of Object.keys(manifest)) {
  const file = manifest[key].file;
  if (!file?.endsWith(".js")) continue;
  const bytes = sizeOf(file);
  if (bytes > largest.bytes) largest = { file, bytes };
}
report.push(`largest chunk: ${largest.file} — ${largest.bytes.toLocaleString("en-US")} B (ceiling ${budgets.largestChunkBytes.toLocaleString("en-US")})`);
checks.push({ name: "largest chunk", actual: largest.bytes, ceiling: budgets.largestChunkBytes, pass: largest.bytes <= budgets.largestChunkBytes });
if (largest.bytes > budgets.largestChunkBytes) {
  failures.push(`largest chunk ${largest.file} is ${largest.bytes.toLocaleString("en-US")} B > ceiling ${budgets.largestChunkBytes.toLocaleString("en-US")} B`);
}

// Named chunks get their own standing report line regardless of whether they
// are still the single largest — SketchBoard should stay visible even the day
// something else overtakes it.
for (const [name, ceiling] of Object.entries(budgets.namedChunks ?? {})) {
  const file = Object.values(manifest).find((c) => c.file?.includes(name))?.file;
  if (!file) {
    report.push(`named chunk "${name}": not found in this build (dropped, or renamed)`);
    checks.push({ name: `named chunk "${name}"`, actual: null, ceiling, pass: true });
    continue;
  }
  const bytes = sizeOf(file);
  report.push(`named chunk "${name}": ${file} — ${bytes.toLocaleString("en-US")} B (ceiling ${ceiling.toLocaleString("en-US")})`);
  checks.push({ name: `named chunk "${name}"`, actual: bytes, ceiling, pass: bytes <= ceiling });
  if (bytes > ceiling) {
    failures.push(`named chunk "${name}" (${file}) is ${bytes.toLocaleString("en-US")} B > ceiling ${ceiling.toLocaleString("en-US")} B`);
  }
}

// Total deploy size: everything Vercel ships from dist/client today,
// public/*-app included — moving those to an asset origin is a different
// lane's job, and this ceiling ratchets down with it rather than assuming it.
const totalBytes = dirSize(clientDir);
report.push(`total dist/client: ${totalBytes.toLocaleString("en-US")} B (ceiling ${budgets.totalDeploySizeBytes.toLocaleString("en-US")})`);
checks.push({ name: "total dist/client", actual: totalBytes, ceiling: budgets.totalDeploySizeBytes, pass: totalBytes <= budgets.totalDeploySizeBytes });
if (totalBytes > budgets.totalDeploySizeBytes) {
  failures.push(`dist/client total ${totalBytes.toLocaleString("en-US")} B > ceiling ${budgets.totalDeploySizeBytes.toLocaleString("en-US")} B`);
}

// arch-L14: written UNCONDITIONALLY, before the pass/fail decides whether to
// exit — so a failing budget still ships its own red row. This is the ONLY
// mechanism that gets a budget result in front of a visitor: ci.yml's own
// `vite build` is a throwaway (see the comment at the top of this file), so
// this file has to come from the SAME build Vercel actually deploys. That
// build runs `npm run build` (vercel.json's buildCommand), and npm invokes
// this script automatically as `postbuild` (package.json) — the exact
// mechanism `prebuild`/`predev` already rely on, not a new one. Written into
// dist/client so it ships as a same-origin static file in this deploy, never
// a client-writable channel: nothing at request time can change what it says
// short of a new deploy.
writeFileSync(
  join(clientDir, "evidence-budget.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), checks, failing: failures.length > 0 }, null, 2),
);

console.log(report.join("\n"));

if (failures.length) {
  console.error(
    "\ncheck-budget: a ceiling was exceeded.\n\n" +
      failures.map((f) => "  " + f).join("\n") +
      "\n\nEither this is a real regression (shrink it), or the growth is deliberate " +
      "and budgets.json needs a reviewed, human raise — never a silent one.\n",
  );
  process.exit(1);
}

console.log("\ncheck-budget: all ceilings held.");
