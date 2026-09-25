/**
 * A representative fixture `Ledger`, exercising every GRAMMAR rule (G1-G17)
 * with real-shaped-but-fake data: two entries at one employer (footbridge),
 * a curated org with a cairn remainder (pr-stone), an unmeasured lesson and
 * archive entry, a delisted fleet listing, and a chess ridge with real
 * per-format peaks.
 *
 * Cast `as unknown as Ledger` rather than typed inline: `Ledger`'s nested
 * `ProjectStats` field is `typeof` the real, `as const` committed data —
 * a literal type pinned to TODAY's exact numbers — so no other object can
 * structurally satisfy it. grammar.ts already reads every `projectStats`
 * field through a local cast for the same reason (see its G3/G14 sections).
 */
import type { Ledger } from "../../ledger.ts";

function buildRawLedger() {
  return {
    generatedAt: "2026-06-30T00:00:00.000Z",
    timeline: {
      generatedAt: "2026-06-30T00:00:00.000Z",
      from: "2026-01",
      to: "2026-06",
      months: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
      lanes: [
        {
          key: "work",
          label: "work",
          unit: "deliverables",
          resolution: "month",
          source: "fixture",
          months: { "2026-01": 1, "2026-02": 2, "2026-03": 2, "2026-04": 3, "2026-05": 3, "2026-06": 4 },
          total: 15,
          peak: { ym: "2026-06", v: 4 },
          milestones: [
            { ym: "2026-01", lane: "work", kind: "role", label: "Joined Acme Corp" },
            { ym: "2026-04", lane: "work", kind: "delivered", label: "Shipped the fixture platform" },
          ],
        },
        {
          key: "opensource",
          label: "open source",
          unit: "contributions",
          resolution: "month",
          source: "fixture",
          months: { "2026-01": 0, "2026-02": 3, "2026-03": 0, "2026-04": 5, "2026-05": 12, "2026-06": 40 },
          total: 60,
          peak: { ym: "2026-06", v: 40 },
          milestones: [{ ym: "2026-06", lane: "opensource", kind: "oss", label: "fixture-org/fixture-repo fix(x)" }],
        },
      ],
    },
    experience: [
      {
        company: "Acme Corp",
        role: "Engineer",
        period: "January 2026 - March 2026",
        location: "Pune, India",
        points: [{ text: "Shipped the first cut" }],
      },
      {
        company: "Acme Corp",
        role: "Senior Engineer",
        period: "April 2026 - Present",
        location: "Pune, India",
        points: [{ text: "Owned the platform" }, { text: "Led the rewrite" }],
      },
      {
        company: "Globex",
        role: "Contractor",
        period: "October 2024 - December 2025",
        location: "Remote, India",
        points: [{ text: "Built the pipeline" }],
      },
    ],
    openSource: [
      { repo: "career-ops-hq/career-ops", title: "fix(a)", url: "https://example.com/pr/1", status: "merged", date: "2026-05-01", org: "career-ops-hq" },
      { repo: "career-ops-hq/career-ops", title: "fix(b)", url: "https://example.com/pr/2", status: "merged", date: "2026-05-15", org: "career-ops-hq" },
      { repo: "career-ops-hq/career-ops", title: "fix(c)", url: "https://example.com/pr/3", status: "merged", date: "2026-06-01", org: "career-ops-hq" },
      { repo: "career-ops-hq/career-ops", title: "wip(d)", url: "https://example.com/pr/4", status: "open", date: "2026-06-10", org: "career-ops-hq" },
      { repo: "other-org/other-repo", title: "fix(e)", url: "https://example.com/pr/5", status: "merged", date: "2026-04-01", org: "other-org" },
    ],
    // 3 itemised above for career-ops-hq; upstreamMergedPRs (career-ops-hq's
    // own total, per Ledger's own field) is 5 -> a cairn of 2. other-org has
    // no special-cased total, so its 1 itemised merged entry is its whole
    // count (D5: "adding one openSource entry changes G6's itemised count
    // by one, and no other rule").
    upstreamMergedPRs: 5,
    upstreamStars: "10k+",
    projectStats: {
      foundation: { modules: 10, providerModules: 4, conventionPlugins: 3 },
      doori: { modules: 36, features: 5, cores: 4 },
      gaddi: { modules: 6 },
      "paymentslab-kmp": { gatewaysNative: 2, gatewaysHosted: 3, gatewaysMobileMoney: 1, gatewaysInternal: 1, gatewaysStub: 1 },
    },
    systemGraph: { generatedAt: "2026-06-30", nodes: [], edges: [] },
    writing: {
      lessons: [
        { title: "Lesson One", slug: "lesson-one", created: "2026-05-01", project: "fixture", links: {}, reactions: 40 },
        { title: "Lesson Two", slug: "lesson-two", created: "2026-06-01", project: "fixture", links: {} },
        { title: "Lesson Three", slug: "lesson-three", created: "2026-06-15", project: "fixture", links: {} },
      ],
      series: [],
      archive: [
        { title: "Old Piece", slug: "old-piece", era: "2019", words: 2000 },
        { title: "Undated Piece", slug: "undated-piece" },
      ],
      cast: [],
    },
    chess: {
      generatedAt: "2026-06-30T00:00:00.000Z",
      username: "fixture",
      activityByYear: [
        { year: "2024", lichess: 300, chesscom: 0 },
        { year: "2025", lichess: 400, chesscom: 100 },
        { year: "2026", lichess: 200, chesscom: 250 },
      ],
      platforms: [
        {
          id: "lichess",
          peaks: [
            { format: "bullet", rating: 1600, at: "2025-02-01" },
            { format: "blitz", rating: 1650, at: "2025-08-01" },
            { format: "rapid", rating: 1500, at: "2024-11-01" },
          ],
        },
        {
          id: "chesscom",
          peaks: [
            { format: "blitz", rating: 1400, at: "2026-01-01" },
            { format: "bullet", rating: 1200, at: "2025-06-01" },
          ],
        },
      ],
    },
    weeb: {
      generatedAt: "2026-06-30",
      anime: { byWatch: { Watching: 2, Completed: 5, Paused: 1, "To Watch": 10, Ongoing: 1 } },
      manga: { byRead: { Completed: 1, Reading: 2 } },
    },
    fleet: {
      live: [
        { id: "com.fixture.one", name: "Fixture One", installs: "1M+", firstSeen: "20220101" },
        { id: "com.fixture.two", name: "Fixture Two", installs: "500K+", firstSeen: null },
      ],
      delisted: [{ id: "com.fixture.three", name: "Fixture Three", firstSeen: "20210601" }],
      stats: { installFloor: 1500000, live: 2, delisted: 1 },
    },
    history: [
      { ym: "2026-01", commits: 10, insertions: 100, deletions: 10, filesChanged: 5, subjects: [], cumulative: { commits: 10, insertions: 100, deletions: 10 } },
      { ym: "2026-02", commits: 50, insertions: 500, deletions: 50, filesChanged: 20, subjects: [], cumulative: { commits: 60, insertions: 600, deletions: 60 } },
      { ym: "2026-03", commits: 60, insertions: 600, deletions: 60, filesChanged: 25, subjects: [], cumulative: { commits: 120, insertions: 1200, deletions: 120 } },
    ],
  };
}

export function buildFixtureLedger(): Ledger {
  return buildRawLedger() as unknown as Ledger;
}
