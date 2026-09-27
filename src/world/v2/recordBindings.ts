/**
 * Landmarks & records bindings (P3-01f, world-v2-spec.md#5 rows 11-14/17/18,
 * idea-atlas.md WORLD-11/13/14/REC-7, living-ledger-spec.md#3.3 G4/G6/G11/G12).
 *
 * The pure data core for `layers/LandmarksRecords.tsx`: everything that
 * layer draws is computed here, from the `Ledger` alone, and nothing here
 * touches three/R3F/React/DOM — the same discipline `valley.ts` and
 * `worldModel.ts` already hold, so this file is directly unit-testable and
 * the render layer stays a thin, replaceable consumer.
 *
 * Deepmal (niches) and stepping stones (pr-stone) already have a GRAMMAR
 * rule and a placed `Feature` each (G11 deepmal-niche, G6 pr-stone) — this
 * file reuses `landOf()`'s real output for those rather than re-deriving
 * placement, so a position/state disagreement between this layer and
 * `GrammarInstances.tsx`'s own placeholder for the same feature is
 * impossible by construction. It deliberately does NOT register either
 * form with `kits.ts`'s `KITS` map: `e2e/world-v2.spec.ts` (P2-19, not this
 * lane's to edit) asserts `[data-rule='pr-stone']`'s count and hover-highlight
 * straight off `GrammarInstancesDom`'s own placeholder mirror, which
 * `isKitted()` would silently empty out. This layer's richer geometry is
 * additive alongside that placeholder, not a replacement of it — flagged
 * here once, for whichever future lane reconciles the two.
 * ponytail: additive, not a placeholder swap — the real fix needs
 * world-v2.spec.ts rewritten in the same change that claims the form, which
 * is a P2-19-owned file this lane cannot touch.
 *
 * Two data sources genuinely have no `Ledger` field yet and are read
 * directly, each a narrow, documented exception the same shape ledger.ts's
 * own docstring already concedes is sometimes necessary (`valley.ts` does
 * the same for `src/data/osm/mutha.json`, "geography, not a record of his
 * own work"):
 *   - `fleetByEra` (era banding for the deepmal, REC-7) — derived off
 *     `store.ts`+`profile/experience.ts`, not on `Ledger` (it would need a
 *     `Ledger` change this lane does not own).
 *   - `caseStudies` (hero-stone approach registers) — `Ledger` has no
 *     case-study field at all yet.
 */
import type { Ledger } from "./ledger.ts";
import { ledger as defaultLedger } from "./ledger.ts";
import { landOf, type DetailLink, type Feature } from "./worldModel.ts";
import { placementCounts } from "./valley.ts";
import { dateZ, type Flank } from "../city.ts";
import { ROOM_PLACEMENTS, type RoomShape } from "../cityData.ts";
import { fleetByEra } from "../../data/fleetByEra.ts";
import { caseStudies, type CaseStudy } from "../../data/profile/caseStudies.ts";
import type { Experience, ExperiencePoint } from "../../data/profile/experience.ts";
import { hashNoise, stringSeed } from "./hash.ts";

export type Pos = readonly [number, number, number];

// ── Deepmal (niches) — G11, REC-7 ───────────────────────────────────────────

export interface DeepmalNiche {
  id: string;
  pos: Pos;
  lit: boolean;
  /** `fleetByEra` bucket key this niche's last Play update fell in, or
   *  `null` for a delisted row (era banding only speaks to WHEN a live
   *  listing last moved) or an update `fleetByEra` itself could not place
   *  ("unmeasured", rendered grey per REC-7). */
  eraKey: string | null;
  label: string;
}

export interface DeepmalBinding {
  /** Straight off `fleetStats` — the acceptance's own formula, and never
   *  re-derived from the (scale-capped past 480, D4) `niches` list below. */
  lit: number;
  total: number;
  niches: readonly DeepmalNiche[];
  /** Where `lightProbe.ts` bakes its one CubeCamera — the fleet's own
   *  weir (world-v2-spec §2's ascii layout: "Jugnoo ghat 2021-23 — deepmal
   *  (fleet)"), or the origin if that weir hasn't landed yet. */
  centroid: Pos;
}

const NICHE_RING_SLOTS = 12; // world-v2-spec §5 row 13: "rings of 12 niches"
const NICHE_RING_BASE_RADIUS = 4;
const NICHE_RING_RADIUS_STEP = 2.2;
const NICHE_RING_Y_STEP = 0.6;

/** Ring layout around the centroid — `ceil(total/12)` rings, 12 niches per
 *  ring, stacked upward. Pure index arithmetic, not hash-seeded: the same
 *  niche always lands in the same slot for the same fleet order. */
function nichePosition(index: number, centroid: Pos): Pos {
  const ring = Math.floor(index / NICHE_RING_SLOTS);
  const slot = index % NICHE_RING_SLOTS;
  const radius = NICHE_RING_BASE_RADIUS + ring * NICHE_RING_RADIUS_STEP;
  const angle = (slot / NICHE_RING_SLOTS) * Math.PI * 2;
  return [centroid[0] + radius * Math.cos(angle), centroid[1] + ring * NICHE_RING_Y_STEP, centroid[2] + radius * Math.sin(angle)];
}

function eraKeyByFleetId(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const bucket of fleetByEra) for (const id of bucket.ids) map.set(id, bucket.key);
  return map;
}

function deepmalCentroid(ledger: Ledger): Pos {
  const jugnoo = landOf(ledger).find((f) => f.rule === "weir" && f.id === "weir:Jugnoo (Jungleworks / Tookan)");
  return jugnoo ? jugnoo.pos : [0, 0, 0];
}

function deepmalBinding(ledger: Ledger): DeepmalBinding {
  const eraById = eraKeyByFleetId();
  const centroid = deepmalCentroid(ledger);
  const niches = landOf(ledger)
    .filter((f) => f.rule === "deepmal-niche")
    .map((f, index): DeepmalNiche => {
      const fleetId = f.id.slice("deepmal-niche:".length);
      const lit = f.state === "lit";
      return { id: f.id, pos: nichePosition(index, centroid), lit, eraKey: lit ? (eraById.get(fleetId) ?? "unmeasured") : null, label: f.label };
    });
  return { lit: ledger.fleet.stats.live, total: ledger.fleet.stats.live + ledger.fleet.stats.delisted, niches, centroid };
}

// ── Stepping stones (pr-stone) + submerged (open PRs) — G6 ─────────────────

export interface SteppingStone {
  id: string;
  org: string;
  pos: Pos;
  label: string;
  opens: DetailLink | null;
  /** True once its own repo has 3+ merged PRs counted here — the
   *  "recurrence rim" the lane's task list names. */
  recurrence: boolean;
}

export interface StoneCairn {
  org: string;
  pos: Pos;
  count: number;
  label: string;
}

export interface SubmergedStone {
  id: string;
  org: string;
  url: string;
  title: string;
}

export const STONE_MATERIAL: Readonly<Record<string, "basalt" | "laterite" | "stone">> = {
  "career-ops-hq": "basalt",
  openMF: "laterite",
};

export function stoneMaterial(org: string): "basalt" | "laterite" | "stone" {
  return STONE_MATERIAL[org] ?? "stone";
}

export interface SteppingStonesBinding {
  /** `org -> count`, read straight off `valley.ts`'s own G6 reconciliation
   *  (itemised + cairn), which is what makes `career-ops-hq` equal
   *  `upstreamMergedPRs` and `openMF` equal `mifosMergedPRs` without this
   *  file re-deriving either. */
  countsByOrg: Readonly<Record<string, number>>;
  stones: readonly SteppingStone[];
  cairns: readonly StoneCairn[];
  submerged: readonly SubmergedStone[];
  submergedCount: number;
}

function repoRecurrence(ledger: Ledger): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const c of ledger.openSource) if (c.status === "merged") counts.set(c.repo, (counts.get(c.repo) ?? 0) + 1);
  const recurring = new Set<string>();
  for (const [repo, n] of counts) if (n >= 3) recurring.add(repo);
  return recurring;
}

function steppingStonesBinding(ledger: Ledger): SteppingStonesBinding {
  const recurring = repoRecurrence(ledger);
  const stones: SteppingStone[] = [];
  const cairns: StoneCairn[] = [];
  for (const f of landOf(ledger).filter((feat) => feat.rule === "pr-stone")) {
    // grammar.ts's G6 placementSeed is the PR url for an itemised stone,
    // `${org}:cairn` for the fold — both survive verbatim after the
    // "pr-stone:" prefix this file strips.
    const seed = f.id.slice("pr-stone:".length);
    if (seed.endsWith(":cairn")) {
      const org = seed.slice(0, -":cairn".length);
      cairns.push({ org, pos: f.pos, count: Math.round(f.scalar || 0) || 1, label: f.label });
      continue;
    }
    const contribution = ledger.openSource.find((c) => c.url === seed && c.status === "merged");
    const org = contribution?.org ?? "career-ops-hq";
    stones.push({
      id: f.id,
      org,
      pos: f.pos,
      label: f.label,
      opens: f.opens ?? null,
      recurrence: contribution ? recurring.has(contribution.repo) : false,
    });
  }
  const submerged: SubmergedStone[] = ledger.openSource
    .filter((c) => c.status === "open")
    .map((c) => ({ id: `submerged-stone:${c.url}`, org: c.org, url: c.url, title: c.title }));
  return {
    countsByOrg: placementCounts(ledger).steppingStonesByOrg,
    stones,
    cairns,
    submerged,
    submergedCount: submerged.length,
  };
}

// ── Weirs (G4) — one per employer, at its earliest entry ───────────────────

export interface Weir {
  company: string;
  pos: Pos;
  label: string;
}

function weirsBinding(ledger: Ledger): readonly Weir[] {
  return landOf(ledger)
    .filter((f) => f.rule === "weir")
    .map((f) => ({ company: f.id.slice("weir:".length), pos: f.pos, label: f.label }));
}

// ── Employer ghats — riverside houses, hover-only, never clickable ─────────

export interface EmployerFlight {
  /** `ExperiencePoint.label` when the bullet has one, else null — never any
   *  other text (recordBindings.test.ts's own label-purity check). */
  label: string | null;
  tier: 1 | 2 | "full";
  steps: 4;
}

export interface EmployerGhat {
  company: string;
  /** Every distinct role held there, oldest first — `Experience.role`,
   *  verbatim, nothing appended. */
  roles: readonly string[];
  location: string;
  /** z of the earliest entry's start — matches this company's own `weir`
   *  Feature, so the ghat and its weir never drift apart (both read
   *  `dateZ`/`city.ts`, the same raw scale `worldModel.ts`'s own G4/G14
   *  placement already uses, not `valley.ts`'s `VALLEY_SCALE`; reconciling
   *  the two scales is flagged, not owned, by WorldV2.tsx already). */
  pos: Pos;
  flights: readonly EmployerFlight[];
  /** Built ONLY from `company`/`role`/`period` — recordBindings.test.ts
   *  greps every other field's own text out of the whole binding and
   *  fails if any of it turns up here. */
  label: string;
}

function pointTier(p: ExperiencePoint): 1 | 2 | "full" {
  return p.tier ?? "full";
}

function employerGhatsBinding(ledger: Ledger): readonly EmployerGhat[] {
  const byCompany = new Map<string, Experience[]>();
  for (const e of ledger.experience) byCompany.set(e.company, [...(byCompany.get(e.company) ?? []), e]);
  const ghats: EmployerGhat[] = [];
  for (const [company, entries] of byCompany) {
    const sorted = [...entries].sort((a, b) => (dateZ(a.period) ?? 0) - (dateZ(b.period) ?? 0));
    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];
    const roles = [...new Set(sorted.map((e) => e.role))];
    const flights: EmployerFlight[] = sorted.flatMap((e) => e.points.map((p) => ({ label: p.label ?? null, tier: pointTier(p), steps: 4 as const })));
    const z = dateZ(earliest.period) ?? 0;
    const x = 6 * hashNoise(stringSeed(`employer-ghat:${company}`));
    ghats.push({
      company,
      roles,
      location: earliest.location,
      pos: [x, 0, z],
      flights,
      label: `${company}: ${earliest.role}${latest !== earliest ? ` → ${latest.role}` : ""} (${earliest.period.split(" - ")[0]} – ${latest.period.split(" - ").slice(-1)[0]})`,
    });
  }
  return ghats;
}

// ── Hero stones — case-study registers, on the parent employer's ghat ──────

export interface HeroStone {
  slug: string;
  title: string;
  registers: number;
  pos: Pos;
  opens: DetailLink;
}

// The only case study that is ALSO a full project page today (v1's
// destinations.ts `caseStudyDetailLink`, restated here rather than pulled in
// wholesale — `Ledger` has no `projects` registry to check membership
// against, and importing v1's whole destination graph for one boolean is
// the wrong side of this lane's own reuse-vs-footprint call).
const HERO_STONE_PROJECT_SLUGS = new Set(["doori"]);

function heroStoneDetailLink(slug: string): DetailLink {
  return HERO_STONE_PROJECT_SLUGS.has(slug) ? { kind: "project", target: slug } : { kind: "home-anchor", target: slug };
}

/** Every hero stone sits on Dice's own ghat waterline — 4 of the 5 case
 *  studies are Dice-era work, and Doori (the fifth) has no employer ghat of
 *  its own to sit on either; a fixed, named z is the honest reading until a
 *  per-case-study employer link exists in `src/data/*`. */
function heroStonesBinding(ghats: readonly EmployerGhat[]): readonly HeroStone[] {
  const dice = ghats.find((g) => g.company === "Dice.tech");
  const z = dice ? dice.pos[2] : 0;
  return caseStudies.map((cs: CaseStudy, i) => ({
    slug: cs.slug,
    title: cs.title.split(" — ")[0] ?? cs.title,
    registers: cs.approach.length,
    pos: [8 + i * 3, 0, z] as Pos,
    opens: heroStoneDetailLink(cs.slug),
  }));
}

// ── Room chhatris — one per ROOM_PLACEMENTS entry, on its bank flank ───────

export const ROOM_CHHATRI_VALLEY_SCALE = 2.5;

export interface RoomChhatri {
  to: string;
  side: Flank;
  shape: RoomShape;
  pos: Pos;
}

function roomChhatrisBinding(): readonly RoomChhatri[] {
  return ROOM_PLACEMENTS.map((r) => {
    const z = r.z * ROOM_CHHATRI_VALLEY_SCALE;
    const x = (r.side === "west" ? -1 : 1) * 18;
    return { to: r.to, side: r.side, shape: r.shape, pos: [x, 0, z] as Pos };
  });
}

// ── Old town Excelsior — hover-only, grouped by era ────────────────────────

export interface OldTownHouse {
  eraKey: string;
  label: string;
  pieceCount: number;
  pos: Pos;
}

/** Excelsior + Before The Code (`writing.archive`), one house per distinct
 *  `era` string — height/marks are a Blender kit's own numbers (world-v2-spec
 *  §5 row 18) this lane does not script; this binding gives the layer
 *  everything it can honestly say without one: which eras exist, how many
 *  pieces ran in each, and a hover label built only from `Archive`'s own
 *  published fields. */
function oldTownBinding(ledger: Ledger): readonly OldTownHouse[] {
  const byEra = new Map<string, number>();
  for (const piece of ledger.writing.archive) {
    const key = piece.era ?? "undated";
    byEra.set(key, (byEra.get(key) ?? 0) + 1);
  }
  const eras = [...byEra.keys()].sort();
  return eras.map((eraKey, i) => ({
    eraKey,
    label: eraKey === "undated" ? "Before The Code (undated)" : `Excelsior ${eraKey}`,
    pieceCount: byEra.get(eraKey) ?? 0,
    pos: [-30 - i * 6, 0, -180] as Pos,
  }));
}

// ── Benchmarks (G12) — survey plaques, straight off landOf ─────────────────

export interface Benchmark {
  id: string;
  pos: Pos;
  label: string;
}

function benchmarksBinding(ledger: Ledger): readonly Benchmark[] {
  return landOf(ledger)
    .filter((f) => f.rule === "benchmark")
    .map((f) => ({ id: f.id, pos: f.pos, label: f.label }));
}

// ── The assembled binding ───────────────────────────────────────────────────

export interface RecordBindings {
  deepmal: DeepmalBinding;
  steppingStones: SteppingStonesBinding;
  weirs: readonly Weir[];
  employerGhats: readonly EmployerGhat[];
  heroStones: readonly HeroStone[];
  roomChhatris: readonly RoomChhatri[];
  oldTown: readonly OldTownHouse[];
  benchmarks: readonly Benchmark[];
}

export function recordBindings(ledger: Ledger = defaultLedger): RecordBindings {
  const employerGhats = employerGhatsBinding(ledger);
  return {
    deepmal: deepmalBinding(ledger),
    steppingStones: steppingStonesBinding(ledger),
    weirs: weirsBinding(ledger),
    employerGhats,
    heroStones: heroStonesBinding(employerGhats),
    roomChhatris: roomChhatrisBinding(),
    oldTown: oldTownBinding(ledger),
    benchmarks: benchmarksBinding(ledger),
  };
}

// Re-exported so the layer and its DOM mirror never need worldModel.ts's
// Feature import path duplicated.
export type { Feature };
