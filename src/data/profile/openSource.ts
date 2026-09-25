// Split from profile.ts along its export seams (arch-L15).
import { upstreamStars } from "../careerOpsUpstream.ts";
import { fleetStats } from "../store.ts";

// ── Shared foundation ─────────────────────────────────────────────────────
// Two of my own KMP libraries that both Doori and PaymentsLab-KMP consume as
// composite builds — the "systems engineering" thread that ties the apps
// together. Verified in each app's settings.gradle.kts.
export interface SharedLib {
  name: string;
  url: string;
  role: string;
  usedBy: string[];
}

export const sharedFoundation: {
  blurb: string;
  libs: SharedLib[];
} = {
  blurb:
    "Doori, PaymentsLab-KMP, Candidai and Gaddi aren't four isolated demos. They're four KMP apps sitting on a common foundation I built and maintain separately. All four pull in my own convention-plugin and MVI-base libraries as composite builds, so the build wiring and the unidirectional-state contract are written once and reused, exactly the platform discipline I bring to a codebase at scale.",
  libs: [
    {
      name: "kmp-build-logic",
      url: "https://github.com/darkpandawarrior/kmp-build-logic",
      role: "Gradle convention plugins: one place that configures every KMP module's targets, Compose, lint and test wiring.",
      usedBy: ["Doori", "PaymentsLab-KMP", "Candidai", "Gaddi"],
    },
    {
      name: "kmp-toolkit",
      url: "https://github.com/darkpandawarrior/kmp-toolkit",
      role: "A vendored KMP toolkit: the tiny (State, Event) → Effects mvi-core base (the reducer/store contract the payment state machine is built on), plus shared feedback/common modules.",
      usedBy: ["Doori", "PaymentsLab-KMP", "Candidai", "Gaddi"],
    },
  ],
};

export interface Contribution {
  repo: string;
  title: string;
  url: string;
  status: "merged" | "open" | "closed";
  date: string;
  /** GitHub org the repo sits under — career-ops-hq and openMF (Mifos) today.
   *  Consumers group by this, never by parsing `repo`, so the career-ops
   *  heading can never accidentally claim an openMF/Mifos row. */
  org: string;
}

// Real public open-source contributions — PRs against career-ops (a public
// OSS project) and openMF/Mifos (three repos he has actually opened a PR
// against, not every repo he has forked).
// See https://github.com/career-ops-hq/career-ops/pulls?q=author%3Adarkpandawarrior
/**
 * Merged PRs upstream to career-ops-hq/career-ops specifically, as `gh pr
 * list` reports it. openMF/Mifos has its own total, `mifosMergedPRs` in
 * careerOpsUpstream.ts, because the two upstreams are unrelated projects and
 * a single combined count would let one hide the other's drift.
 *
 * NOT openSource.filter(career-ops).length. That's a CURATED subset — 17
 * entries against 24 merged — and candidaiNumbers.test.ts documents shorter
 * as expected. ResumeView used the array length and so printed 17 while every
 * other surface on the site said 18, which is the kind of one-off
 * disagreement a reader notices and an owner never does.
 *
 * Refreshed by scripts/gen-oss-stats.mjs alongside upstreamStats and
 * mifosMergedPRs.
 */
export const upstreamMergedPRs = 24;

export const openSource: Contribution[] = [
  { repo: "career-ops-hq/career-ops", title: "fix(deps): make js-yaml imports work on both 4.x and 5.x", url: "https://github.com/career-ops-hq/career-ops/pull/2656", status: "merged", date: "2026-08-12", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(scan): take the shared lock for scan-history.tsv appends", url: "https://github.com/career-ops-hq/career-ops/pull/2639", status: "merged", date: "2026-08-12", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(agent-inbox): concurrent adds silently dropped queued requests", url: "https://github.com/career-ops-hq/career-ops/pull/2614", status: "merged", date: "2026-08-12", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(liveness): a rate-limited posting was classified expired, not uncertain", url: "https://github.com/career-ops-hq/career-ops/pull/2613", status: "merged", date: "2026-08-12", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(cv-facts): a k/M/B magnitude suffix let an inflated claim past the gate", url: "https://github.com/career-ops-hq/career-ops/pull/2612", status: "merged", date: "2026-08-12", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "feat(rank): opt-in LLM relevance re-ranker for pipeline.md", url: "https://github.com/career-ops-hq/career-ops/pull/2579", status: "merged", date: "2026-08-12", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(cv): Korean and Traditional Chinese CVs had no font rule", url: "https://github.com/career-ops-hq/career-ops/pull/2616", status: "merged", date: "2026-08-11", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(states): aliases the engine accepts were missing from states.yml", url: "https://github.com/career-ops-hq/career-ops/pull/2615", status: "merged", date: "2026-08-11", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(web): states.yml cached for the process lifetime, so core updates go unseen", url: "https://github.com/career-ops-hq/career-ops/pull/2590", status: "merged", date: "2026-08-07", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(scan): --company/--posted-after/--posted-before ignored in =value form", url: "https://github.com/career-ops-hq/career-ops/pull/2589", status: "merged", date: "2026-08-07", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(cv): $-patterns in candidate text splice the template into the CV", url: "https://github.com/career-ops-hq/career-ops/pull/2588", status: "merged", date: "2026-08-07", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(dedup): distinct non-Latin companies merged into one, deleting a row", url: "https://github.com/career-ops-hq/career-ops/pull/2587", status: "merged", date: "2026-08-07", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(cover): a custom template's unfilled {{TOKEN}} shipped into the letter", url: "https://github.com/career-ops-hq/career-ops/pull/2586", status: "merged", date: "2026-08-07", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "feat(agent-inbox): queue requests for the next session", url: "https://github.com/career-ops-hq/career-ops/pull/1472", status: "merged", date: "2026-07-03", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "fix(dashboard): rewrite only the Status cell on status update", url: "https://github.com/career-ops-hq/career-ops/pull/1186", status: "merged", date: "2026-06-23", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "feat(providers): add Breezy HR provider", url: "https://github.com/career-ops-hq/career-ops/pull/1185", status: "merged", date: "2026-06-23", org: "career-ops-hq" },
  { repo: "career-ops-hq/career-ops", title: "feat(providers): add BambooHR provider", url: "https://github.com/career-ops-hq/career-ops/pull/1141", status: "merged", date: "2026-06-20", org: "career-ops-hq" },
  // Still open, not merged — see gen-oss-stats.mjs. Listed because it
  // is real, current, in-flight work, and left labelled "open" rather than
  // hidden: D5 in trove-map.md defaults to showing open Mifos/career-ops PRs
  // with their real status.
  { repo: "career-ops-hq/career-ops", title: "fix(apply): the code-fence strip reached inside JSON string values", url: "https://github.com/career-ops-hq/career-ops/pull/3302", status: "open", date: "2026-08-25", org: "career-ops-hq" },
  // openMF/Mifos: a separate, unrelated upstream (the Mifos/openMF Kotlin
  // Multiplatform banking-app template and its CI tooling), not career-ops.
  // Every row below carries org: "openMF" so no consumer can misgroup it
  // under the career-ops heading.
  { repo: "openMF/kmp-project-template", title: "fix(core-base/common): un-swap default and io in the Android dispatchers", url: "https://github.com/openMF/kmp-project-template/pull/298", status: "merged", date: "2026-09-18", org: "openMF" },
  { repo: "openMF/kmp-project-template", title: "fix(ci): guard the empty successful_tasks expansion in ci-prepush.sh", url: "https://github.com/openMF/kmp-project-template/pull/299", status: "merged", date: "2026-09-18", org: "openMF" },
  { repo: "openMF/mifos-passcode-cmp", title: "fix(passcode): keep the chosen length when a 6-digit confirmation fails", url: "https://github.com/openMF/mifos-passcode-cmp/pull/82", status: "open", date: "2026-08-31", org: "openMF" },
  { repo: "openMF/mifos-x-actionhub", title: "fix(deployment-status): declare appstore_issuer_id as a secret", url: "https://github.com/openMF/mifos-x-actionhub/pull/89", status: "open", date: "2026-08-31", org: "openMF" },
];

export interface GrowthItem {
  date: string;
  title: string;
  detail: string;
}

// Recent shipping timeline — "what I've built in the last few weeks".
export const recentGrowth: GrowthItem[] = [
  { date: "Jun 2026", title: "Gaddi (formerly Kursi) shipped", detail: "Full Kotlin Multiplatform social-deduction game across Android, iOS, desktop and web. Deterministic engine + ISMCTS AI." },
  { date: "Jun - Aug 2026", title: "career-ops: public OSS contributions", detail: `24 merged PRs to the public career-ops project (${upstreamStars} stars): ATS providers (BambooHR, Breezy HR), an opt-in LLM relevance re-ranker, an agent-inbox feature, and a run of correctness fixes covering silent data loss on non-Latin company names, a $-pattern splicing the template into a generated CV, a date filter ignored in its =value form, a concurrency race that dropped queued requests, and an unlocked append to shared scan history.` },
  { date: "Jun 2026", title: "Doori (formerly Mileway): five platforms", detail: "Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, plus Glance/WidgetKit widgets and an iOS Live Activity. 159 Roborazzi tests green." },
  { date: "Jul 2026", title: "Doori: offline AI + policy engine", detail: "Retrieval-grounded chat over local data with voice I/O, a reimbursement-rate policy engine and a durable submit-outbox, offline-first with a real backend opt-in." },
  { date: "Jul 2026", title: "PaymentsLab-KMP (formerly PaymentsLab): 5 rails + 66 gateways", detail: "44-module KMP payments lab: payouts, mandates, card vault, marketplace Connect and a double-entry wallet ledger beyond one-shot pay-in, all MOCK_MODE-honest." },
  { date: "Jul 2026", title: "Shared KMP foundation", detail: "Extracted kmp-build-logic (convention plugins) and kmp-toolkit (MVI base) as my own libraries, consumed by Doori and PaymentsLab-KMP as composite builds." },
  { date: "Jul 2026", title: "Doori: super-profile & plugin platform (V24)", detail: "A plugin-composition registry (TILE/CAPABILITY/VALUE, FORCED>USER>PRESET>DEFAULT layering) driving four persona presets, plus delegation, verification, growth, membership and wallet/payout depth. Shipped, with a V25→V37 series (on-device intelligence, JWT auth, closeout hardening, home cards/advances, What's New) landed on top." },
  { date: "Aug 2026", title: "Portfolio: the fleet made checkable", detail: `New /shipped page: ${fleetStats.live} live listings plus ${fleetStats.delisted} delisted ones recovered via the Internet Archive, ${fleetStats.live + fleetStats.delisted} apps traced across ${fleetStats.branches.toLocaleString("en-US")} branches of the Jugnoo white-label platform, verified one store listing at a time instead of asserted.` },
  { date: "Aug 2026", title: "Portfolio: the anthology and The Board, published", detail: "New /ink surfaces: the Morkinstar Journals anthology across four seasons (The Directory, The Ninety-One Pages, The Kindling, The Standing Charge) plus a starmap, and The Board, seven years of forum games, mined and republished." },
];

