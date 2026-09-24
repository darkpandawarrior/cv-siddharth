/**
 * The "<file> was regenerated inside its SLA" alarm — moved OUT of npm test.
 *
 * WHY. It used to live in src/data/freshness.test.ts, which runs inside
 * `npm test`, which runs inside the refresh gate and the PR gate. One stale
 * file (store.ts, whose --published-only mode never restamped it) failed
 * that suite, and because `npm test` gates EVERYTHING, a staleness alarm for
 * one file was withholding every other file's refresh — the opposite of
 * "serve stale data, never block the rest." See self-healing-spec.md#2.2.
 *
 * It now runs only from the doctor (scripts/doctor.mjs, SH-4): a breach
 * there can try to heal (re-run that file's generator) or open one issue,
 * instead of just failing a build nothing downstream can act on.
 *
 * WHAT IT CHECKS. Reads max(generatedAt, verifiedAt) per watched file against
 * freshnessSla.ts's per-file SLA. `verifiedAt` exists for exactly one file
 * today: gen-store's storeVerifiedAt, stamped only by a --published-only run
 * that re-verified the committed listings without re-mining them (G13's one
 * exception, M62). A watched file with NEITHER stamp readable is treated the
 * same as a breach — an unstamped file is not "fresh", it is unknowable, and
 * silence is exactly what this alarm exists to refuse.
 *
 * WHAT STAYS IN THE TEST. Structural assertions — a stamp parses, every file
 * in MUST_BE_STAMPED is covered — are a generator regressing at commit time,
 * not data going stale, so they stay in freshness.test.ts where a green CI
 * already looks. Watched here = MUST_BE_STAMPED, plus anything else present
 * that already carries a stamp (parity with the scan freshness.test.ts did):
 * an ordinary hand-written file in src/data with no stamp is not this
 * check's business, so it is never dragged in just by existing.
 *
 * Usage: node scripts/check-freshness.mjs [--json] [--dir <path>]
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { slaFor, MUST_BE_STAMPED, STAMP_RE, generatorFor, ageDays } from "../src/data/freshnessSla.ts";

/** The other stamp shape check-freshness reads: store.ts's storeVerifiedAt
 *  (or, generically, any `verifiedAt`/`*VerifiedAt`). Same two shapes
 *  STAMP_RE already knows for generatedAt — see its own comment. */
const VERIFIED_RE = /(?:"verifiedAt":|[A-Za-z]*[Vv]erifiedAt\s*=)\s*"(\d{4}-\d{2}-\d{2})/;

function scan(dir) {
  if (!existsSync(dir)) return [];
  const present = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const read = (f) => readFileSync(join(dir, f), "utf8");
  // MUST_BE_STAMPED is watched whether or not it happens to carry a stamp
  // (that IS the failure mode); anything else present is watched only if it
  // already stamps itself.
  const watched = present.filter((f) => MUST_BE_STAMPED.includes(f) || STAMP_RE.test(read(f)));

  return watched.map((file) => {
    const src = read(file);
    const generatedAt = STAMP_RE.exec(src)?.[1] ?? null;
    const verifiedAt = VERIFIED_RE.exec(src)?.[1] ?? null;
    const newest = [generatedAt, verifiedAt].filter(Boolean).sort().at(-1) ?? null;
    const sla = slaFor(file);
    const age = newest ? ageDays(newest) : null;
    return { file, generatedAt, verifiedAt, age, sla, ok: age !== null && age <= sla };
  });
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const dirFlag = args.indexOf("--dir");
const dir =
  dirFlag >= 0 && args[dirFlag + 1]
    ? args[dirFlag + 1]
    : join(dirname(fileURLToPath(import.meta.url)), "..", "src/data");

const rows = scan(dir);
const breaches = rows.filter((r) => !r.ok);

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  for (const r of rows) {
    console.log(
      r.ok
        ? `OK     ${r.file}  ${r.age}d / SLA ${r.sla}d`
        : `STALE  ${r.file}  ${r.age === null ? "no stamp" : `${r.age}d / SLA ${r.sla}d`}`,
    );
  }
}

for (const r of breaches) {
  console.error(
    r.age === null
      ? `${r.file} carries no generatedAt or verifiedAt stamp — the freshness alarm cannot see it. ` +
          `Run \`${generatorFor(r.file)}\` and read what it prints.`
      : `${r.file} past SLA (${r.age} days, SLA ${r.sla}) — either its generator is failing silently, ` +
          `or the job never reached it. Run \`${generatorFor(r.file)}\` and read what it prints.`,
  );
}

process.exit(breaches.length ? 1 : 0);
