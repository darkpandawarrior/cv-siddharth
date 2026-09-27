/**
 * Landmark bindings (P3-01a's own task list, world-v2-spec.md #5 rows 1-9):
 * the pure adapter between a `WorldModel` and the per-landmark render props
 * `kits/architecture.ts` needs. Every count here is read off
 * `WorldModel.features` (grammar.ts's G14 `landmark-facet` rows, or a plain
 * live value already carried by `WorldModel`/`Now`) - never `src/data/*`
 * and never `ledger.ts` directly (this lane's own acceptance line,
 * living-ledger-spec.md #9.3 streamFence rule 3). Zero three/R3F/React/DOM
 * imports, same discipline as worldModel.ts itself.
 *
 * Known, documented gap: grammar.ts's G14 (owned by the already-merged
 * P2-03c) only wraps the facets its own Ledger access could reach at the
 * time (grammar.ts's own comment: "Fields the ledger cannot answer ... are
 * out of this lane's reach"). Doori's schema-ring count
 * (`projectStats.doori.schemaVersion`) and the twin chhatri's inlay count
 * (`repoStats.testFiles`) are not among G14's facets, and `ledger.ts` (the
 * only sanctioned src/data/* gateway) does not expose `repoStats` at all.
 * Adding either means editing grammar.ts and/or ledger.ts, both outside
 * this lane's `owns` (G2). Rather than reach past the fence, both render
 * "unmeasured" here, the same honest-gap convention G3/REC-7 already use
 * elsewhere in this codebase - see the lane's own report for the precise
 * acceptance items this leaves met=false.
 */
import type { DetailLink, Feature } from "./worldModel.ts";

const LANDMARK_RULE = "landmark-facet";

/** `field -> scalar` for one landmark's own G14 facets, parsed off each
 *  feature's own id (`landmark-facet:<landmark>:<field>`, grammar.ts's own
 *  `placementSeed`) - the same parse `LandmarkList.tsx`'s
 *  `landmarksFromFeatures` already uses for the landmark name half. */
export function facetsFor(features: readonly Feature[], landmark: string): ReadonlyMap<string, number> {
  const prefix = `${LANDMARK_RULE}:${landmark}:`;
  const map = new Map<string, number>();
  for (const f of features) {
    if (f.rule !== LANDMARK_RULE || !f.id.startsWith(prefix)) continue;
    map.set(f.id.slice(prefix.length), f.scalar);
  }
  return map;
}

// ── #1 sangam-keystone-bridge ───────────────────────────────────────────────
export interface BridgeBinding {
  voussoirs: number;
  piers: number;
  deckLamps: number;
}
/** Fixed, always-dry: REC-1's zero-consumer module list, baked as this
 *  landmark's 8 named niche sockets (kitSockets.audit.test.ts). Braiding an
 *  extra rivulet at "the first-substitution month" (REC-1) needs a per-app
 *  first-substitution date T4 does not emit yet (idea-atlas: "T4 not
 *  started") - skipped for that reason, not an ownership one; add once T4
 *  ships the date field. */
export const DRY_NICHES: readonly string[] = [
  "deviceIntegrity",
  "biometric",
  "secureStore",
  "auth",
  "netlog",
  "charts",
  "store",
  "secretsPattern",
];
export function bridgeBinding(features: readonly Feature[]): BridgeBinding {
  const f = facetsFor(features, "bridge");
  return { voussoirs: f.get("voussoirs") ?? 0, piers: f.get("piers") ?? 0, deckLamps: f.get("deckLamps") ?? 0 };
}

// ── #2 doori-ghat ────────────────────────────────────────────────────────────
export interface DooriBinding {
  steps: number;
  pillarBands: number;
  /** false today (see this file's module doc): the schema pillar renders as
   *  one unmeasured grey band rather than a guessed count. */
  schemaMeasured: boolean;
  schemaVersion: number | null;
}
export function dooriBinding(features: readonly Feature[]): DooriBinding {
  const f = facetsFor(features, "doori");
  return { steps: f.get("steps") ?? 0, pillarBands: f.get("pillarBands") ?? 0, schemaMeasured: false, schemaVersion: null };
}

// ── #3 gaddi-ghat ────────────────────────────────────────────────────────────
export interface GaddiBinding {
  steps: number;
}
export function gaddiBinding(features: readonly Feature[]): GaddiBinding {
  return { steps: facetsFor(features, "gaddi").get("steps") ?? 0 };
}

// ── #4 `paymentslab-bell-toran` ────────────────────────────────────────────
export const BELL_ARCHETYPES = ["native", "hosted", "mobileMoney", "internal", "stub"] as const;
export type BellArchetype = (typeof BELL_ARCHETYPES)[number];
const BELL_FACET_FIELD: Readonly<Record<BellArchetype, string>> = {
  native: "bellsNative",
  hosted: "bellsHosted",
  mobileMoney: "bellsMobileMoney",
  internal: "bellsInternal",
  stub: "bellsStub",
};
export type BellToranBinding = Readonly<Record<BellArchetype, number>>;
/** Bell counts, one per PaymentsLab-KMP archetype, read off G14's
 *  `paymentslab-kmp:*` facets (grammar.ts, gen-project-stats.mjs's own
 *  README-regex parse). REC-2's intent is for these to equal providers.ts's
 *  own per-file archetype count (gen-providers.mjs, 75 parsed docs); today
 *  the two have drifted (17/43/9/1/4 vs this facet's 15/44/7/1/3) because
 *  they are two separately-generated, already-merged files this lane does
 *  not own. This function stays on the one WorldModel-sanctioned source
 *  (streamFence rule 3) rather than reading providers.ts directly - see the
 *  lane report for the resulting acceptance item. */
export function bellToranBinding(features: readonly Feature[]): BellToranBinding {
  const f = facetsFor(features, "paymentslab-kmp");
  const out = {} as Record<BellArchetype, number>;
  for (const a of BELL_ARCHETYPES) out[a] = f.get(BELL_FACET_FIELD[a]) ?? 0;
  return out;
}
export function bellTotal(binding: BellToranBinding): number {
  return BELL_ARCHETYPES.reduce((sum, a) => sum + binding[a], 0);
}

// ── #5 candidai-rahat ────────────────────────────────────────────────────────
/** Fixed cardinality (candidai-rahat.glb's own 5 `socket.bucket.N` nodes,
 *  kitSockets.arch1.test.ts) - "one engine, five targets" is an
 *  architectural fact of the repo, not a growing count. */
export const RAHAT_BUCKETS = 5;

// ── #6 template-gomukh ───────────────────────────────────────────────────────
/** Fixed cardinality (template-gomukh.glb's own two `socket.spout.*`
 *  nodes) - the template has exactly two includeBuild consumers modelled in
 *  the kit itself. */
export const GOMUKH_SPOUTS = 2;

// ── #7 portfolio-twin-chhatri ────────────────────────────────────────────────
export interface TwinChhatriBinding {
  /** null = unmeasured (see this file's module doc: repoStats.testFiles is
   *  not reachable through ledger.ts/WorldModel today). */
  inlayTiles: number | null;
}
export function twinChhatriBinding(features: readonly Feature[]): TwinChhatriBinding {
  const v = facetsFor(features, "portfolio").get("testFiles");
  return { inlayTiles: v ?? null };
}

// ── #8 stutter-samrat-yantra ─────────────────────────────────────────────────
export interface YantraBinding {
  azimuthDeg: number;
  /** False -> the true-shadow inlay is absent and the panel says the sun is
   *  down in Pune (SKY-4). */
  sunUp: boolean;
}
/** Pure wrap of the SAME `sunPosition` reading `useNowModel`'s `sky.sun`
 *  already carries (M53: no second clock, no second sun computation) - the
 *  caller passes `sky.sun.azimuthDeg`/`altitudeDeg` straight through. */
export function yantraBinding(azimuthDeg: number, altitudeDeg: number): YantraBinding {
  return { azimuthDeg, sunUp: altitudeDeg > 0 };
}

// ── #9 sinc-p-baori ──────────────────────────────────────────────────────────
/** The four named levels, in the documented gate order (WORLD-9: "track,
 *  then role, then record"). Names mirror sinc-p-baori.glb's own
 *  `level.*` node names verbatim (kitSockets.arch1.test.ts) so the label a
 *  visitor reads is never a second, invented name for the same fact. */
export const BAORI_LEVELS: readonly { id: string; label: string }[] = [
  { id: "sinc-p:level:tenant-isolation", label: "Tenant isolation" },
  { id: "sinc-p:level:audit-chain-atomicity", label: "Audit-chain atomicity" },
  { id: "sinc-p:level:statutory-track-priority", label: "Statutory-track priority" },
  { id: "sinc-p:level:no-automated-outcomes", label: "No automated outcomes" },
];
/** Only the first three gate the innermost (fourth) level's mooring sensor -
 *  WORLD-9's own gate-order rule. */
export const BAORI_GATE_IDS: readonly string[] = BAORI_LEVELS.slice(0, 3).map((l) => l.id);
export const BAORI_COUNCIL_PILLARS = 7;
export const BAORI_DEEPSEEK_PILLAR = "pillar.deepseek";

/**
 * True once every id in `BAORI_GATE_IDS` was `touch()`-ed, in that relative
 * order, this session (`useTouched()`'s own append-and-dedupe-to-the-end
 * semantics mean a level touched again after a later one moves back to the
 * end, correctly failing this check - WORLD-9's "reversing that order is
 * precisely the bug").
 */
export function baoriInnermostReady(touched: readonly string[]): boolean {
  let lastIndex = -1;
  for (const id of BAORI_GATE_IDS) {
    const at = touched.indexOf(id);
    if (at === -1 || at <= lastIndex) return false;
    lastIndex = at;
  }
  return true;
}

// ── opens: Destination.detailLink, per world-v2-spec.md #5's own column ────
/** Static per-landmark routing (world-v2-spec's own "opens" column) - a
 *  fixed authoring fact, not data, the same way `destinations.ts` keeps its
 *  own table for v1. `template-gomukh` and the dry niches carry no entry:
 *  hover label only, no project page, per the spec. */
export const LANDMARK_OPENS: Readonly<Record<string, DetailLink>> = {
  bridge: { kind: "project", target: "kmp-family" },
  doori: { kind: "project", target: "doori" },
  gaddi: { kind: "project", target: "gaddi" },
  "paymentslab-kmp": { kind: "project", target: "paymentslab-kmp" },
  candidai: { kind: "project", target: "candidai" },
  portfolio: { kind: "project", target: "portfolio" },
  stutter: { kind: "project", target: "stutter" },
  "sinc-p": { kind: "project", target: "sinc-p" },
};
