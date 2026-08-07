import { experience, caseStudies, projects, type ExperiencePoint } from "../data/profile.ts";
import { projectStats } from "../data/projectStats.ts";
import { CITY, yearZ, dateZ, type TallStructure, type ResolveSource, type PaletteToken } from "./city.ts";
import { PROP_COLLISION_GROUPS } from "./collisionGroups.ts";

/**
 * WEST DISTRICT — "what he was paid for."
 *
 * Pure derivation from src/data/, zero three.js/@react-three imports (same
 * discipline as city.ts, for the same reason: unit-testable headlessly, and
 * importable from a data-gen script without dragging in a renderer). Every
 * number below traces back to a real field in profile.ts or projectStats.ts —
 * see the design doc's "no invention" rule, which this file is the sharpest
 * test of: an employer's office block is only as tall as its bullet list,
 * and a project with no date anywhere in the data gets no date here either.
 *
 * Three lateral lanes, all west of the boulevard (negative x), each 3m wide
 * to match the "mid row 19-22 / kerbside 15-18 / outer 24-27" bands the
 * design doc's lateral-band table lays out. `CITY.buildInner` (15) is the
 * wall between all of this and a pavilion's approach sensor — every x below
 * is comfortably past it, and districtWest.test.ts asserts that directly
 * rather than trusting the arithmetic by eye.
 */

const KERB_ROW_X = -16; // case-study monuments — the design doc's own explicit x
const MID_ROW_X = -20.5; // employer blocks (lane centre of |x| 19-22)
const OUTER_ROW_X = -25.5; // project towers (lane centre of |x| 24-27)
const LANE_WIDTH = 3; // every lane above is 3m wide — matches the band tables exactly

const FLOOR_BASE = 4; // matches the height formula's "4 +" base/lobby offset
const FLOOR_HEIGHT = 1.6;

const CASE_STUDY_RADIUS = 1; // obelisk footprint — constant across all five, only height varies
const DUST_MIN_HEIGHT = 6; // below this, a structure "rises" but gets no dust cloud of its own
const DUST_POINTS = 350;

// ── date maths ──────────────────────────────────────────────────────────
// profile.ts's `period` strings ("June 2023 - Present") are WS3's own data
// shape, not shared with any other district, so the split-and-parse lives
// here rather than asking city.ts's dateZ to invent a two-value return for a
// range (its own doc comment says exactly that: a caller wanting both ends
// of a span calls it twice, once per half of its own " - " split).

/** The z a `"... - Present"` employer's open end resolves to: the FAR edge of
 *  the current year's band, not "today's exact date" (which would keep
 *  sliding the whole city south every time this page is regenerated) and not
 *  `CITY.z1` (which is reserved for things dated explicitly PAST the current
 *  year, per city.ts's own comment on why z1 runs 8m long). */
function presentZ(): number {
  return yearZ(CITY.lastYear) + CITY.yearSpan / 2;
}

function periodEndpointZ(token: string): number {
  const trimmed = token.trim();
  if (/^present$/i.test(trimmed)) return presentZ();
  const z = dateZ(trimmed);
  if (z === null) {
    throw new Error(`districtWest: unparseable period endpoint "${token}" — fix the source data, don't guess here`);
  }
  return z;
}

function periodZRange(period: string): { zStart: number; zEnd: number; span: number } {
  const [startTok, endTok] = period.split(" - ");
  const zStartRaw = periodEndpointZ(startTok);
  const zEndRaw = periodEndpointZ(endTok);
  const span = Math.max(6, zEndRaw - zStartRaw); // clamp — a 2.7m internship still needs a walkable footprint
  return { zStart: zStartRaw, zEnd: zStartRaw + span, span };
}

// ── employer blocks ─────────────────────────────────────────────────────

export interface EmployerFloor {
  /** Absolute world y — CITY.groundY + FLOOR_BASE + index*FLOOR_HEIGHT. */
  y: number;
  tier: ExperiencePoint["tier"];
}

export interface EmployerBlock {
  company: string;
  x: number;
  width: number;
  zStart: number;
  zEnd: number;
  zMid: number;
  span: number;
  height: number;
  floors: EmployerFloor[];
}

/** Four blocks, one per `profile.experience` entry. Z-extent is the literal
 *  employment span (clamped to a walkable 6m minimum); height is `4 +
 *  points.length * 1.6` — a taller block is, by construction, a longer
 *  bullet list, never an opinion this file holds on its own. */
export function employerBlocks(): EmployerBlock[] {
  return experience.map((e) => {
    const { zStart, zEnd, span } = periodZRange(e.period);
    const height = FLOOR_BASE + e.points.length * FLOOR_HEIGHT;
    return {
      company: e.company,
      x: MID_ROW_X,
      width: LANE_WIDTH,
      zStart,
      zEnd,
      zMid: (zStart + zEnd) / 2,
      span,
      height,
      floors: e.points.map((p, i) => ({ y: CITY.groundY + FLOOR_BASE + i * FLOOR_HEIGHT, tier: p.tier })),
    };
  });
}

// ── case studies ────────────────────────────────────────────────────────

// Which employer's span a case study inherits, matched by hand against the
// real content (not fuzzy title-matching — a wrong fuzzy match would
// silently invent a placement, the one thing this file must never do):
//   - gps-accuracy / crash-reduction / compose-migration are Dice case
//     studies verbatim (each mirrors one of Dice's own tier:1 bullets).
//   - white-label mirrors Jugnoo's "White-Label Platform" bullet.
//   - mileway is a personal open-source project with no employer bullet
//     behind it, but its slug IS a projectStats key — it inherits Dice's
//     span under the same "projectStats slug -> Dice work" rule the project
//     towers below use, rather than getting an invented employer link.
const CASE_STUDY_EMPLOYER: Record<string, string> = {
  "gps-accuracy": "Dice.tech",
  "crash-reduction": "Dice.tech",
  "compose-migration": "Dice.tech",
  "white-label": "Jugnoo / Tookan / Jungleworks",
  mileway: "Dice.tech",
};

export interface CaseStudyMonument {
  slug: string;
  title: string;
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** Five kerbside obelisks. Height is `4 + approach.length * 0.9` — the
 *  number of approach bullets in the write-up, not an invented scale. */
export function caseStudyMonuments(): CaseStudyMonument[] {
  const byCompany = new Map(employerBlocks().map((b) => [b.company, b]));
  return caseStudies.map((cs) => {
    const company = CASE_STUDY_EMPLOYER[cs.slug];
    const parent = company ? byCompany.get(company) : undefined;
    return {
      slug: cs.slug,
      title: cs.title,
      x: KERB_ROW_X,
      // Every case study above is mapped to a real employer; presentZ() is
      // only a defensive fallback if CASE_STUDY_EMPLOYER and caseStudies
      // ever drift apart (a new case study added without a mapping entry) —
      // it should never actually be hit.
      z: parent ? parent.zMid : presentZ(),
      radius: CASE_STUDY_RADIUS,
      height: FLOOR_BASE + cs.approach.length * 0.9,
    };
  });
}

// ── project towers ──────────────────────────────────────────────────────

// A real dated item that names this exact project, by hand rather than by
// fuzzy title search — same reasoning as CASE_STUDY_EMPLOYER above. Every
// value here is the literal date string off the recentGrowth/openSource
// entry it cites, so dateZ() places it exactly where that entry already
// lives on the axis.
const PROJECT_DATE: Record<string, string> = {
  kursi: "Jun 2026", // recentGrowth: "Kursi shipped"
  mileway: "Jul 2026", // recentGrowth: "Mileway — super-profile & plugin platform (V24)"
  paymentslab: "Jul 2026", // recentGrowth: "PaymentsLab — 5 rails + 66 gateways"
  // HireSignal's own case study cites this exact PR (#1472) as its newest
  // merged upstream contribution — the openSource entry with that URL.
  hiresignal: "2026-07-03",
};

const UNDATED_STEP = 5; // metres between undated plinths, walking north from the south edge

export interface ProjectTower {
  slug: string;
  modules: number;
  screenshots: number;
  width: number;
  height: number;
  x: number;
  z: number;
  /** false when no date field anywhere in the data justified a real z —
   *  the tower still exists (deleting it would be its own kind of lie) but
   *  stands on the undated plinth rather than at a guessed year. */
  dated: boolean;
}

/** Nine towers, one per `profile.projects` entry. Height is `modules *
 *  0.55` (projectStats when the slug has an entry, else the same 8-module
 *  fallback Monuments.tsx used before this rewrite). Z comes from, in
 *  order: an explicit dated shipping/contribution entry; else the
 *  "projectStats slug -> Dice work" rule; else the undated plinth. Nothing
 *  in between is ever guessed. */
export function projectTowers(): ProjectTower[] {
  const dice = employerBlocks().find((b) => b.company === "Dice.tech");
  const stats = projectStats as Record<string, { modules?: number; screenshots?: number }>;
  let undatedIndex = 0;

  return projects.map((p) => {
    const stat = stats[p.slug];
    const modules = stat?.modules ?? 8;
    const screenshots = stat?.screenshots ?? p.screens?.length ?? 20;
    const width = 1.1 + Math.min(1.6, screenshots / 60);
    const height = modules * 0.55;
    const base = { slug: p.slug, modules, screenshots, width, height, x: OUTER_ROW_X };

    const explicit = PROJECT_DATE[p.slug];
    const explicitZ = explicit ? dateZ(explicit) : null;
    if (explicitZ !== null && explicitZ !== undefined) {
      return { ...base, z: explicitZ, dated: true };
    }
    if (p.slug in stats && dice) {
      return { ...base, z: dice.zMid, dated: true };
    }
    const z = CITY.z1 - 4 - undatedIndex * UNDATED_STEP;
    undatedIndex += 1;
    return { ...base, z, dated: false };
  });
}

// ── gps.ts / ResolveField exports ───────────────────────────────────────

export function westStructures(): TallStructure[] {
  return [
    ...employerBlocks().map((b) => ({ x: b.x, z: b.zMid, height: b.height })),
    ...caseStudyMonuments().map((c) => ({ x: c.x, z: c.z, height: c.height })),
    ...projectTowers().map((t) => ({ x: t.x, z: t.z, height: t.height })),
  ];
}

/** Deterministic value noise, seeded per-structure so its dust cloud is
 *  stable across renders (and reproducible in a test) rather than
 *  reshuffling on every mount. Reimplemented rather than imported from
 *  resolve.ts, which keeps districtWest.ts free of any @react-three-adjacent
 *  import — it stays a plain data module, same discipline as city.ts. */
function hashNoise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** ~350 points scattered across a box's six outer faces — the surface a
 *  district's largest structures resolve dust onto. Seeded by the
 *  structure's own id, not `Math.random`, for the same reproducibility
 *  reason as `hashNoise` above. */
function sampleBoxSurface(id: string, cx: number, cy: number, cz: number, w: number, h: number, d: number, count: number): Float32Array {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 100000;
  const out = new Float32Array(count * 3);
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  for (let i = 0; i < count; i++) {
    const face = Math.floor(((hashNoise(seed + i * 3.1) + 1) / 2) * 6) % 6;
    let x = hashNoise(seed + i * 7.3 + 1) * hw;
    let y = ((hashNoise(seed + i * 11.7 + 2) + 1) / 2) * h - hh;
    let z = hashNoise(seed + i * 5.9 + 3) * hd;
    if (face === 0) x = hw;
    else if (face === 1) x = -hw;
    else if (face === 2) y = hh;
    else if (face === 3) y = -hh;
    else if (face === 4) z = hd;
    else z = -hd;
    out[i * 3] = cx + x;
    out[i * 3 + 1] = cy + y;
    out[i * 3 + 2] = cz + z;
  }
  return out;
}

// ── Props.tsx config, mirrored here ─────────────────────────────────────
// Props.tsx is a component file — exporting a plain constant from it costs
// fast refresh (see collisionGroups.ts's own comment on the same tradeoff),
// so the array districtWest.test.ts asserts over lives in this pure module
// instead. Props.tsx imports it back for its own `.map()` — one source of
// truth for the counts either side reads.
export const PROP_FAMILIES: { count: number; collisionGroups: number }[] = [
  { count: 14, collisionGroups: PROP_COLLISION_GROUPS }, // pallets
  { count: 12, collisionGroups: PROP_COLLISION_GROUPS }, // cable spools
  { count: 12, collisionGroups: PROP_COLLISION_GROUPS }, // kerb blocks
  { count: 10, collisionGroups: PROP_COLLISION_GROUPS }, // barrels
];

/** Structure dust for the west flank's largest landmarks: the four employer
 *  blocks and five case-study obelisks (every one at least DUST_MIN_HEIGHT
 *  tall). Project towers deliberately get no dust source of their own — they
 *  still resolve via the "rise" mode Monuments.tsx applies to their shader,
 *  which is the design doc's "everything smaller scales in from 0 on the
 *  same trigger" half of the split. */
export function westResolveSources(): ResolveSource[] {
  const sources: ResolveSource[] = [];
  const employerToken: PaletteToken = "signal";
  const caseStudyToken: PaletteToken = "accent";

  for (const b of employerBlocks()) {
    if (b.height < DUST_MIN_HEIGHT) continue;
    const id = `employer:${b.company}`;
    sources.push({
      id,
      targets: sampleBoxSurface(id, b.x, b.height / 2 + CITY.groundY, b.zMid, b.width, b.height, b.span, DUST_POINTS),
      token: employerToken,
    });
  }
  for (const c of caseStudyMonuments()) {
    if (c.height < DUST_MIN_HEIGHT) continue;
    const id = `case:${c.slug}`;
    const side = c.radius * 2;
    sources.push({
      id,
      targets: sampleBoxSurface(id, c.x, c.height / 2 + CITY.groundY, c.z, side, c.height, side, DUST_POINTS),
      token: caseStudyToken,
    });
  }
  return sources;
}
