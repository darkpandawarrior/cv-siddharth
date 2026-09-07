/**
 * `npm run refresh` — every generator, in order, and NONE of them skipped
 * because an earlier one failed.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * This used to be an 18-link `&&` chain in package.json. `&&` means the first
 * non-zero exit silences every generator after it, and that is the mechanism
 * behind the two worst pipeline failures this repo has had:
 *
 *   - The daily job exited 1 for eight consecutive days (2026-08-20 to 08-27)
 *     on ONE dead regex in gen-hiresignal-stats, which sits fifth. The
 *     thirteen generators after it did not run at all for eight days.
 *   - chessDeep.ts reached 29 days stale while its own freshness alarm stayed
 *     green, because gen:chess-deep runs seventeenth and simply never
 *     executed.
 *
 * The commit step in refresh-media.yml was already changed to `always()` so
 * "one dead generator must not discard the work of the other 26". This is the
 * other half of that same fix: one dead generator must not PREVENT the work of
 * the other 26 either. A step that fails is reported and the run still goes
 * red — it just stops taking seventeen healthy steps down with it.
 *
 * Order is still sequential and still matters (gen:images consumes rasters the
 * steps above it write; gen:system-prompt reads the profile everything else
 * has finished updating), so this is not a parallel runner and should not
 * become one.
 *
 * The order itself now comes from scripts/generators.mjs — one topological
 * sort over real inputs/outputs, not a second hand-kept list next to
 * package.json's that could quietly drift from it again.
 */
import { spawnSync } from "node:child_process";
import { REFRESH_STEPS as STEPS } from "./generators.mjs";

const failed = [];
const started = Date.now();

for (const step of STEPS) {
  process.stdout.write(`\n──── ${step} ────\n`);
  const res = spawnSync("npm", ["run", step], { stdio: "inherit", shell: false });
  // A signal (SIGINT from a human, SIGKILL from the OOM killer) is not a
  // generator that failed — stop rather than march through the remaining ones.
  if (res.signal) {
    console.error(`\n[refresh] ${step} killed by ${res.signal} — stopping.`);
    process.exit(1);
  }
  if (res.status !== 0) failed.push(step);
}

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n──── refresh summary (${mins} min) ────`);
console.log(`  ${STEPS.length - failed.length}/${STEPS.length} generators OK`);

if (failed.length) {
  console.error(`  FAILED: ${failed.join(", ")}`);
  // Still red, so a broken generator is never silently tolerated — but every
  // other generator has now run, and the workflow's always() commit step keeps
  // their output.
  process.exit(1);
}
console.log("  all generators OK");
