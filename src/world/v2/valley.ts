/**
 * "Sangam": the world-v2 valley's single layout source (world-v2-spec.md
 * §2.1, amended by living-ledger-spec.md §3.5/§5.1 and open-data-spec.md
 * §3 A3; master-plan.json M4/M5). Pure, zero three/R3F imports — the same
 * discipline as `craftPhysics.ts` and this lane's siblings — so the
 * runtime, `gen-terrain.mjs` (P2-05, after it switches off
 * `valley-math.mjs`) and every test here import the exact same numbers.
 *
 * M5: this is the ONE edit `heavy/world-v2/valley.ts` in the spec means —
 * `heavy/world/` is the heavy-asset root, this file is layout code.
 * M4: world +Z is the real Mutha chord bearing (`skyFrame.ts`
 * `DOWNSTREAM_BEARING_DEG`), because the drawn river below IS the Mutha
 * projected onto that chord.
 *
 * `src/data/osm/mutha.json` (P2-04) is read directly, not through
 * `ledger.ts` — it is geography, not a record of his own work, so it sits
 * outside what `Ledger` means (ledger.ts's own docstring).
 */

import { yearZ, zToYear } from "../city.ts";
import { GRAMMAR, type GrowthRule } from "./grammar.ts";
import { ledger as defaultLedger, type Ledger } from "./ledger.ts";
import mutha from "../../data/osm/mutha.json" with { type: "json" };

// ── the time spine, scaled (world-v2-spec §2) ──────────────────────────────

/** 16 m/year (city.ts) × 2.5 = 40 m/year — the reference reads at river
 *  scale, not desk scale. */
export const VALLEY_SCALE = 2.5;

/** 768×768 m centred at (0, +40) — world-v2-spec §3. */
export const EXTENT = 768;
export const CENTER = { x: 0, z: 40 };
export const BOUNDS = {
  xMin: CENTER.x - EXTENT / 2,
  xMax: CENTER.x + EXTENT / 2,
  zMin: CENTER.z - EXTENT / 2,
  zMax: CENTER.z + EXTENT / 2,
};

function ymToYearFrac(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y + (m - 1) / 12;
}

function yearFracToYm(yearFrac: number): string {
  const y = Math.floor(yearFrac);
  const m = Math.min(12, Math.max(1, Math.round((yearFrac - y) * 12) + 1));
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** A `laneMonths`-shaped "YYYY-MM" to a world-v2 z — city.ts's `yearZ`
 *  scaled by `VALLEY_SCALE`. */
export function valleyZ(ym: string): number {
  return yearZ(ymToYearFrac(ym)) * VALLEY_SCALE;
}

/** The recorded month nearest a world-v2 z, clamped to `months`' own span —
 *  `months` is contiguous (every generator fills every month), so anything
 *  inside the span exists verbatim and only the two ends need clamping. */
function nearestYm(z: number, months: readonly string[]): string {
  const ym = yearFracToYm(zToYear(z / VALLEY_SCALE));
  if (ym < months[0]) return months[0];
  if (ym > months[months.length - 1]) return months[months.length - 1];
  return ym;
}

// ── G2 river width, read through GRAMMAR (living-ledger §3.5: "unchanged:
// width (Σ lanes)... amended by G2 amendment" — river-width lives in
// grammar.ts, this module never re-derives it) ─────────────────────────────

interface RiverWidthRow {
  ym: string;
  work: number;
  os: number;
}

function findRule<R>(id: string): GrowthRule<R> {
  const rule = GRAMMAR.find((r) => r.id === id);
  if (!rule) throw new Error(`valley.ts: grammar.ts's GRAMMAR is missing rule "${id}"`);
  return rule as unknown as GrowthRule<R>;
}

const widthByMonthCache = new WeakMap<Ledger, ReadonlyMap<string, number>>();

function riverWidthByMonth(ledger: Ledger): ReadonlyMap<string, number> {
  const cached = widthByMonthCache.get(ledger);
  if (cached) return cached;
  const rule = findRule<RiverWidthRow>("river-width");
  if (!rule.current) throw new Error('valley.ts: grammar.ts\'s "river-width" rule has no current()');
  const map = new Map<string, number>();
  for (const r of rule.source(ledger)) map.set(r.ym, rule.current(r));
  widthByMonthCache.set(ledger, map);
  return map;
}

/** River width (m) at any world-v2 z, stepped at the nearest recorded
 *  month — G2 from grammar.ts, never re-summed here (living-ledger §3.5). */
export function riverWidthAtZ(z: number, ledger: Ledger = defaultLedger): number {
  const ym = nearestYm(z, ledger.timeline.months);
  return riverWidthByMonth(ledger).get(ym) ?? 8;
}

export function riverDepth(width: number): number {
  return 1.2 + width * 0.06;
}

// ── the real Mutha's course (open-data-spec §3 A3, master-plan M5 task 2) ──

type Bends = readonly (readonly [number, number])[];
const BENDS = mutha.bends as unknown as Bends;

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Piecewise-linear lookup over `mutha.json`'s chord-parameterised,
 *  detrended lateral offsets (`bends`: `[s, lateralMetres][]`, `s` 0 at the
 *  Mutha's upstream end, 1 at the Sangam). Clamps outside `[0,1]` to the
 *  pinned endpoints (both 0 by construction). */
function lerpBends(s: number, bends: Bends): number {
  if (bends.length === 0) return 0;
  if (s <= bends[0][0]) return bends[0][1];
  const last = bends[bends.length - 1];
  if (s >= last[0]) return last[1];
  for (let i = 1; i < bends.length; i++) {
    const [s1, v1] = bends[i];
    if (s <= s1) {
      const [s0, v0] = bends[i - 1];
      const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
      return v0 + (v1 - v0) * t;
    }
  }
  return last[1];
}

function riverXAtScale(z: number, scale: number, sangamZ: number, bends: Bends): number {
  const s = clamp01((z - BOUNDS.zMin) / (sangamZ - BOUNDS.zMin));
  // The minus sign is the hydrological convention: `bends`' positive
  // lateral is the real RIGHT bank (facing downstream, i.e. facing +Z —
  // right = forward × up = -X), so a positive offset must land at
  // negative world x. Pinned by valley.test.ts against a real bend.
  return -scale * lerpBends(s, bends);
}

export interface RiverPolygonPoint {
  x: number;
  z: number;
}

/** True when any fixed (river-independent) placement sits inside the
 *  river's own channel at its own z — open-data-spec §3 A3 / master-plan
 *  M5 task 2's "if any placement collides with the river polygon". A
 *  placement defined as an offset FROM `riverX()` itself (a ghat, a room
 *  landing) can never collide by construction, so only absolute-position
 *  placements (district anchors) are worth checking. Exported so the
 *  break-it test can prove the fallback actually fires. */
export function riverPolygonCollides(
  points: readonly RiverPolygonPoint[],
  scale: number,
  sangamZ: number,
  widthAt: (z: number) => number,
  bends: Bends = BENDS,
): boolean {
  return points.some((p) => Math.abs(p.x - riverXAtScale(p.z, scale, sangamZ, bends)) < widthAt(p.z) / 2);
}

/** World m per real m, ~1:40 — `mutha.json`'s own `scale` field. */
export const RIVER_SCALE_PRIMARY: number = mutha.scale;
/** The capped fallback, ~1:60 (task 2 / open-data-spec §3 A3). */
export const RIVER_SCALE_FALLBACK = 0.0166;
const RIVER_SCALE_NOTE_TEXT = "bends drawn at 1:60, compressed x0.67";

interface RiverScaleResolution {
  scale: number;
  note: string | null;
}

function resolveRiverScale(ledger: Ledger, sangamZ: number): RiverScaleResolution {
  const anchors = districtAnchors(tributarySourceIds(ledger), { x: 0, z: sangamZ });
  const widthAt = (z: number) => riverWidthAtZ(z, ledger);
  if (!riverPolygonCollides(anchors, RIVER_SCALE_PRIMARY, sangamZ, widthAt)) {
    return { scale: RIVER_SCALE_PRIMARY, note: null };
  }
  return { scale: RIVER_SCALE_FALLBACK, note: RIVER_SCALE_NOTE_TEXT };
}

const SANGAM_Z = sangamBasin(defaultLedger).z;
const RIVER_SCALE_RESOLUTION = resolveRiverScale(defaultLedger, SANGAM_Z);

/** The scale actually in effect — primary unless a real placement collided
 *  with the primary-scale river, in which case the fallback (M5 task 2). */
export const RIVER_SCALE = RIVER_SCALE_RESOLUTION.scale;
/** The ledger string to show when compressed, `null` otherwise. */
export const RIVER_SCALE_NOTE = RIVER_SCALE_RESOLUTION.note;

/** The river's meandering centreline, real Mutha shape — spec §2.1,
 *  amended by open-data-spec §3 A3. `x(z) = -scale · lerp(bends, s)`. */
export function riverX(z: number): number {
  return riverXAtScale(z, RIVER_SCALE, SANGAM_Z, BENDS);
}

// ponytail: vertical offset |x - riverX(z)| rather than a true perpendicular
// projection — the same approximation valley-math.mjs shipped, adequate for
// a quadratic-falloff valley wall and a width/2 collision test. Upgrade to a
// numerical nearest-point search if the banks ever need to be exact.
export function distanceToRiver(x: number, z: number): number {
  return Math.abs(x - riverX(z));
}

export interface RiverSplinePoint {
  ym: string;
  z: number;
  x: number;
  width: number;
  depth: number;
}

/** One row per recorded month — spec §2.1. */
export function riverSpline(ledger: Ledger = defaultLedger): RiverSplinePoint[] {
  return ledger.timeline.months.map((ym) => {
    const z = valleyZ(ym);
    const width = riverWidthAtZ(z, ledger);
    return { ym, z, x: riverX(z), width, depth: riverDepth(width) };
  });
}

// ── Sangam basin + district anchors (spec §2.1) ─────────────────────────────

export interface SangamBasin {
  x: number;
  z: number;
  r: number;
}

/** Basin centre — `z = valleyZ(<last recorded month>) + 55`. */
export function sangamBasin(ledger: Ledger = defaultLedger): SangamBasin {
  const months = ledger.timeline.months;
  return { x: 0, z: valleyZ(months[months.length - 1]) + 55, r: 48 };
}

export interface DistrictAnchor {
  id: string;
  x: number;
  y: number;
  z: number;
  angleDeg: number;
}

/** Amphitheatre district anchors on the hillside arc (200°..340°, r=95m,
 *  y=14..22m) — spec §2.1. `ids` is the caller's ordered roster, kept out
 *  of this module so it stays pure of any particular repo list. */
export function districtAnchors(
  ids: readonly string[],
  basin: { x: number; z: number } = sangamBasin(),
): DistrictAnchor[] {
  const n = ids.length;
  const arcStart = (200 * Math.PI) / 180;
  const arcEnd = (340 * Math.PI) / 180;
  const r = 95;
  return ids.map((id, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const theta = arcStart + (arcEnd - arcStart) * t;
    return {
      id,
      x: basin.x + r * Math.cos(theta),
      z: basin.z + r * Math.sin(theta),
      y: 14 + 8 * t,
      angleDeg: (theta * 180) / Math.PI,
    };
  });
}

// ── tributaries (spec §2.1, amended by master-plan M5 task 3) ──────────────

type SystemEdge = Ledger["systemGraph"]["edges"][number];

function tributarySourceIds(ledger: Ledger): string[] {
  const seen = new Set<string>();
  for (const e of ledger.systemGraph.edges) if (e.kind === "includeBuild") seen.add(e.from);
  return [...seen];
}

export interface Tributary {
  id: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
  width: number;
  unmeasuredWidth: boolean;
  evidence: "measured" | "declared";
  hasWater: boolean;
}

/** One water/dry stream per `includeBuild` source, grouped by `from` —
 *  spec §2.1, amended: water only where the edge's own evidence field
 *  (the same "measured"/"declared" vocabulary `storyMap.ts`'s `EDGE_KIND`
 *  uses for its own edges) reads "measured"; a "declared" edge is a dry,
 *  stone-lined channel. */
export function tributaries(ledger: Ledger = defaultLedger): Tributary[] {
  const basin = sangamBasin(ledger);
  const anchors = new Map(districtAnchors(tributarySourceIds(ledger), basin).map((a) => [a.id, a]));
  const bySource = new Map<string, SystemEdge[]>();
  for (const e of ledger.systemGraph.edges) {
    if (e.kind !== "includeBuild") continue;
    const list = bySource.get(e.from) ?? [];
    list.push(e);
    bySource.set(e.from, list);
  }
  const stats = ledger.projectStats as Record<string, { modules?: number }>;
  return [...bySource.entries()].map(([from, edges]) => {
    const modules = stats[from]?.modules;
    const width = modules != null ? Math.max(1.2, modules * 0.1) : 1.2;
    const anchor = anchors.get(from) ?? { x: 0, z: basin.z };
    const evidence: "measured" | "declared" = edges.every((e) => e.evidence === "measured") ? "measured" : "declared";
    return {
      id: from,
      from: { x: anchor.x, z: anchor.z },
      to: { x: basin.x, z: basin.z },
      width,
      unmeasuredWidth: modules == null,
      evidence,
      hasWater: evidence === "measured",
    };
  });
}

// ── placement counts (spec §2.1's own valley.test.ts list) ─────────────────
//
// Bells (the bell-toran landmark, one per gateway) are deliberately absent
// here: they are the hero-prop landmark's own script, not this lane's —
// deferred with a documented reason in valley.test.ts until P2-12's own
// landmark script owns that placement.

type PrStoneRow = { kind: "itemised" | "cairn"; org: string; count?: number };

export interface PlacementCounts {
  diyasLit: number;
  diyasDark: number;
  steppingStonesByOrg: Readonly<Record<string, number>>;
  kites: number;
}

/** Diyas, PR stepping stones and kites, read through the ledger/GRAMMAR the
 *  same way width is (G6 pr-stone, G7 lesson-kite, G8 archive-kite) —
 *  reusing G6's own itemised+cairn reconciliation rather than re-deriving a
 *  naive `openSource` count, which would under-count career-ops-hq (17
 *  itemised vs 24 real merged PRs). Diyas read `fleet.stats` directly:
 *  it is already the exact live/delisted count G11 would otherwise
 *  re-derive from the same two arrays. */
export function placementCounts(ledger: Ledger = defaultLedger): PlacementCounts {
  const stoneRule = findRule<PrStoneRow>("pr-stone");
  const steppingStonesByOrg: Record<string, number> = {};
  for (const r of stoneRule.source(ledger)) {
    const n = r.kind === "itemised" ? 1 : (r.count ?? 0);
    steppingStonesByOrg[r.org] = (steppingStonesByOrg[r.org] ?? 0) + n;
  }
  const lessons = findRule<unknown>("lesson-kite").source(ledger).length;
  const archive = findRule<unknown>("archive-kite").source(ledger).length;
  return {
    diyasLit: ledger.fleet.stats.live,
    diyasDark: ledger.fleet.stats.delisted,
    steppingStonesByOrg,
    kites: lessons + archive,
  };
}
