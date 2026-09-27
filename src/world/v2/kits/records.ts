/**
 * The visual kit for this lane's own landmarks — plain geometry-arg tuples
 * and colour pickers `layers/LandmarksRecords.tsx` composes into a handful
 * of `<Instances>` groups (`GrammarInstances.tsx`'s own "one group per
 * shape, not one mesh per feature" discipline, so the deepmal's draw-call
 * count stays flat as `fleetStats.live` grows — lightProbe.test.ts's own
 * acceptance line).
 *
 * Deliberately NOT a `kits.ts`-registry kit: no `default` export, no
 * `export const kit = {form}`. `kits.ts`'s `import.meta.glob("./kits/*.ts")`
 * skips a module missing those two exports (its own `resolveKits` doc
 * comment already says so), which is exactly what keeps this file from
 * claiming `niche-lamp`/`pr-stone` and silently emptying
 * `GrammarInstancesDom`'s placeholder mirror out from under
 * `e2e/world-v2.spec.ts` (P2-19, not this lane's to edit) — see
 * recordBindings.ts's own docblock for the full reasoning.
 */
import type { WorldPalette } from "../../palette.ts";

// ── Deepmal (niches) ─────────────────────────────────────────────────────

export const NICHE_GEOMETRY_ARGS: readonly [number, number, number, number] = [0.4, 0.45, 0.5, 10];

/** A small, stable per-era hue nudge — deterministic off the era key's own
 *  characters, never `Math.random()`. Purely decorative banding on top of
 *  the real lit/dark colour; niche state (lit vs delisted) always reads
 *  first (`nicheColor` picks the base, this only nudges lightness). */
function eraNudge(eraKey: string): number {
  let h = 0;
  for (let i = 0; i < eraKey.length; i++) h = (h * 31 + eraKey.charCodeAt(i)) % 97;
  return h / 97; // 0..1
}

export function nicheColor(lit: boolean, eraKey: string | null, palette: WorldPalette): string {
  if (!lit) return palette.line; // dark/unmeasured — grey, per REC-7
  return eraKey && eraKey !== "unmeasured" ? palette.accent : palette.accentDim;
}

export function nicheScale(lit: boolean): number {
  return lit ? 1 : 0.85;
}

export { eraNudge };

// ── Stepping stones (pr-stone / cairn / submerged) ──────────────────────────

export const STONE_GEOMETRY_ARGS: readonly [number, number, number] = [0.9, 0.3, 0.7];
export const CAIRN_GEOMETRY_ARGS: readonly [number, number, number] = [0.7, 0.5, 0.7];
export const SUBMERGED_GEOMETRY_ARGS: readonly [number, number, number] = [0.7, 0.15, 0.55];

const BASALT = "#2b2b2f";
const LATERITE = "#9c4b2e";

/** Basalt for career-ops-hq, laterite for openMF — the lane's own task
 *  list ("basalt career-ops, laterite openMF"). A third org (none exist
 *  today) falls back to a plain river stone so this never throws. */
export function stoneColor(material: "basalt" | "laterite" | "stone", palette: WorldPalette): string {
  if (material === "basalt") return BASALT;
  if (material === "laterite") return LATERITE;
  return palette.line;
}

/** Recurrence rim — a repo merged 3+ times reads as the site's own signal
 *  amber instead of its plain material colour; three's per-instance colour
 *  attribute is the only thing `<Instance>` actually varies per stone (no
 *  per-instance emissive without a custom shader), so recurrence has to win
 *  or lose the base colour outright rather than layer on top of it. */
export function stoneOrRecurrenceColor(material: "basalt" | "laterite" | "stone", recurrence: boolean, palette: WorldPalette): string {
  return recurrence ? palette.accent : stoneColor(material, palette);
}

/** Submerged (open PRs, never walkable): a dim probe tint, sitting low —
 *  "not walkable" is the y offset the layer applies, this is only colour. */
export function submergedColor(palette: WorldPalette): string {
  return palette.probe;
}

// ── Weirs ────────────────────────────────────────────────────────────────

export const WEIR_GEOMETRY_ARGS: readonly [number, number, number] = [1.6, 0.6, 0.5];

export function weirColor(palette: WorldPalette): string {
  return palette.surface;
}

// ── Employer ghats (hover-only, never clickable) ────────────────────────

export const GHAT_LANDING_GEOMETRY_ARGS: readonly [number, number, number] = [1.4, 0.3, 1.4];
export const GHAT_STEP_GEOMETRY_ARGS: readonly [number, number, number] = [1.2, 0.18, 0.4];
export const GHAT_HOUSE_GEOMETRY_ARGS: readonly [number, number, number] = [2, 1.4, 2];

const GHAT_PLASTER = "#c9a879";
const GHAT_ROOF = "#a5432c";

export function ghatPlasterColor(): string {
  return GHAT_PLASTER;
}
export function ghatRoofColor(): string {
  return GHAT_ROOF;
}

/** A flight's landing is banded by its own `ExperiencePoint.tier` — tier 1
 *  (one-pager) reads brightest, tier 2 dimmer, an untiered ("full") bullet
 *  darkest — never a colour outside the site's own signal family. */
export function flightLandingColor(tier: 1 | 2 | "full", palette: WorldPalette): string {
  if (tier === 1) return palette.accent;
  if (tier === 2) return palette.accentDim;
  return palette.line;
}

// ── Hero stones (vīragal registers) ──────────────────────────────────────

export const HERO_STONE_GEOMETRY_ARGS: readonly [number, number, number] = [0.6, 1.6, 0.25];
export const HERO_REGISTER_GEOMETRY_ARGS: readonly [number, number, number] = [0.62, 0.06, 0.27];

export function heroStoneColor(): string {
  return BASALT;
}
export function heroRegisterColor(palette: WorldPalette): string {
  return palette.accentDim;
}

// ── Room chhatris ─────────────────────────────────────────────────────────

export const CHHATRI_PILLAR_GEOMETRY_ARGS: readonly [number, number, number, number] = [0.12, 0.12, 2.2, 8];
export const CHHATRI_DOME_GEOMETRY_ARGS: readonly [number, number, number] = [0.9, 8, 6];

export function chhatriStoneColor(palette: WorldPalette): string {
  return palette.text;
}

// ── Old town Excelsior (hover labels only) ───────────────────────────────

export const OLD_TOWN_HOUSE_GEOMETRY_ARGS: readonly [number, number, number] = [1.6, 2, 1.6];

export function oldTownColor(palette: WorldPalette): string {
  return palette.card;
}

/** Print-house height from era piece count — `pages/16` per world-v2-spec
 *  §5 row 18's own ratio; `pieceCount` stands in for "pages" honestly
 *  (`writing.archive`'s own entries, not a page-accurate reprint count the
 *  Blender kit this lane doesn't own would supply). Floored so a lone
 *  undated piece still reads as a real, visible structure. */
export function oldTownHeight(pieceCount: number): number {
  return Math.max(1.2, pieceCount / 2);
}

// ── Benchmarks (survey plaques) ───────────────────────────────────────────

export const BENCHMARK_GEOMETRY_ARGS: readonly [number, number, number] = [0.3, 0.5, 0.1];

export function benchmarkColor(palette: WorldPalette): string {
  return palette.accent2;
}
