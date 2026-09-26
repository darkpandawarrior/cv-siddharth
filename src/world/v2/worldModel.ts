/**
 * `world = f(ledger, now, you)` (living-ledger-spec §3.1). This is the ONE
 * place `GRAMMAR` becomes placed, dated, deterministic `Feature`s
 * (`landOf`), `STREAMS` becomes live bindings (`aliveOf`), and the two
 * combine into the `WorldModel` a renderer actually reads. A renderer never
 * reads `src/data/*` or `Ledger` directly — only this file's output
 * (streamFence.test.ts, D1).
 *
 * Zero three/R3F/React/DOM imports, zero clock reads (`now` is always
 * passed in) — purity.test.ts holds this file to the same D1 guarantee as
 * every other pure module under src/world/v2.
 */
import { GRAMMAR, type GrowthRule, type LedgerRow, type ScalePlan } from "./grammar.ts";
import type { Ledger } from "./ledger.ts";
import { STREAMS, type Stream, type StreamClass } from "./streams.ts";
import { hashNoise, stringSeed } from "./hash.ts";
import { dateZ } from "../city.ts";
import { visitDiff, type LastSeen, type VisitDiffResult } from "./visitDiff.ts";

export type Altitude = "street" | "orbit" | "globe";

// ── Now: everything true right now, passed in — never read from a clock ──
export interface SkyState {
  daypart: "night" | "dawn" | "day" | "dusk";
  cloud: number; // 0..1
  tempC: number | null;
}
export interface MoonState {
  phase: number; // 0..1
  altitudeDeg: number;
}
export interface AirNow {
  pm25: number;
  aqiUs: number;
  aod: number;
}
export interface RiverNow {
  levelDeltaM: number; // vs the 7-day range
  flowSpeed: number;
  foam: number;
}
export interface OverheadNow {
  aircraft: number;
  satellites: number;
}
export interface Push {
  at: string;
  repo: string;
}
export interface CiState {
  state: "pass" | "fail" | "none";
}
export interface Radio {
  track: string | null;
  artist: string | null;
}

export interface Now {
  at: Date;
  sky: SkyState;
  moon: MoonState;
  rain6h: number | null;
  air: AirNow | null;
  river: RiverNow | null;
  overhead: OverheadNow | null;
  pushes24h: Push[];
  ci: CiState | null;
  presence: { here: number; countries: Record<string, number> };
  radio: Radio | null;
}

export interface You {
  touched: readonly string[];
  lastSeen: LastSeen | null;
  tier: 1 | 2 | 3;
  reducedMotion: boolean;
}

export type DetailLink = { kind: "project" | "home-anchor" | "route"; target: string };

export interface Feature {
  id: string; // `${rule.id}:${placementSeed}` — the stability key (D3)
  rule: string;
  form: string;
  pos: [number, number, number];
  scalar: number;
  state: "lit" | "dark" | "unmeasured" | "peak" | "reserved";
  label: string;
  date: string | null;
  opens?: DetailLink;
}

export interface StreamBinding {
  id: string;
  class: StreamClass;
  form: string | string[];
  claim: boolean;
  value: unknown;
}

export interface WorldModel {
  asOf: string;
  features: Feature[];
  bindings: StreamBinding[];
  rows: LedgerRow[];
  diff: VisitDiffResult | null;
}

// ── Placement (D3): z from dateZ(dateOf(r)) or the rule's shelf; lateral
// jitter from hashNoise(stringSeed(seed)). Every rule gets a fixed,
// deterministic jitter width and undated shelf so two runs over the same
// ledger always agree (placements.test.ts). ──
const DEFAULT_JITTER = 4;
const JITTER_BY_RULE: Readonly<Record<string, number>> = {
  "year-strata": 2,
  "river-width": 1,
  firefly: 12,
  "deepmal-niche": 10,
};
const SHELF_Z_BY_RULE: Readonly<Record<string, number>> = {
  firefly: -60,
  "landmark-facet": 0,
  "reach-installs": 0,
  "reach-upstream": 0,
};

function zFor(ruleId: string, date: string | null): number {
  if (date !== null) {
    const z = dateZ(date);
    if (z !== null) return z;
  }
  return SHELF_Z_BY_RULE[ruleId] ?? 0;
}

function buildFeature<R>(rule: GrowthRule<R>, r: R, all: readonly R[]): Feature {
  const seed = rule.placementSeed(r);
  const date = rule.dateOf(r);
  const partial = rule.featureOf(r, all);
  const jitter = JITTER_BY_RULE[rule.id] ?? DEFAULT_JITTER;
  const x = hashNoise(stringSeed(seed)) * jitter;
  const z = zFor(rule.id, date);
  return {
    id: `${rule.id}:${seed}`,
    rule: rule.id,
    form: (partial.form as string | undefined) ?? rule.form,
    pos: partial.pos ?? [x, 0, z],
    scalar: partial.scalar ?? 0,
    state: partial.state ?? (rule.unmeasured(r) ? "unmeasured" : "lit"),
    label: partial.label ?? "",
    date,
    opens: partial.opens,
  };
}

/** Rows past a rule's `scale.cap10x` fold into one synthetic overflow
 *  feature rather than one instance each (D4). The rule's own `countOf` —
 *  the number the ledger states as a claim — is entirely unaffected: only
 *  the render-instance list is capped here. */
function applyScalePlan(rule: GrowthRule<unknown>, features: Feature[]): Feature[] {
  const scale: ScalePlan = rule.scale;
  if ("exempt" in scale) return features;
  if (features.length <= scale.cap10x) return features;
  const kept = features.slice(0, Math.max(0, scale.cap10x - 1));
  const folded = features.slice(kept.length);
  if (folded.length === 0) return kept;
  const overflow: Feature = {
    id: `${rule.id}:overflow`,
    rule: rule.id,
    form: rule.form,
    pos: folded[0].pos,
    scalar: folded.reduce((n, f) => n + (f.scalar || 1), 0),
    state: "unmeasured",
    label: `${folded.length} more (${scale.mechanism})`,
    date: null,
  };
  return [...kept, overflow];
}

/** A record's own effective date for replay: its real `dateOf`, or the
 *  ledger's own generatedAt month for an undated record (living-ledger
 *  §8.3: "Undated records... appear at their source's snapshot month"). */
function effectiveYm(rule: GrowthRule<unknown>, r: unknown, ledger: Ledger): string {
  const date = rule.dateOf(r);
  if (date !== null) return date.slice(0, 7);
  return ledger.generatedAt.slice(0, 7);
}

export function landOf(ledger: Ledger, asOf?: string): Feature[] {
  const features: Feature[] = [];
  for (const rule of GRAMMAR) {
    const all = rule.source(ledger);
    const rows = asOf === undefined ? all : all.filter((r) => effectiveYm(rule, r, ledger) <= asOf);
    const built = rows.map((r) => buildFeature(rule, r, all));
    features.push(...applyScalePlan(rule, built));
  }
  return features;
}

/** Straight passthrough of a stream's declared shape into a binding, plus
 *  whatever value `now` actually carries for it. The live fetch/physics for
 *  each stream (weather, sky, presence...) belongs to the stream's own
 *  renderer module under src/world/v2/live/ — this function only shapes
 *  what `now` already holds, deterministically, per living-ledger §4. */
function valueFor(streamId: string, now: Now): unknown {
  switch (streamId) {
    case "sun":
    case "weather":
      return now.sky;
    case "moon":
      return now.moon;
    case "rain6h":
      return now.rain6h;
    case "air":
      return now.air;
    case "river":
      return now.river;
    case "aircraft":
    case "satellites":
      return now.overhead;
    case "pushes24h":
      return now.pushes24h;
    case "ci-site":
    case "ci-family":
      return now.ci;
    case "presence":
    case "presence-countries":
      return now.presence;
    case "radio":
      return now.radio;
    default:
      // season, stars, kites-devto (live), downloads, chess-presence,
      // touched, last-visit, festival, birds, reach-counter: driven by
      // their own live/local/session source, not by `Now`'s shape — their
      // renderer reads that source directly (streamFence.test.ts's fence
      // is exactly the boundary that keeps this switch from having to grow
      // a case for every one of them here).
      return null;
  }
}

export function aliveOf(now: Now, tier: 1 | 2 | 3): StreamBinding[] {
  return STREAMS.filter((s: Stream) => s.altitudes.length > 0).map((s) => ({
    id: s.id,
    class: s.class,
    form: s.form,
    claim: s.claim,
    value: tier === 3 && s.tiers[3] === "" ? null : valueFor(s.id, now),
  }));
}

export function worldModel(ledger: Ledger, now: Now, you: You, asOf?: string): WorldModel {
  const features = landOf(ledger, asOf);
  const bindings = aliveOf(now, you.tier);
  const rows = GRAMMAR.map((rule) => rule.ledgerRow(rule.source(ledger), ledger));
  const counts: Record<string, number> = {};
  for (const rule of GRAMMAR) {
    if (rule.class === "I") counts[rule.id] = rule.countOf(rule.source(ledger));
  }
  const diff = visitDiff(features, counts, you.lastSeen, now.at);
  return { asOf: asOf ?? ledger.generatedAt, features, bindings, rows, diff };
}
