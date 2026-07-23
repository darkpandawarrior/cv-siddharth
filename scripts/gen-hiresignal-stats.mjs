// Refreshes the two fastest-drifting HireSignal numbers (merged PR count,
// provider count) in profile.ts via targeted regex — santifer/career-ops
// merges provider PRs regularly, so these go stale faster than anything else
// on the site. The rest of the project card stays hand-curated prose. Never
// fails the build: leaves profile.ts untouched on any fetch error or
// suspicious count.
//
// Points at santifer/career-ops (public, the real verified upstream Siddharth
// contributes to) — NOT kirklazar-android/hiresignal, which is a private repo
// owned by a third party where Siddharth is one of several collaborators.
// That repo's PR/provider counts describe someone else's project, not his
// public open-source contribution, and don't belong in this portfolio's
// automated numbers. See profile.ts's `openSourceContributions` for the
// actual 4 merged PRs this script's count should always match.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const profilePath = join(root, "src", "data", "profile.ts");
const token = process.env.GITHUB_TOKEN;
const headers = { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function prCount() {
  const res = await fetch(
    "https://api.github.com/search/issues?q=repo:santifer/career-ops+type:pr+is:merged+author:darkpandawarrior",
    { headers },
  );
  if (!res.ok) throw new Error(`${res.status} PR search`);
  return (await res.json()).total_count;
}

async function providerCount() {
  const res = await fetch("https://api.github.com/repos/santifer/career-ops/contents/providers", { headers });
  if (!res.ok) throw new Error(`${res.status} providers dir`);
  const list = await res.json();
  // Upstream's own convention: infra files are underscore-prefixed, provider modules aren't.
  return list.filter((f) => f.type === "file" && !f.name.startsWith("_") && /\.m?js$/.test(f.name)).length;
}

try {
  const [prs, providers] = await Promise.all([prCount(), providerCount()]);
  if (!prs || !providers) throw new Error(`suspicious counts prs=${prs} providers=${providers} — refusing to write`);
  let src = readFileSync(profilePath, "utf8");
  src = src
    .replace(/"\d+ ATS\/board providers"/, `"${providers} ATS/board providers"`)
    .replace(/\d+ ATS & job-board provider integrations/, `${providers} ATS & job-board provider integrations`)
    .replace(/Contributor upstream — \d+ merged PRs/, `Contributor upstream — ${prs} merged PRs`)
    .replace(/status: "Active · \d+ PRs merged upstream"/, `status: "Active · ${prs} PRs merged upstream"`);
  writeFileSync(profilePath, src);
  console.log(`[gen-hiresignal-stats] prs=${prs} providers=${providers}`);
} catch (err) {
  console.warn("[gen-hiresignal-stats] fetch failed, leaving profile.ts untouched —", err.message);
}
