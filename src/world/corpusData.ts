import { CITY, yearZ, dateZ, type TallStructure, type ResolveSource, type PaletteToken } from "./city.ts";
import { chess } from "../data/chess.ts";
import { weeb } from "../data/weeb.ts";
import { writing } from "../data/writing.ts";
import { excelsiorEditions } from "../data/excelsior.ts";
import { excelsiorMarks } from "../data/excelsiorMarks.ts";
import { boardProfiles } from "../data/beforeTheCode.ts";

/**
 * EAST DISTRICT — "what he made anyway."
 *
 * Pure derivation from src/data/, zero three.js/@react-three imports — same
 * discipline as districtWest.ts, for the same reason: unit-testable
 * headlessly, and importable from a data-gen script without a renderer.
 *
 * Six families, each traced to a real field rather than invented:
 *   - chess.arc          -> the ridge, the one structure that spans every year
 *   - chess.activityByYear -> the year plates at the kerb
 *   - chess.repertoire   -> the opening pillars
 *   - weeb.anime/manga   -> the 2026 field (the corpus has no per-item date,
 *                           and neither does facets.ts's own "weeb" entry —
 *                           see its "not recoverable" comment)
 *   - writing.lessons/archive -> the columns past the 2026 marker, and the
 *                           archive blocks (dated where `era` parses, an
 *                           honest "uncertain" row where it doesn't)
 *   - excelsior + excelsiorMarks + beforeTheCode.boardProfiles -> old town,
 *     2019-2021, the only district with no 2026 presence
 *
 * "No invention" is the same rule districtWest.ts holds itself to: a taller
 * thing here is always a bigger real number, and an undated thing gets no
 * guessed year. Two spots where the source data genuinely has no per-item
 * field the design's own formula assumes are called out inline, with what
 * was used instead and why.
 */

// ── shared helpers ──────────────────────────────────────────────────────

/** Deterministic value noise — reimplemented rather than imported from
 *  resolve.ts or districtWest.ts, same reasoning both of those give for
 *  their own copies: this file stays a plain data module, and each one
 *  independently satisfies its own test's "reproducible — same id, same
 *  cloud" check without a cross-file dependency to keep in step. */
function hashNoise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** chess.arc's `t` is a raw epoch millisecond, not one of the date shapes
 *  city.ts's `dateZ` parses — so this file owns the one conversion from
 *  "epoch ms" to "fractional year" that `yearZ` wants, rather than asking
 *  dateZ to grow a fourth input shape for a field only this district reads. */
function epochYearFraction(t: number): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (t - start) / (end - start);
}

// ── chess ridge ──────────────────────────────────────────────────────────
// The design doc's own words: "the point cloud that is genuinely a point
// cloud." Six rating series (lichess bullet/blitz/rapid, chess.com
// blitz/bullet/rapid) become six polylines, one per lane, x = 17..23.

const RIDGE_X_BASE = 20;
const RIDGE_X_STEP = 1.2;
const RIDGE_X_OFFSET = -3; // seriesIdx 0..5 -> x 17, 18.2, ... 23
const RIDGE_Y_MIN = 2;
const RIDGE_Y_SPAN = 12; // y = 2 + clamp((r-800)/2400, 0, 1) * 12 -> 2..14m
const RIDGE_RATING_FLOOR = 800;
const RIDGE_RATING_SPAN = 2400;

export interface ChessRidgeInstance {
  seriesIdx: number;
  platform: string;
  format: string;
  x: number;
  y: number;
  z: number;
}

/** 473 instances (6 series' worth of rating samples, every one of them —
 *  nothing downsampled). Points arrive already time-ordered within each
 *  series (chess.ts is a generated export off a live API response), so `z`
 *  comes out strictly increasing with `t` per series for free. */
export function chessRidge(): ChessRidgeInstance[] {
  const out: ChessRidgeInstance[] = [];
  chess.arc.forEach((series, seriesIdx) => {
    const x = RIDGE_X_BASE + seriesIdx * RIDGE_X_STEP + RIDGE_X_OFFSET;
    for (const p of series.points) {
      const yFrac = Math.min(1, Math.max(0, (p.r - RIDGE_RATING_FLOOR) / RIDGE_RATING_SPAN));
      out.push({
        seriesIdx,
        platform: series.platform,
        format: series.format,
        x,
        y: RIDGE_Y_MIN + yFrac * RIDGE_Y_SPAN,
        z: yearZ(epochYearFraction(p.t)),
      });
    }
  });
  return out;
}

// ── activity plates ─────────────────────────────────────────────────────

const ACTIVITY_X = 16;
const ACTIVITY_HEIGHT_PER_GAME = 1 / 300;

export interface ActivityPlate {
  year: number;
  x: number;
  z: number;
  height: number;
  games: number;
}

/** 8 plates — one per `chess.activityByYear` row, height = 0.2 + games/300,
 *  games = lichess + chesscom for that year (the two platforms measured
 *  separately, summed here because the plate is "how much chess that year",
 *  not "which site"). */
export function activityPlates(): ActivityPlate[] {
  return chess.activityByYear.map((row) => {
    const games = row.lichess + row.chesscom;
    return { year: Number(row.year), x: ACTIVITY_X, z: yearZ(Number(row.year)), height: 0.2 + games * ACTIVITY_HEIGHT_PER_GAME, games };
  });
}

// ── repertoire ───────────────────────────────────────────────────────────

const REPERTOIRE_X = 25;
const REPERTOIRE_X_STEP = 0.55; // 5 pillars per year, fanned ±1.1m around x=25

export interface RepertoirePillar {
  year: number;
  name: string;
  share: number;
  x: number;
  z: number;
  height: number;
}

/** 40 pillars — 8 years x the top-5 openings `chess.repertoire` already
 *  ranks, height = share * 8 (a 54.5% year like 2021's Modern Defense
 *  reaches ~4.4m; nothing here is a rank this file invented). */
export function repertoirePillars(): RepertoirePillar[] {
  const out: RepertoirePillar[] = [];
  for (const yearBlock of chess.repertoire) {
    const z = yearZ(Number(yearBlock.year));
    yearBlock.openings.forEach((o, i) => {
      out.push({
        year: Number(yearBlock.year),
        name: o.name,
        share: o.share,
        x: REPERTOIRE_X + (i - 2) * REPERTOIRE_X_STEP,
        z,
        height: o.share * 8,
      });
    });
  }
  return out;
}

/** One representative pillar per year (the tallest of that year's five) —
 *  what `eastStructures()` hands gps.ts, since a canyon-effect loop that ran
 *  against all 40 individual openings would be five times the work for a
 *  radius (9m) wide enough to make the per-opening spread within a cluster
 *  irrelevant anyway. */
function repertoireYearPeaks(): { x: number; z: number; height: number }[] {
  const byYear = new Map<number, RepertoirePillar>();
  for (const p of repertoirePillars()) {
    const cur = byYear.get(p.year);
    if (!cur || p.height > cur.height) byYear.set(p.year, p);
  }
  return [...byYear.values()].map((p) => ({ x: REPERTOIRE_X, z: p.z, height: p.height }));
}

// ── weeb field ───────────────────────────────────────────────────────────
// weeb.ts is a hand-kept AUTO-GENERATED aggregate (byWatch/byRead COUNTS per
// status, scoreDist COUNTS per score bucket) — not a row-per-title export.
// There is no per-anime array anywhere in it, so the design table's "height
// = 0.6 + score" formula has no per-item score field to read. Rather than
// invent one (the same "no invention" rule districtWest.ts holds for dates
// applies here to a fabricated number), height encodes STATUS — a real
// bucket every one of the 176 items genuinely sits in. "To Watch" still
// renders unlit, per the design table, because that status really does mean
// "not started" rather than merely "unscored".

const WEEB_X0 = 15;
const WEEB_X1 = 27;
const WEEB_Z0 = 64;
const WEEB_Z1 = 80; // undated by the data -> the 2026 band, matching facets.weeb's own "not recoverable" note

const STATUS_TIER: Record<string, number> = {
  Completed: 1.8,
  Reading: 1.6,
  Watching: 1.3,
  Ongoing: 1.0,
  Paused: 0.7,
  "To Watch": 0,
};

export interface WeebMarker {
  source: "anime" | "manga";
  status: string;
  x: number;
  z: number;
  height: number;
  lit: boolean;
}

function scatterWeeb(entries: { source: "anime" | "manga"; status: string }[]): WeebMarker[] {
  return entries.map((e, i) => {
    const nx = (hashNoise(i * 3.7 + 1) + 1) / 2;
    const nz = (hashNoise(i * 9.1 + 2) + 1) / 2;
    return {
      source: e.source,
      status: e.status,
      x: WEEB_X0 + nx * (WEEB_X1 - WEEB_X0),
      z: WEEB_Z0 + nz * (WEEB_Z1 - WEEB_Z0),
      height: 0.6 + (STATUS_TIER[e.status] ?? 0.7),
      lit: e.status !== "To Watch",
    };
  });
}

/** 176 markers: 154 anime (`weeb.anime.byWatch`) + 22 manga
 *  (`weeb.manga.byRead`) — the design doc's own total, reached from real
 *  per-status counts rather than a per-item list that does not exist. */
export function weebField(): WeebMarker[] {
  const entries: { source: "anime" | "manga"; status: string }[] = [];
  for (const [status, n] of Object.entries(weeb.anime.byWatch)) {
    for (let i = 0; i < n; i++) entries.push({ source: "anime", status });
  }
  for (const [status, n] of Object.entries(weeb.manga.byRead)) {
    for (let i = 0; i < n; i++) entries.push({ source: "manga", status });
  }
  return scatterWeeb(entries);
}

// ── writing: lessons ─────────────────────────────────────────────────────

const LESSON_X = [24, 25, 26, 27];
// The design table gives this district's z-range and its "dense cluster past
// the 2026 marker" description but, unlike every other family here, no size
// formula — there is no field in a Lesson (tags, pillar, series...) that
// reads as a magnitude. A fixed height is the honest response to a formula
// that was never specified, not a placeholder for one that was.
const LESSON_HEIGHT = 3.2;

export interface LessonColumn {
  slug: string;
  title: string;
  x: number;
  z: number;
  height: number;
}

/** 17 columns — one per `writing.lessons` entry, `z` from its own `created`
 *  ISO date via city.ts's `dateZ`. Every one of the 17 dates falls between
 *  2026-07-19 and 2026-09-02, which is what makes this a DENSE cluster
 *  rather than a spread: the real dates already do that, nothing here forces
 *  it. */
export function writingLessons(): LessonColumn[] {
  return writing.lessons.map((l, i) => {
    if (!l.created) throw new Error(`corpusData: writing.lessons["${l.slug}"] has no created date — fix the source data, don't guess here`);
    const z = dateZ(l.created);
    if (z === null) throw new Error(`corpusData: writing.lessons["${l.slug}"].created "${l.created}" is unparseable`);
    return { slug: l.slug, title: l.title, x: LESSON_X[i % LESSON_X.length], z, height: LESSON_HEIGHT };
  });
}

// ── writing: archive ─────────────────────────────────────────────────────

const ARCHIVE_DATED_X = 26;
const ARCHIVE_UNCERTAIN_X = 16;
const ARCHIVE_WORDS_PER_METRE = 400;
export const ARCHIVE_FOOTPRINT = 1.6;

export interface ArchiveBlock {
  slug: string;
  title: string;
  x: number;
  z: number;
  height: number;
  dated: boolean;
}

/** 11 blocks — one per `writing.archive` entry, height = words/400. `era` is
 *  read through the exact same `dateZ` every other dated field in this world
 *  goes through: it already refuses "campus-lore", "personal-essay" and the
 *  deliberately-unparseable "2069 (written 2020)" (see city.ts's own comment
 *  on that string) without this file adding a second parser. Whatever comes
 *  back `null` stands in the uncertain row at the slab's north edge instead
 *  of at a guessed year. */
export function writingArchive(): ArchiveBlock[] {
  return writing.archive.map((a) => {
    const words = typeof a.words === "number" ? a.words : Number(a.words ?? 0);
    const height = Math.max(0.4, words / ARCHIVE_WORDS_PER_METRE);
    const z = dateZ(a.era ?? "");
    if (z === null) {
      return { slug: a.slug, title: a.title, x: ARCHIVE_UNCERTAIN_X, z: CITY.z0, height, dated: false };
    }
    return { slug: a.slug, title: a.title, x: ARCHIVE_DATED_X, z, height, dated: true };
  });
}

// ── old town ─────────────────────────────────────────────────────────────
// excelsior (3 editions) + excelsiorMarks (10) + beforeTheCode.boardProfiles
// (3) = 16, all 2019-2021 — the only district with no 2026 presence, per the
// design doc's own framing of it as "the oldest thing in the city."

export const EDITION_FOOTPRINT = 2;
const EDITION_X = 16;
const MARK_X = 19;
const MARK_X_STEP = 0.4; // fans marks from the same edition apart on x — cosmetic, not a claim
const PROFILE_X = 21;

export interface EditionBlock {
  year: number;
  x: number;
  z: number;
  height: number;
  pages: number;
}

export interface MarkMarker {
  year: number;
  page: number;
  label: string;
  kind: "wrote" | "about" | "credit";
  x: number;
  z: number;
  height: number;
}

export interface ProfileMarker {
  year: number;
  title: string;
  x: number;
  z: number;
  height: number;
}

/** 3 blocks, height = pages/16 (128p -> 8m — the design doc's own worked
 *  example). */
export function excelsiorEditionBlocks(): EditionBlock[] {
  return excelsiorEditions.map((e) => ({
    year: Number(e.year),
    x: EDITION_X,
    z: yearZ(Number(e.year)),
    height: e.pages / 16,
    pages: e.pages,
  }));
}

/** 10 markers, one per hand-curated deep link — fixed height, same reasoning
 *  as `writingLessons`'s: no field here reads as a magnitude. */
export function excelsiorMarkMarkers(): MarkMarker[] {
  const seenInYear = new Map<string, number>();
  return excelsiorMarks.map((m) => {
    const i = seenInYear.get(m.year) ?? 0;
    seenInYear.set(m.year, i + 1);
    return { year: Number(m.year), page: m.page, label: m.label, kind: m.kind, x: MARK_X + i * MARK_X_STEP, z: yearZ(Number(m.year)), height: 1.2 };
  });
}

/** 3 markers, one per EB Profiles piece — the only outside record of how a
 *  team experienced working with him, per beforeTheCode.ts's own comment. */
export function boardProfileMarkers(): ProfileMarker[] {
  return boardProfiles.map((p, i) => ({ year: Number(p.year), title: p.title, x: PROFILE_X + i * MARK_X_STEP, z: yearZ(Number(p.year)), height: 1.4 }));
}

// ── gps.ts / ResolveField exports ───────────────────────────────────────

/** Old town's three editions, the archive's dated blocks and one peak
 *  pillar per repertoire year — the east flank's own tall-enough-to-matter
 *  set, same spirit as districtWest.ts's `westStructures()`: everything a
 *  visitor could plausibly drive past, nothing invented to pad the list. */
export function eastStructures(): TallStructure[] {
  return [
    ...excelsiorEditionBlocks().map((e) => ({ x: e.x, z: e.z, height: e.height })),
    ...writingArchive()
      .filter((a) => a.dated)
      .map((a) => ({ x: a.x, z: a.z, height: a.height })),
    ...repertoireYearPeaks(),
  ];
}

const DUST_MIN_HEIGHT = 6; // matches districtWest.ts's own threshold
const DUST_POINTS = 350;

/** ~350 points scattered across a box's six outer faces — the identical
 *  sampler districtWest.ts's own `sampleBoxSurface` implements, reproduced
 *  here rather than imported for the same "stays a plain data module"
 *  reasoning as `hashNoise` above. */
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

/** Structure dust for the east flank's largest landmarks: old town's three
 *  editions (all clear DUST_MIN_HEIGHT — 8, 7.75, 9m) and whichever writing-
 *  archive block does too ("Deadline", 3164 words -> 7.91m; every other
 *  archive entry falls short). Everything smaller resolves via the "rise"
 *  mode Corpus.tsx applies to its own shader instead — the design doc's
 *  "everything smaller scales in from 0 on the same trigger" half of the
 *  split. */
export function eastResolveSources(): ResolveSource[] {
  const sources: ResolveSource[] = [];
  const editionToken: PaletteToken = "accent2";
  for (const e of excelsiorEditionBlocks()) {
    if (e.height < DUST_MIN_HEIGHT) continue;
    const id = `edition:${e.year}`;
    sources.push({
      id,
      targets: sampleBoxSurface(id, e.x, e.height / 2 + CITY.groundY, e.z, EDITION_FOOTPRINT, e.height, EDITION_FOOTPRINT, DUST_POINTS),
      token: editionToken,
    });
  }
  const archiveToken: PaletteToken = "probe";
  for (const a of writingArchive()) {
    if (!a.dated || a.height < DUST_MIN_HEIGHT) continue;
    const id = `archive:${a.slug}`;
    sources.push({
      id,
      targets: sampleBoxSurface(id, a.x, a.height / 2 + CITY.groundY, a.z, ARCHIVE_FOOTPRINT, a.height, ARCHIVE_FOOTPRINT, DUST_POINTS),
      token: archiveToken,
    });
  }
  return sources;
}
