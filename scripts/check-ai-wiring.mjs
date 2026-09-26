// Fails when an AI system is only partially wired: a server endpoint with no
// client that calls it, a client with no consumer that renders what it
// returns, or a consumer reading a system whose endpoint was never built.
//
// WHY THIS EXISTS (idea-atlas SYS-11). The AI audit found the SAME defect
// class four times across the KMP family: a backend built, and never wired
// to a client anyone could reach. A mechanical gate is the only thing that
// catches that reliably once a repo has more than one AI-touching surface.
//
// THE MARKER CONVENTION, adopted from kmp-app-template's docs/ai-wiring.md.
// A single-line comment names the system it belongs to:
//   // ai-endpoint: <system>   the server function that runs it
//   // ai-client: <system>     the one place that calls that endpoint
//   // ai-consumer: <system>   a component that renders what the client returns
// A real system carries all three, same <system> id. Missing any one of
// them is exactly "built the backend, never wired the client" (or the
// client/consumer-side sibling of that same gap).
//
// Zero markers anywhere is not a failure: the convention has nothing to
// check yet, which is different from failing to honour it.
//
// Run standalone: `node scripts/check-ai-wiring.mjs`, or against specific
// files: `node scripts/check-ai-wiring.mjs <file...>` (what
// check-ai-wiring.test.mjs uses against a temp fixture).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MARKER_KINDS = ["endpoint", "client", "consumer"];
const MARKER_RE = /\/\/\s*ai-(endpoint|client|consumer):\s*([a-z][a-z0-9-]*)/g;

// Readable text extensions only, the same allowlist shape check-old-names.mjs
// uses: markers live in prose and code comments, never in a binary artefact.
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".mdx"]);

// This scanner's own pattern source and its test fixtures: scanning them
// would just be the script failing on the documentation of its own rule.
const SELF_EXEMPT_FILES = new Set(["scripts/check-ai-wiring.mjs", "scripts/check-ai-wiring.test.mjs"]);

/** { endpoint: Map<system, path[]>, client: Map<...>, consumer: Map<...> } */
export function findMarkers(files) {
  const kinds = Object.fromEntries(MARKER_KINDS.map((k) => [k, new Map()]));
  for (const { path, content } of files) {
    MARKER_RE.lastIndex = 0;
    let m;
    while ((m = MARKER_RE.exec(content))) {
      const [, kind, system] = m;
      const bucket = kinds[kind];
      if (!bucket.has(system)) bucket.set(system, []);
      bucket.get(system).push(path);
    }
  }
  return kinds;
}

/** One human-readable failure string per system missing any marker kind. */
export function checkWiring(files) {
  const { endpoint, client, consumer } = findMarkers(files);
  const systems = new Set([...endpoint.keys(), ...client.keys(), ...consumer.keys()]);
  const failures = [];
  for (const system of [...systems].sort()) {
    const gaps = [];
    if (!endpoint.has(system)) gaps.push("ai-endpoint");
    if (!client.has(system)) gaps.push("ai-client");
    if (!consumer.has(system)) gaps.push("ai-consumer");
    if (gaps.length) {
      failures.push(`"${system}" is missing ${gaps.join(", ")}: an AI system with no complete endpoint/client/consumer chain.`);
    }
  }
  return failures;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

export function loadFiles(list) {
  const files = [];
  for (const file of list) {
    if (SELF_EXEMPT_FILES.has(file)) continue;
    const ext = file.slice(file.lastIndexOf("."));
    if (!TEXT_EXT.has(ext)) continue;
    let content;
    try {
      content = readFileSync(isAbsolute(file) ? file : join(root, file), "utf8");
    } catch {
      continue; // deleted/renamed between `git ls-files` and the read
    }
    files.push({ path: file, content });
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argFiles = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const list = argFiles.length ? argFiles.map((f) => f.replace(root + "/", "")) : trackedFiles();
  const files = loadFiles(list);
  const failures = checkWiring(files);

  if (failures.length) {
    console.error(`check-ai-wiring: ${failures.length} wiring gap(s):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`check-ai-wiring: clean (${files.length} file(s) scanned).`);
}
