/**
 * The concept-painting fallback, per reality state (master-plan.md#M35,
 * #M43, #M69; world-v2-spec.md §8/§9; live-data-spec.md §2.3; living-
 * ledger-spec.md §5.2). P1-13's four Sangam frames stand in for the live
 * 3D scene wherever it cannot ship: reduced motion before opt-in,
 * saveData, no WebGL and Tier-3 (P3-07's consumers). Pure, like spawn.ts
 * and sangamSky.ts — no three/R3F import, and no read of
 * heavy/world/concept/concept.json at runtime (that JSON is a build-time
 * provenance ledger, never bundled; conceptPlates.test.ts is the one place
 * that reads it, to prove these literal filenames really are rows in it).
 *
 * Precedence (M69, pack-concept.mjs's own comment): a Diwali night beats
 * rain, rain beats plain night, otherwise the golden-spawn default.
 */
import { heavy } from "../../lib/assetBase.ts";
import type { Daypart } from "../../lib/sky.ts";
import type { FestivalSlug } from "./live/nightSky.ts";

export interface ConceptPlateInput {
  daypart: Daypart;
  /** `Weather.precipMmH` (src/lib/sky.ts) — right-now rain rate, mm/h. */
  precipMmH: number | null;
  /** `useSky.ts`'s rolling 6h total, mm. */
  rain6hMm: number | null;
  /** `activeFestivalForm(date)?.slug ?? null` (live/nightSky.ts). */
  festival: FestivalSlug | null;
}

export interface ConceptPlate {
  src: string;
  /** Width-descriptor srcset: the 960px sibling plus the full frame at its
   *  own real pixel width (sips-measured, not a guessed round number — a
   *  wrong width here only ever costs Chrome a slightly worse pick, but a
   *  false one is still a claim this codebase does not make elsewhere). */
  srcSet: string;
  alt: string;
  caption: string;
}

/** Shared across every state (this lane's own task list): the fallback
 *  never claims to be a live render, and points at the data list beside
 *  it rather than repeating a number a painting cannot honestly show. */
const CAPTION = "Concept painting: the look this valley is built toward, not a live render. The data is in the list beside it.";

interface Frame {
  /** heavy/world/concept/<id>.webp and <id>-960.webp (pack-concept.mjs). */
  id: string;
  /** Real pixel width of <id>.webp, from the committed file (sips -g pixelWidth). */
  fullWidth: number;
  alt: string;
}

const FRAMES = {
  goldenSpawn: { id: "01-golden-spawn", fullWidth: 1584, alt: "The Sangam valley at golden hour, seen from the spawn point." },
  nightSurvey: { id: "02-night-survey", fullWidth: 1408, alt: "The valley by night, lanterns lit along the ghats." },
  monsoon: { id: "03-monsoon", fullWidth: 1408, alt: "The valley under monsoon cloud and rain." },
  diwali: { id: "04-diwali", fullWidth: 1584, alt: "The valley at Diwali, the ghats lit for the festival." },
} satisfies Record<string, Frame>;

function plateFor(frame: Frame): ConceptPlate {
  const full = heavy(`/world/concept/${frame.id}.webp`);
  const small = heavy(`/world/concept/${frame.id}-960.webp`);
  return { src: full, srcSet: `${small} 960w, ${full} ${frame.fullWidth}w`, alt: frame.alt, caption: CAPTION };
}

function isRaining(precipMmH: number | null, rain6hMm: number | null): boolean {
  return (precipMmH != null && precipMmH > 0) || (rain6hMm != null && rain6hMm >= 0.5);
}

/** Diwali night > rain > night > golden-spawn default (M69). */
export function pickConceptPlate({ daypart, precipMmH, rain6hMm, festival }: ConceptPlateInput): ConceptPlate {
  if (festival === "diwali") return plateFor(FRAMES.diwali);
  if (isRaining(precipMmH, rain6hMm)) return plateFor(FRAMES.monsoon);
  if (daypart === "night") return plateFor(FRAMES.nightSurvey);
  return plateFor(FRAMES.goldenSpawn);
}
