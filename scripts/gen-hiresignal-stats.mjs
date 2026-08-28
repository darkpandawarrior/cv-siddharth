// Refreshes the two fastest-drifting HireSignal numbers (merged PR count,
// provider count) in profile.ts via targeted regex — santifer/career-ops
// merges provider PRs regularly, so these go stale faster than anything else
// on the site. The rest of the project card stays hand-curated prose. A fetch
// error or a suspicious count leaves profile.ts untouched and exits 0; a DEAD
// PATTERN, which is a repo bug rather than a network blip, writes what it can
// and then exits non-zero so `npm run refresh` says so. Nothing here runs in
// prebuild, so neither outcome can break a deploy.
//
// Points at santifer/career-ops (public, the real verified upstream Siddharth
// contributes to) — NOT kirklazar-android/hiresignal, which is a private repo
// owned by a third party where Siddharth is one of several collaborators.
// That repo's PR/provider counts describe someone else's project, not his
// public open-source contribution, and don't belong in this portfolio's
// automated numbers. profile.ts's `upstreamMergedPRs` is the single value this
// script's PR count writes, and `openSource` is the deliberately shorter
// curated list of those PRs — see the comment on `upstreamMergedPRs` for why
// the two are not the same number, and do not put a count in this comment.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithTimeout } from "./lib/net.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const profilePath = join(root, "src", "data", "profile.ts");
const fanoutPath = join(root, "src", "labs", "FanoutLab.tsx");
const hiresignalPath = join(root, "src", "data", "hiresignal.ts");
const token = process.env.GITHUB_TOKEN;
const headers = { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function prCount() {
  const res = await fetchWithTimeout(
    "https://api.github.com/search/issues?q=repo:santifer/career-ops+type:pr+is:merged+author:darkpandawarrior",
    { headers },
  );
  if (!res.ok) throw new Error(`${res.status} PR search`);
  return (await res.json()).total_count;
}

async function providerCount() {
  const res = await fetchWithTimeout("https://api.github.com/repos/santifer/career-ops/contents/providers", { headers });
  if (!res.ok) throw new Error(`${res.status} providers dir`);
  const list = await res.json();
  // Upstream's own convention: infra files are underscore-prefixed, provider modules aren't.
  return list.filter((f) => f.type === "file" && !f.name.startsWith("_") && /\.m?js$/.test(f.name)).length;
}

try {
  const [prs, providers] = await Promise.all([prCount(), providerCount()]);
  if (!prs || !providers) throw new Error(`suspicious counts prs=${prs} providers=${providers} — refusing to write`);
  /* A regex that stops matching is the failure mode this script was built to
   * have. Eleven chained .replace() calls silently no-op when the prose beside
   * a number is reworded, and every one of them looked like it was still doing
   * its job — that is how the case study came to print 76 providers and 62 on
   * the same page. So every substitution now reports whether it hit anything.
   *
   * The misses are collected rather than thrown: throwing lands in this file's
   * own catch, which by design only warns, and a throw before the write would
   * sacrifice the ten good replacements to the one dead one — freezing every
   * number over a single reworded sentence. */
  const misses = [];
  let src = readFileSync(profilePath, "utf8");
  const sub = (re, to) => {
    if (!(src.match(re) || []).length) misses.push(`${re} (profile.ts)`);
    src = src.replace(re, to);
  };

  sub(/"\d+ ATS\/board providers"/, `"${providers} ATS/board providers"`);
  sub(/\d+ ATS & job-board provider integrations/, `${providers} ATS & job-board provider integrations`);
  // Four more sites this script could not see until 2026-08-24, and which had
  // therefore frozen while the ones above kept moving: the case study said 76
  // providers and 62 providers on the same page, and 17 merged PRs and 4 merged
  // PRs. Every number below is the same fact as one above, so it belongs to the
  // same refresh or it goes stale again by definition.
  sub(/\{ value: "\d+", label: "ATS & job-board providers" \}/, `{ value: "${providers}", label: "ATS & job-board providers" }`);
  sub(/\d+ ATS & job-board provider modules/, `${providers} ATS & job-board provider modules`);
  sub(/"\d+ ATS\/job-board providers"/, `"${providers} ATS/job-board providers"`);
  sub(/\{ value: "\d+", label: "PRs merged upstream" \}/, `{ value: "${prs}", label: "PRs merged upstream" }`);
  /* REMOVED, not repaired: `cardMedia`'s hand-written alt text.
   *
   * This pattern maintained the "HireSignal — active, 24 PRs merged upstream"
   * string in profile.ts's cardMedia map. It had already gone dead once when
   * the house dash sweep turned that em dash into a colon, and the daily
   * refresh exited 1 for eight straight days (2026-08-20 to 08-27) — and
   * because it dies at this step, every later step stopped running, which is
   * how chessDeep.ts reached 29 days stale while its own alarm stayed green.
   *
   * The string is gone for good now: cardMedia is derived from the registry
   * (`alt: `${p.name}: ${p.status}``), and `status` is kept current by the
   * `status: "Active · N PRs merged to public career-ops"` substitution above.
   * So the alt text still carries a live PR count — it just inherits it
   * instead of keeping a second copy for this script to chase. One less
   * hand-written surface is one less pattern that can quietly stop matching.
   */
  // Three more, found the same day, that the patterns above missed because they
  // word the same fact differently ("merged to public career-ops", not "merged
  // upstream"). Matching the NUMBER beside the phrase rather than a whole
  // sentence keeps this working when the prose is edited.
  sub(/\d+ merged PRs to the public career-ops project/g, `${prs} merged PRs to the public career-ops project`);
  // A third wording of the same fact, "merged pull requests AGAINST the public
  // career-ops REPOSITORY", which neither the "to the public career-ops
  // project" pattern nor the digit scan could reach.
  sub(/\d+ merged pull requests against the public career-ops repository/g, `${prs} merged pull requests against the public career-ops repository`);
  sub(/status: "Active · \d+ PRs merged to public career-ops"/, `status: "Active · ${prs} PRs merged to public career-ops"`);
  // The single source the résumé prints, so it stops disagreeing with the rest
  // of the site by using the curated array's length instead.
  sub(/export const upstreamMergedPRs = \d+;/, `export const upstreamMergedPRs = ${prs};`);
  writeFileSync(profilePath, src);

  // The Fan-out Lab's ring size lives in its own file, so it needs its own
  // write — chaining it onto profile.ts's contents would never have matched.
  // It was a bare 62 while this same script kept profile.ts at 78: the lab
  // understating the very work it exists to demonstrate.
  const fanoutRe = /const TOTAL_PROVIDERS = \d+;/;
  const fanout = readFileSync(fanoutPath, "utf8");
  if (!fanoutRe.test(fanout)) misses.push(`${fanoutRe} (FanoutLab.tsx)`);
  writeFileSync(fanoutPath, fanout.replace(fanoutRe, `const TOTAL_PROVIDERS = ${providers};`));

  /* hiresignal.ts said in its own header that this script refreshes it. It did
   * not: the file was never opened here, so providerCount sat at 78 while the
   * same run wrote 81 into the case study and the lab. A comment claiming a
   * refresh that no code performs is the quietest version of this whole bug
   * class, and hiresignalNumbers.test.ts is what finally caught it. */
  const providerRe = /export const providerCount = \d+;/;
  const hs = readFileSync(hiresignalPath, "utf8");
  if (!providerRe.test(hs)) misses.push(`${providerRe} (hiresignal.ts)`);
  writeFileSync(hiresignalPath, hs.replace(providerRe, `export const providerCount = ${providers};`));

  /* The other half of the same hole: a number this script never had a pattern
   * for at all. Reading whatever WORD sits in front of the phrase, rather than
   * \d+, is what makes "Seventeen merged pull requests" visible — a digit scan
   * could never have seen it, and it had been wrong for months.
   *
   * process.exitCode rather than throw: a dead regex is a repo bug, not the
   * network blip the catch below exists to swallow, and setting it after the
   * writes means a partial refresh still lands while `npm run refresh` fails
   * loudly enough that somebody fixes the prose. */
  for (const [, n] of src.matchAll(/(\w+) merged (?:PRs|pull requests)/g))
    if (n !== String(prs)) misses.push(`stale count "${n} merged …" in profile.ts`);
  if (misses.length) {
    console.error(`[gen-hiresignal-stats] dead patterns / stale counts:\n  ${misses.join("\n  ")}`);
    process.exitCode = 1;
  }

  console.log(`[gen-hiresignal-stats] prs=${prs} providers=${providers}`);
} catch (err) {
  console.warn("[gen-hiresignal-stats] fetch failed, leaving profile.ts untouched —", err.message);
}
