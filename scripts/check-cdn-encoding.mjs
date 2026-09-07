// Owner-run, post-deploy: confirms the CDN actually serves the five bundled
// WASM apps Brotli-encoded, rather than trusting vercel.json's headers config
// to mean what it says. Immutable caching (`max-age=31536000, immutable`) is
// built and verified for all five; whether the response BODY is small enough
// to matter was never checked against the deployed edge — only asserted.
//
// Reads the actual filenames out of each app's own public/ directory (they're
// content-hashed on every build, deadlock-app aside) rather than hardcoding a
// hash that goes stale the next time one of these rebuilds.
//
// Usage: node scripts/check-cdn-encoding.mjs [base-url]
//   base-url defaults to the production deployment.
import { readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "https://cv-siddharth.vercel.app";

// public/<dir>-app — the five bundled WASM apps this repo embeds live.
const APPS = ["kursi-app", "paymentslab-app", "mileway-app", "portfolio-app", "deadlock-app"];

function firstWasmFile(dir) {
  const full = join("public", dir);
  const wasm = readdirSync(full).find((f) => f.endsWith(".wasm"));
  if (!wasm) throw new Error(`no .wasm file found under public/${dir}`);
  return wasm;
}

async function checkOne(dir) {
  const file = firstWasmFile(dir);
  const url = `${BASE}/${dir}/${file}`;
  const res = await fetch(url, { headers: { "Accept-Encoding": "br, gzip" } });
  const encoding = res.headers.get("content-encoding");
  const cache = res.headers.get("cache-control");
  return { dir, file, url, status: res.status, encoding, cache };
}

const results = await Promise.all(APPS.map(checkOne));

// A 404 means this local checkout's build hash isn't the one currently
// deployed (expected on a branch ahead of production) — not a Brotli defect,
// so it's reported but doesn't fail the check. Only a reachable response
// that comes back WITHOUT br is the thing this script exists to catch.
let ok = true;
for (const r of results) {
  const stale = r.status === 404;
  const brotli = r.encoding === "br";
  if (!stale && !brotli) ok = false;
  const verdict = stale ? "STALE (hash not deployed yet)" : brotli ? "OK" : "FAIL — no br encoding";
  console.log(`${verdict.padEnd(30)} ${r.dir.padEnd(16)} status=${r.status} content-encoding=${r.encoding ?? "(none)"} cache-control="${r.cache ?? ""}" — ${r.url}`);
}

console.log(ok ? "\ncheck-cdn-encoding: every reachable WASM file served Brotli-encoded." : "\ncheck-cdn-encoding: FAILED — see above.");
process.exit(ok ? 0 : 1);
