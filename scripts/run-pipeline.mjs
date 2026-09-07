/**
 * `node scripts/run-pipeline.mjs build` — the ONE call package.json's
 * prebuild/predev make now, replacing both the old 15-link `&&` chain and
 * this repo's brief detour through an embedded CLI at the bottom of
 * scripts/generators.mjs itself.
 *
 * ── WHY A SEPARATE FILE, NOT generators.mjs's OWN CLI ───────────────────
 * generators.mjs is the one typed manifest every consumer reads from
 * (BUILD_CHAIN, REFRESH_STEPS, CHECK_DETERMINISTIC) — including this file,
 * refresh.mjs and check-generated.mjs. A runner embedded in the same module
 * would be a fourth consumer with its own failure semantics living inside
 * the source of truth, which is the exact "three disagreeing lists" shape
 * this manifest exists to end. Keeping it here instead means generators.mjs
 * stays data (+ the topological sort + the build-stage kind guard); this
 * file is the only place that decides how a stage actually gets *run*.
 *
 * ── FAILURE SEMANTICS ────────────────────────────────────────────────────
 * Every remaining node still runs after one fails — the same "report at the
 * end, don't march the healthy 26 down with the dead one" fix refresh.mjs
 * already made for the exact reason its own docstring documents (an 8-day
 * silent skip, a 29-day-stale file). The old embedded CLI kept `&&`'s
 * fail-fast semantics for the build stage specifically; that is what let a
 * single broken generator hide every prerender/type error behind it rather
 * than reporting its own failure plainly alongside theirs.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { BUILD_CHAIN, root } from "./generators.mjs";

const stage = process.argv[2];
if (stage !== "build") {
  console.error("usage: node scripts/run-pipeline.mjs build");
  process.exit(1);
}

const failed = [];
const started = Date.now();

for (const node of BUILD_CHAIN) {
  process.stdout.write(`\n──── ${node.id} ────\n`);
  const res = spawnSync("node", [join(root, "scripts", node.script)], { stdio: "inherit" });
  // A signal (SIGINT, SIGKILL from OOM) is not a generator that failed — stop
  // rather than march through the remaining ones, same rule as refresh.mjs.
  if (res.signal) {
    console.error(`\n[run-pipeline] ${node.id} killed by ${res.signal} — stopping.`);
    process.exit(1);
  }
  if (res.status !== 0) failed.push(node.id);
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n──── build pipeline summary (${secs}s) ────`);
console.log(`  ${BUILD_CHAIN.length - failed.length}/${BUILD_CHAIN.length} generators OK`);

if (failed.length) {
  console.error(`  FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("  all generators OK");
