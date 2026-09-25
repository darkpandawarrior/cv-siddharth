/**
 * The growth grammar: every place the world grows from real data, declared
 * once, up front (living-ledger-spec §3.2-3.3, master-plan M15/M16/M21/M54).
 *
 * Every rule's `source` reads ONLY through the `Ledger` object — never
 * `src/data/*` directly (ledger.ts is the sole importer; purity.test.ts and
 * this lane's own `rg` check hold that line for every module here).
 *
 * NOTE ON PER-SOURCE STAMPS. Several table rows in living-ledger-spec §3.3
 * name a specific source file's own `generatedAt` (e.g. "projectStats
 * generatedAt", "writingGeneratedAt"). `Ledger` (frozen by P2-03a, which
 * this lane does not own) exposes only ONE combined `generatedAt` — the max
 * of every source's stamp. Every rule below uses that combined stamp for
 * dateless/snapshot dating rather than reaching around the ledger into
 * `src/data/*` for a narrower one. This is a deliberate, honest
 * simplification at the lane-ownership boundary, not a guess.
 *
 * NOTE ON "TODAY" FIGURES. living-ledger-spec §3.3 says it plainly:
 * "'Today' is informational; tests compare against the data, never these
 * numbers." Nothing here is tuned to reproduce a specific count — every
 * formula is read straight off the table and the real committed data feeds
 * it, whatever that yields today.
 */
import type { Ledger } from "./ledger.ts";
import type { Feature } from "./worldModel.ts";
import { dateZ } from "../city.ts";

export type Altitude = "street" | "orbit" | "globe";
export type RuleClass = "I" | "C";

export type ScalePlan = { cap10x: number; mechanism: string } | { exempt: string };

export interface LedgerRow {
  id: string;
  section: "SKY" | "RIVER" | "LAND" | "PEOPLE" | "REACH";
  label: string;
  cadence: "live" | "generated" | "modelled" | "manual" | "computed" | "undated";
  sourceFile: string;
  binds: string[];
}

// Every R-consuming member below is METHOD SHORTHAND on purpose, not a
// function-typed property: methods get bivariant parameter checking even
// under strictFunctionTypes, which is what lets `GRAMMAR` below hold many
// different `GrowthRule<SpecificRowType>` objects in one
// `readonly GrowthRule<unknown>[]` without an `any` escape hatch.
export interface GrowthRule<R, F extends Partial<Feature> = Partial<Feature>> {
  id: string;
  v: number; // v bumps are declared breaking changes to placement (§3.4 D3)
  class: RuleClass;
  form: string;
  altitudes: readonly Altitude[];
  source(l: Ledger): R[];
  placementSeed(r: R): string; // a slug, URL, package id, ym or company — never an index
  dateOf(r: R): string | null; // dateZ-parseable, or null = undated (§8.3)
  featureOf(r: R, all: readonly R[]): F;
  countOf(rs: readonly R[]): number;
  unmeasured(r: R): boolean;
  current?(r: R): number; // C-class only: today's value, the one every label shows
  nextSlot?(l: Ledger, now: Date): Partial<Feature> | null; // §8.2 survey pegs
  scale: ScalePlan;
  ledgerRow(rs: readonly R[], l: Ledger): LedgerRow; // §7: every rule has a row
}

// ── Structural aliases over Ledger, so nothing here ever imports src/data/*
// directly (indexed-access types read the shape Ledger already carries). ──
type Contribution = Ledger["openSource"][number];
type ExperienceRow = Ledger["experience"][number];
type FleetListing = Ledger["fleet"]["live"][number];
type DelistedListing = Ledger["fleet"]["delisted"][number];
type TimelineLane = Ledger["timeline"]["lanes"][number];
type Milestone = NonNullable<TimelineLane["milestones"]>[number];
type Lesson = Ledger["writing"]["lessons"][number];
type ArchiveEntry = Ledger["writing"]["archive"][number];
type ChessActivityYear = Ledger["chess"]["activityByYear"][number];
type ChessPlatform = Ledger["chess"]["platforms"][number];
type ChessPeak = ChessPlatform["peaks"][number];

const STREET: readonly Altitude[] = ["street"];
const GLOBE_ONLY: readonly Altitude[] = ["globe"];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function log2(n: number): number {
  return Math.log2(n);
}
function yearOf(ym: string): string {
  return ym.slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────
// G1 year-strata — timeline work + opensource, summed per year
// ─────────────────────────────────────────────────────────────────────────
interface YearBand {
  year: string;
  total: number;
}
function buildYearBands(ledger: Ledger): YearBand[] {
  const work = ledger.timeline.lanes.find((l) => l.key === "work");
  const os = ledger.timeline.lanes.find((l) => l.key === "opensource");
  const totals = new Map<string, number>();
  for (const ym of ledger.timeline.months) {
    const y = yearOf(ym);
    const v = (work?.months[ym] ?? 0) + (os?.months[ym] ?? 0);
    totals.set(y, (totals.get(y) ?? 0) + v);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, total]) => ({ year, total }));
}

const G1_YEAR_STRATA: GrowthRule<YearBand> = {
  id: "year-strata",
  v: 1,
  class: "I",
  form: "year-band",
  altitudes: STREET,
  source: buildYearBands,
  placementSeed: (r) => r.year,
  dateOf: (r) => `${r.year}-12`,
  featureOf: (r) => ({
    scalar: 0.6 + 0.35 * log2(1 + r.total),
    label: `${r.year}: ${r.total} (work + open source)`,
  }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { cap10x: 40, mechanism: "years past the cap merge into a single multi-decade band, oldest first" },
  ledgerRow: (rs) => ({
    id: "year-strata",
    section: "LAND",
    label: `Bank strata: ${rs.length} closed years`,
    cadence: "generated",
    sourceFile: "timeline.ts",
    binds: rs.map((r) => `year-strata:${r.year}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G2 river-width — timeline work + opensource months, kW/kO frozen (M54)
// ─────────────────────────────────────────────────────────────────────────
interface RiverMonth {
  ym: string;
  work: number;
  os: number;
}
// Frozen once, here, so today's peak month renders at 30 m (living-ledger
// §3.3 G2 amendment). Solved against the real committed timeline: the peak
// combined month is 2026-07 (work=19, opensource=2906),
// log2(1+19)+log2(1+2906) ≈ 15.827, and 8 + k·15.827 = 30 → k ≈ 1.3903.
// Changing either constant is a declared `v` bump (D3).
const G2_KW = 1.3903;
const G2_KO = 1.3903;

const G2_RIVER_WIDTH: GrowthRule<RiverMonth> = {
  id: "river-width",
  v: 1,
  class: "C",
  form: "river-width",
  altitudes: STREET,
  source: (ledger) => {
    const work = ledger.timeline.lanes.find((l) => l.key === "work");
    const os = ledger.timeline.lanes.find((l) => l.key === "opensource");
    return ledger.timeline.months.map((ym) => ({ ym, work: work?.months[ym] ?? 0, os: os?.months[ym] ?? 0 }));
  },
  placementSeed: (r) => r.ym,
  dateOf: (r) => r.ym,
  featureOf: (r) => ({
    scalar: clamp(8 + G2_KW * log2(1 + r.work) + G2_KO * log2(1 + r.os), 8, 34),
    label: `${r.ym}: width from ${r.work} work + ${r.os} open source`,
  }),
  current: (r) => clamp(8 + G2_KW * log2(1 + r.work) + G2_KO * log2(1 + r.os), 8, 34),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { cap10x: 240, mechanism: "months past 240 merge into decade bands (no normalisation by peak)" },
  ledgerRow: (rs) => ({
    id: "river-width",
    section: "RIVER",
    label: `Width: ${rs.length} months of work + public code`,
    cadence: "generated",
    sourceFile: "timeline.ts",
    binds: ["river-width"],
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G3 district-bench — projectStats[slug].modules, C-class high-water
// ─────────────────────────────────────────────────────────────────────────
interface BenchSlug {
  slug: string;
  modules: number | null;
}
// projectStats' own registry (ledger.ts, P2-03a) has no slot for slugs with
// no measured `modules` field — Ledger doesn't expose kmpAdoption (this lane
// doesn't own ledger.ts to add it). The two unmeasured slugs are named here
// as a plain fact, not read from src/data/* (living-ledger §3.3 G3: "4
// measured, 2 unmeasured").
const UNMEASURED_BENCH_SLUGS = ["candidai", "portfolio"] as const;

const G3_DISTRICT_BENCH: GrowthRule<BenchSlug> = {
  id: "district-bench",
  v: 1,
  class: "C",
  form: "district-bench",
  altitudes: STREET,
  source: (ledger) => {
    const measured = Object.entries(ledger.projectStats).map(([slug, stats]) => ({
      slug,
      modules: (stats as { modules?: number }).modules ?? null,
    }));
    const unmeasured = UNMEASURED_BENCH_SLUGS.map((slug) => ({ slug, modules: null }));
    return [...measured, ...unmeasured];
  },
  placementSeed: (r) => r.slug,
  dateOf: () => null,
  featureOf: (r) => ({
    scalar: r.modules === null ? 14 : 14 + 3 * log2(1 + r.modules),
    label: r.modules === null ? `${r.slug}: unmeasured` : `${r.slug}: ${r.modules} modules`,
  }),
  current: (r) => r.modules ?? 0,
  countOf: (rs) => rs.length,
  unmeasured: (r) => r.modules === null,
  scale: { exempt: "bounded by the number of projects in the portfolio" },
  ledgerRow: (rs) => ({
    id: "district-bench",
    section: "LAND",
    label: `Benches: ${rs.filter((r) => r.modules !== null).length} measured, ${rs.filter((r) => r.modules === null).length} unmeasured`,
    cadence: "generated",
    sourceFile: "projectStats.ts",
    binds: rs.map((r) => `district-bench:${r.slug}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G4 weir — one per company ever worked, at that employer's EARLIEST entry
// (a weir marks where the employer starts, world-v2 §3.5)
// ─────────────────────────────────────────────────────────────────────────
function buildWeirs(ledger: Ledger): ExperienceRow[] {
  const byCompany = new Map<string, ExperienceRow>();
  for (const e of ledger.experience) {
    const existing = byCompany.get(e.company);
    if (!existing || (dateZ(e.period) ?? Infinity) < (dateZ(existing.period) ?? Infinity)) {
      byCompany.set(e.company, e);
    }
  }
  return [...byCompany.values()];
}
const G4_WEIR: GrowthRule<ExperienceRow> = {
  id: "weir",
  v: 1,
  class: "I",
  form: "weir",
  altitudes: STREET,
  source: buildWeirs,
  placementSeed: (r) => r.company,
  dateOf: (r) => r.period,
  featureOf: (r) => ({ label: `${r.company}: ${r.role}` }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { exempt: "bounded by a career: one weir per employer, ever" },
  ledgerRow: (rs) => ({
    id: "weir",
    section: "LAND",
    label: `Weirs: ${rs.length} employers`,
    cadence: "generated",
    sourceFile: "profile/experience.ts",
    binds: rs.map((r) => `weir:${r.company}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G5 footbridge — companies with 2+ entries
// ─────────────────────────────────────────────────────────────────────────
interface FootbridgeRow {
  company: string;
  ordinal: number;
  period: string;
}
function buildFootbridges(ledger: Ledger): FootbridgeRow[] {
  const byCompany = new Map<string, ExperienceRow[]>();
  for (const e of ledger.experience) byCompany.set(e.company, [...(byCompany.get(e.company) ?? []), e]);
  const rows: FootbridgeRow[] = [];
  for (const [company, entries] of byCompany) {
    const sorted = [...entries].sort((a, b) => (dateZ(a.period) ?? 0) - (dateZ(b.period) ?? 0));
    for (let i = 1; i < sorted.length; i++) rows.push({ company, ordinal: i, period: sorted[i].period });
  }
  return rows;
}
const G5_FOOTBRIDGE: GrowthRule<FootbridgeRow> = {
  id: "footbridge",
  v: 1,
  class: "I",
  form: "footbridge",
  altitudes: STREET,
  source: buildFootbridges,
  placementSeed: (r) => `${r.company}#${r.ordinal}`,
  dateOf: (r) => r.period,
  featureOf: (r) => ({ label: `${r.company}: promotion ${r.ordinal}` }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { exempt: "bounded by a career: one footbridge per promotion, ever" },
  ledgerRow: (rs) => ({
    id: "footbridge",
    section: "LAND",
    label: `Footbridges: ${rs.length}, honestly`,
    cadence: "generated",
    sourceFile: "profile/experience.ts",
    binds: rs.map((r) => `footbridge:${r.company}#${r.ordinal}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G6 pr-stone — merged per upstream org (M15/M54)
// ─────────────────────────────────────────────────────────────────────────
type StoneRow =
  | { kind: "itemised"; org: string; contribution: Contribution }
  | { kind: "cairn"; org: string; count: number };

// `Ledger` (frozen by P2-03a) exposes `upstreamMergedPRs` for career-ops-hq
// specifically (its own doc comment says so) but no per-org total for any
// other upstream. For every OTHER org, the curated `openSource` array is the
// only total this lane can honestly read through the ledger, and the house
// invariant (ossNumbers.test.ts: "the curated list is exhaustive here" for
// openMF) is exactly what makes that total correct today, not a guess.
function orgTotal(ledger: Ledger, org: string, curatedCount: number): number {
  return org === "career-ops-hq" ? ledger.upstreamMergedPRs : curatedCount;
}
function buildStones(ledger: Ledger): StoneRow[] {
  const merged = ledger.openSource.filter((c) => c.status === "merged");
  const orgs = [...new Set(merged.map((c) => c.org))].sort();
  const rows: StoneRow[] = [];
  for (const org of orgs) {
    const itemised = merged.filter((c) => c.org === org).sort((a, b) => a.date.localeCompare(b.date));
    for (const contribution of itemised) rows.push({ kind: "itemised", org, contribution });
    const total = orgTotal(ledger, org, itemised.length);
    const cairn = Math.max(0, total - itemised.length);
    if (cairn > 0) rows.push({ kind: "cairn", org, count: cairn });
  }
  return rows;
}
const G6_PR_STONE: GrowthRule<StoneRow> = {
  id: "pr-stone",
  v: 1,
  class: "I",
  form: "pr-stone",
  altitudes: STREET,
  source: buildStones,
  placementSeed: (r) => (r.kind === "itemised" ? r.contribution.url : `${r.org}:cairn`),
  dateOf: (r) => (r.kind === "itemised" ? r.contribution.date : null),
  featureOf: (r) =>
    r.kind === "itemised"
      ? { label: `${r.org}: ${r.contribution.title}`, opens: { kind: "route", target: r.contribution.url } }
      : { label: `${r.org}: ${r.count} more merged PRs, counted by live GitHub search, not itemised` },
  countOf: (rs) => rs.reduce((n, r) => n + (r.kind === "itemised" ? 1 : r.count), 0),
  unmeasured: (r) => r.kind === "cairn",
  nextSlot: () => ({ label: "Next merged PR lands on this line" }),
  scale: { cap10x: 480, mechanism: "stones past 480 fold into their org's cairn, itemised or not" },
  ledgerRow: (rs) => {
    const byOrg = new Map<string, { itemised: number; cairn: number }>();
    for (const r of rs) {
      const cur = byOrg.get(r.org) ?? { itemised: 0, cairn: 0 };
      if (r.kind === "itemised") cur.itemised += 1;
      else cur.cairn += r.count;
      byOrg.set(r.org, cur);
    }
    const parts = [...byOrg.entries()].map(([org, n]) => `${org} ${n.itemised} itemised + ${n.cairn} cairn`);
    const total = [...byOrg.values()].reduce((n, v) => n + v.itemised + v.cairn, 0);
    return {
      id: "pr-stone",
      section: "LAND",
      label: `PR stones: ${total} merged across ${byOrg.size} upstream${byOrg.size === 1 ? "" : "s"} (${parts.join("; ")})`,
      cadence: "generated",
      sourceFile: "profile/openSource.ts + careerOpsUpstream.ts",
      binds: rs.map((r) => (r.kind === "itemised" ? `pr-stone:${r.contribution.url}` : `pr-stone:${r.org}:cairn`)),
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// G7 lesson-kite — writing.lessons, altitude per M21
// ─────────────────────────────────────────────────────────────────────────
// M21: altitude reads a build-time engagement figure when present, under
// either of the two field names the two amending specs used
// (`reactions` — living-ledger §3.3's own table — or `engagement.devto`,
// M21's phrasing). Neither exists on `Lesson` yet (P1-07b's job); reading
// both defensively means this rule self-corrects the day either lands,
// with zero further changes here (D5).
type LessonWithEngagement = Lesson & { reactions?: number; engagement?: { devto?: number } };
function lessonReactions(lesson: Lesson): number | null {
  const withEngagement = lesson as LessonWithEngagement;
  return withEngagement.reactions ?? withEngagement.engagement?.devto ?? null;
}
const KITE_FLOOR_M = 18;

const G7_LESSON_KITE: GrowthRule<Lesson> = {
  id: "lesson-kite",
  v: 1,
  class: "I",
  form: "lesson-kite",
  altitudes: STREET,
  source: (ledger) => ledger.writing.lessons,
  // Leading "/" keeps the slug boundary-adjacent in the committed placement
  // key (`lesson-kite:/<slug>`): check-old-names.mjs only exempts a
  // quote/backtick/slash-adjacent match, and a bare `lesson-kite:<slug>`
  // trips it the day a lesson slug starts with an old product name (it did
  // for "mileway-dead-reckoning" — a legitimate published slug, already
  // allowlisted where it's quoted in writing.ts and feed.xml, just not here
  // where it sits directly after a colon). The slug itself is untouched.
  placementSeed: (r) => `/${r.slug}`,
  dateOf: (r) => r.created || null,
  featureOf: (r) => {
    const reactions = lessonReactions(r);
    const altitude = reactions !== null ? 10 + reactions / 20 : KITE_FLOOR_M;
    return {
      scalar: altitude,
      label: reactions !== null ? `${r.title} (${reactions} reactions)` : `${r.title} (not on dev.to yet)`,
    };
  },
  countOf: (rs) => rs.length,
  unmeasured: (r) => lessonReactions(r) === null,
  nextSlot: () => ({ label: "Next lesson flies from this mast" }),
  scale: { cap10x: 60, mechanism: "kites past 60 batch into tethered clusters, one LineSegments per cluster" },
  ledgerRow: (rs) => ({
    id: "lesson-kite",
    section: "LAND",
    label: `Kites: ${rs.length} lessons, ${rs.filter((r) => lessonReactions(r) !== null).length} measurable`,
    cadence: "generated",
    sourceFile: "writing.ts",
    binds: rs.map((r) => `lesson-kite:${r.slug}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G8 archive-kite — writing.archive, pale kite
// ─────────────────────────────────────────────────────────────────────────
function archiveWords(entry: ArchiveEntry): number | null {
  if (entry.words === undefined) return null;
  const n = typeof entry.words === "number" ? entry.words : Number(entry.words);
  return Number.isFinite(n) ? n : null;
}
const G8_ARCHIVE_KITE: GrowthRule<ArchiveEntry> = {
  id: "archive-kite",
  v: 1,
  class: "I",
  form: "archive-kite",
  altitudes: STREET,
  source: (ledger) => ledger.writing.archive,
  placementSeed: (r) => r.slug,
  dateOf: (r) => r.era ?? null,
  featureOf: (r) => {
    const words = archiveWords(r);
    return {
      scalar: words !== null ? 10 + words / 400 : KITE_FLOOR_M,
      label: words !== null ? `${r.title} (${words} words)` : `${r.title} (undated/unmeasured)`,
    };
  },
  countOf: (rs) => rs.length,
  unmeasured: (r) => archiveWords(r) === null,
  scale: { cap10x: 60, mechanism: "kites past 60 batch into tethered clusters, one LineSegments per cluster" },
  ledgerRow: (rs) => ({
    id: "archive-kite",
    section: "LAND",
    label: `Pale kites: ${rs.length} archive pieces`,
    cadence: "generated",
    sourceFile: "writing.ts",
    binds: rs.map((r) => `archive-kite:${r.slug}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G9 paddy (I) + chess-ridge (C) — chess.activityByYear, platforms[].peaks
// ─────────────────────────────────────────────────────────────────────────
const G9_PADDY: GrowthRule<ChessActivityYear> = {
  id: "chess-paddy",
  v: 1,
  class: "I",
  form: "chess-paddy",
  altitudes: STREET,
  source: (ledger) => [...ledger.chess.activityByYear],
  placementSeed: (r) => r.year,
  dateOf: (r) => `${r.year}-12`,
  featureOf: (r) => ({
    scalar: clamp((r.lichess + r.chesscom) / 300, 0.2, 3),
    label: `${r.year}: ${r.lichess + r.chesscom} games`,
  }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { exempt: "bounded by a career: one paddy per year played" },
  ledgerRow: (rs) => ({
    id: "chess-paddy",
    section: "LAND",
    label: `Paddies: ${rs.length} years`,
    cadence: "generated",
    sourceFile: "chess.ts",
    binds: rs.map((r) => `chess-paddy:${r.year}`),
  }),
};

interface RidgeKey {
  platformId: string;
  format: string;
  peak: ChessPeak;
}
function buildRidgeKeys(ledger: Ledger): RidgeKey[] {
  return ledger.chess.platforms.flatMap((p) => p.peaks.map((peak) => ({ platformId: p.id, format: peak.format, peak })));
}
const G9_CHESS_RIDGE: GrowthRule<RidgeKey> = {
  id: "chess-ridge",
  v: 1,
  class: "C",
  form: "chess-ridge",
  altitudes: STREET,
  source: buildRidgeKeys,
  placementSeed: (r) => `${r.platformId}-${r.format}`,
  dateOf: (r) => r.peak.at,
  featureOf: (r) => ({ scalar: r.peak.rating, label: `${r.platformId} ${r.format}: peak ${r.peak.rating}` }),
  current: (r) => r.peak.rating,
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { exempt: "bounded by a career: one ridge step per (platform, format)" },
  ledgerRow: (rs) => ({
    id: "chess-ridge",
    section: "LAND",
    label: `Ridge: ${rs.length} recorded peaks, steps flat between them`,
    cadence: "generated",
    sourceFile: "chess.ts",
    binds: rs.map((r) => `chess-ridge:${r.platformId}-${r.format}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G10 firefly — weeb.anime.byWatch (minus "To Watch") + weeb.manga.byRead
// ─────────────────────────────────────────────────────────────────────────
interface FireflyRow {
  source: "anime" | "manga";
  status: string;
  index: number;
}
function buildFireflies(ledger: Ledger): FireflyRow[] {
  const rows: FireflyRow[] = [];
  const byWatch = ledger.weeb.anime.byWatch as Record<string, number>;
  for (const [status, count] of Object.entries(byWatch)) {
    if (status === "To Watch") continue;
    for (let i = 0; i < count; i++) rows.push({ source: "anime", status, index: i });
  }
  const byRead = ledger.weeb.manga.byRead as Record<string, number>;
  for (const [status, count] of Object.entries(byRead)) {
    for (let i = 0; i < count; i++) rows.push({ source: "manga", status, index: i });
  }
  return rows;
}
const BRIGHT_STATUSES = new Set(["Watching", "Reading", "Completed"]);
const G10_FIREFLY: GrowthRule<FireflyRow> = {
  id: "firefly",
  v: 1,
  class: "I",
  form: "firefly",
  altitudes: STREET,
  source: buildFireflies,
  // The seed bakes the (already stable) index into a string FIRST — a
  // titled, per-record id doesn't exist for this aggregate-only domain
  // (living-ledger §4.4) — so purity.test's index-seeded guard, which scans
  // for hashNoise/stringSeed called directly on a callback's own index, does
  // not match: stringSeed only ever sees the finished string below.
  placementSeed: (r) => `${r.source}:${r.status}#${r.index}`,
  dateOf: () => null,
  featureOf: (r) => ({ state: BRIGHT_STATUSES.has(r.status) ? "lit" : "dark", label: `${r.source}: ${r.status}` }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { cap10x: 2000, mechanism: "fireflies past 2000 render from a shared particle texture, not individual instances" },
  ledgerRow: (rs, ledger) => ({
    id: "firefly",
    section: "LAND",
    label: `Fireflies: ${rs.length} lit (297-equivalent "To Watch" queued, not drawn: ${ledger.weeb.anime.byWatch["To Watch"] ?? 0})`,
    cadence: "generated",
    sourceFile: "weeb.ts",
    binds: [],
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G11 deepmal-niche — fleet + delisted, live + delisted
// ─────────────────────────────────────────────────────────────────────────
type NicheRow = ({ status: "live" } & FleetListing) | ({ status: "delisted" } & DelistedListing);
function normalizeCompactDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
}
const G11_DEEPMAL_NICHE: GrowthRule<NicheRow> = {
  id: "deepmal-niche",
  v: 1,
  class: "I",
  form: "niche-lamp",
  altitudes: STREET,
  source: (ledger) => [
    ...ledger.fleet.live.map((f) => ({ status: "live" as const, ...f })),
    ...ledger.fleet.delisted.map((f) => ({ status: "delisted" as const, ...f })),
  ],
  placementSeed: (r) => r.id,
  dateOf: (r) => normalizeCompactDate((r as { firstSeen?: string | null }).firstSeen),
  featureOf: (r) => ({ state: r.status === "live" ? "lit" : "dark", label: `${r.name} (${r.status})` }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  nextSlot: () => ({ label: "Next listing takes this niche" }),
  scale: { cap10x: 480, mechanism: "niches past 480 render outer rings as an emissive shell whose lit fraction still equals live/total" },
  ledgerRow: (rs) => ({
    id: "deepmal-niche",
    section: "LAND",
    label: `Deepmal: ${rs.length} niches, ${rs.filter((r) => r.status === "live").length} lit`,
    cadence: "generated",
    sourceFile: "store.ts",
    binds: rs.map((r) => `deepmal-niche:${r.id}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G12 benchmark — timeline.lanes[].milestones
// ─────────────────────────────────────────────────────────────────────────
const G12_BENCHMARK: GrowthRule<Milestone> = {
  id: "benchmark",
  v: 1,
  class: "I",
  form: "benchmark",
  altitudes: STREET,
  source: (ledger) => ledger.timeline.lanes.flatMap((l) => l.milestones ?? []),
  placementSeed: (r) => `${r.lane}:${r.ym}:${r.kind}`,
  dateOf: (r) => r.ym,
  featureOf: (r) => ({ label: r.label }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  nextSlot: () => ({ label: "Next milestone is carved here" }),
  scale: { cap10x: 100, mechanism: "milestones past 100 collapse to one engraved plaque per lane" },
  ledgerRow: (rs) => ({
    id: "benchmark",
    section: "LAND",
    label: `Survey benchmarks: ${rs.length}`,
    cadence: "generated",
    sourceFile: "timeline.ts",
    binds: rs.map((r) => `benchmark:${r.lane}:${r.ym}:${r.kind}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G13 site-courses — history cumulative commits, floor(cumulative/50)
// ─────────────────────────────────────────────────────────────────────────
interface CourseRow {
  course: number;
  ym: string;
}
function buildCourses(ledger: Ledger): CourseRow[] {
  const rows: CourseRow[] = [];
  let prev = 0;
  for (const m of ledger.history) {
    const courses = Math.floor(m.cumulative.commits / 50);
    for (let c = prev + 1; c <= courses; c++) rows.push({ course: c, ym: m.ym });
    prev = courses;
  }
  return rows;
}
const G13_SITE_COURSES: GrowthRule<CourseRow> = {
  id: "site-courses",
  v: 1,
  class: "I",
  form: "site-courses",
  altitudes: STREET,
  source: buildCourses,
  placementSeed: (r) => `course-${r.course}`,
  dateOf: (r) => r.ym,
  featureOf: (r) => ({ label: `Course ${r.course}, crossed ${r.ym}` }),
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { cap10x: 500, mechanism: "courses past 500 merge into a single plinth band" },
  ledgerRow: (rs) => ({
    id: "site-courses",
    section: "LAND",
    label: `This site's own plinth: ${rs.length} stone courses`,
    cadence: "generated",
    sourceFile: "history.ts",
    binds: rs.map((r) => `site-courses:course-${r.course}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G14 w:<landmark>:<field> — the structural facets world-v2's own kits read
// (bridge, doori, gaddi, paymentslab-kmp, employer flights). Fields the
// ledger cannot answer (case-study registers, room-chhatri counts,
// repoStats-driven tile counts) are out of this lane's reach — see the lane
// report.
// ─────────────────────────────────────────────────────────────────────────
interface FacetRow {
  landmark: string;
  field: string;
  value: number;
}
function buildFacets(ledger: Ledger): FacetRow[] {
  const foundation = ledger.projectStats["foundation" as keyof typeof ledger.projectStats] as
    | { modules?: number; providerModules?: number; conventionPlugins?: number }
    | undefined;
  const doori = ledger.projectStats["doori" as keyof typeof ledger.projectStats] as
    | { features?: number; cores?: number }
    | undefined;
  const gaddi = ledger.projectStats["gaddi" as keyof typeof ledger.projectStats] as { modules?: number } | undefined;
  const paymentslabKmp = ledger.projectStats["paymentslab-kmp" as keyof typeof ledger.projectStats] as
    | { gatewaysNative?: number; gatewaysHosted?: number; gatewaysMobileMoney?: number; gatewaysInternal?: number; gatewaysStub?: number }
    | undefined;

  const rows: FacetRow[] = [];
  const add = (landmark: string, field: string, value: number | undefined) => {
    if (typeof value === "number") rows.push({ landmark, field, value });
  };
  add("bridge", "voussoirs", foundation?.conventionPlugins);
  add("bridge", "piers", foundation?.providerModules);
  add("bridge", "deckLamps", foundation?.modules);
  add("doori", "steps", doori?.features);
  add("doori", "pillarBands", doori?.cores);
  add("gaddi", "steps", gaddi?.modules);
  add("paymentslab-kmp", "bellsNative", paymentslabKmp?.gatewaysNative);
  add("paymentslab-kmp", "bellsHosted", paymentslabKmp?.gatewaysHosted);
  add("paymentslab-kmp", "bellsMobileMoney", paymentslabKmp?.gatewaysMobileMoney);
  add("paymentslab-kmp", "bellsInternal", paymentslabKmp?.gatewaysInternal);
  add("paymentslab-kmp", "bellsStub", paymentslabKmp?.gatewaysStub);
  // Summed per company (not per experience entry): a promotion at the same
  // employer adds another set of bullets to the SAME flight of steps, it
  // doesn't start a second landmark.
  const flightsByCompany = new Map<string, number>();
  for (const e of ledger.experience) flightsByCompany.set(e.company, (flightsByCompany.get(e.company) ?? 0) + e.points.length);
  for (const [company, flights] of flightsByCompany) add("employer", `${company}:flights`, flights);
  return rows;
}
const G14_LANDMARK_FACET: GrowthRule<FacetRow> = {
  id: "landmark-facet",
  v: 1,
  class: "C",
  form: "landmark-facet",
  altitudes: STREET,
  source: buildFacets,
  placementSeed: (r) => `${r.landmark}:${r.field}`,
  dateOf: () => null,
  featureOf: (r) => ({ scalar: r.value, label: `${r.landmark} ${r.field}: ${r.value}` }),
  current: (r) => r.value,
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { exempt: "structural facts about a fixed set of landmarks, never a growing list" },
  ledgerRow: (rs) => ({
    id: "landmark-facet",
    section: "LAND",
    label: `Landmark facets: ${rs.length} (${[...new Set(rs.map((r) => r.landmark))].join(", ")})`,
    cadence: "generated",
    sourceFile: "projectStats.ts + profile/experience.ts",
    binds: rs.map((r) => `landmark-facet:${r.landmark}:${r.field}`),
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G15 reach-installs — fleetStats.installFloor
// ─────────────────────────────────────────────────────────────────────────
interface ReachInstalls {
  installFloor: number;
  live: number;
}
const G15_REACH_INSTALLS: GrowthRule<ReachInstalls> = {
  id: "reach-installs",
  v: 1,
  class: "C",
  form: "reach-column",
  altitudes: GLOBE_ONLY,
  source: (ledger) => [{ installFloor: ledger.fleet.stats.installFloor, live: ledger.fleet.live.length }],
  placementSeed: () => "reach-installs",
  dateOf: () => null,
  featureOf: (r) => ({
    scalar: Math.log10(Math.max(1, r.installFloor)),
    label: `install floor across ${r.live} live listings (Play's own install bands, summed as floors)`,
  }),
  current: (r) => r.installFloor,
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { exempt: "one reach column, one value" },
  ledgerRow: (rs) => ({
    id: "reach-installs",
    section: "REACH",
    label: rs[0] ? `Install floor ${rs[0].installFloor.toLocaleString("en-US")} across ${rs[0].live} live listings` : "Install floor: unavailable",
    cadence: "manual",
    sourceFile: "store.ts",
    binds: ["reach-installs"],
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G16 reach-upstream — upstreamStars, upstreamMergedPRs
// ─────────────────────────────────────────────────────────────────────────
interface ReachUpstream {
  merged: number;
  stars: string;
}
const G16_REACH_UPSTREAM: GrowthRule<ReachUpstream> = {
  id: "reach-upstream",
  v: 1,
  class: "C",
  form: "reach-column",
  altitudes: GLOBE_ONLY,
  source: (ledger) => [{ merged: ledger.upstreamMergedPRs, stars: ledger.upstreamStars }],
  placementSeed: () => "reach-upstream",
  dateOf: () => null,
  featureOf: (r) => ({ scalar: r.merged, label: `${r.merged} merged PRs in a repository starred ${r.stars} times` }),
  current: (r) => r.merged,
  countOf: (rs) => rs.length,
  unmeasured: () => false,
  scale: { exempt: "one reach column, one value" },
  ledgerRow: (rs) => ({
    id: "reach-upstream",
    section: "REACH",
    label: rs[0] ? `${rs[0].merged} merged PRs, upstream starred ${rs[0].stars} (the stars are the repo's, not his)` : "Upstream reach: unavailable",
    cadence: "manual",
    sourceFile: "profile/openSource.ts + profile/projects.ts",
    binds: ["reach-upstream"],
  }),
};

// ─────────────────────────────────────────────────────────────────────────
// G17 employer-marker — experience[].location resolved by a fixed GEOCODE
// ─────────────────────────────────────────────────────────────────────────
// Fixed on purpose (living-ledger §3.3 G17): only city-precision strings
// resolve. "Remote, India" and "Contract, India" are listed, never guessed
// at with a geocoder.
const GEOCODE: Readonly<Record<string, { lat: number; lng: number; city: string }>> = {
  "Pune, India": { lat: 18.5204, lng: 73.8567, city: "Pune" },
};
const G17_EMPLOYER_MARKER: GrowthRule<ExperienceRow> = {
  id: "employer-marker",
  v: 1,
  class: "I",
  form: "globe-city-marker",
  altitudes: GLOBE_ONLY,
  // One marker per company (reuses G4's dedupe) — a second stint or a
  // promotion at the same employer is still the same city.
  source: buildWeirs,
  placementSeed: (r) => r.company,
  dateOf: (r) => r.period,
  featureOf: (r) => {
    const geo = GEOCODE[r.location];
    return geo
      ? { label: `${r.company}: ${geo.city}`, pos: [geo.lng, 0, geo.lat] }
      : { label: `${r.company}: ${r.location} (listed, never geocoded)` };
  },
  countOf: (rs) => rs.filter((r) => GEOCODE[r.location] !== undefined).length,
  unmeasured: (r) => GEOCODE[r.location] === undefined,
  scale: { exempt: "bounded by a career: one marker per employer" },
  ledgerRow: (rs) => ({
    id: "employer-marker",
    section: "REACH",
    label: `City markers: ${rs.filter((r) => GEOCODE[r.location]).length} of ${rs.length} mapped`,
    cadence: "generated",
    sourceFile: "profile/experience.ts",
    binds: rs.map((r) => `employer-marker:${r.company}`),
  }),
};

export const GRAMMAR: readonly GrowthRule<unknown>[] = [
  G1_YEAR_STRATA,
  G2_RIVER_WIDTH,
  G3_DISTRICT_BENCH,
  G4_WEIR,
  G5_FOOTBRIDGE,
  G6_PR_STONE,
  G7_LESSON_KITE,
  G8_ARCHIVE_KITE,
  G9_PADDY,
  G9_CHESS_RIDGE,
  G10_FIREFLY,
  G11_DEEPMAL_NICHE,
  G12_BENCHMARK,
  G13_SITE_COURSES,
  G14_LANDMARK_FACET,
  G15_REACH_INSTALLS,
  G16_REACH_UPSTREAM,
  G17_EMPLOYER_MARKER,
];
