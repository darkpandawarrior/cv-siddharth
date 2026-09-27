/**
 * The night sky's pure transfer functions (live-data-spec.md §2.2 binding
 * table rows 12-15; master-plan.md#M10/#M12/#M16/#M56). Pure — no three/R3F
 * import, same discipline as `liveBinding.ts` and `sangamSky.ts`. The
 * render layers (`../layers/NightSky.tsx`, `../layers/FestivalLayer.tsx`)
 * turn these into pixels; everything testable at a fixture/clamp/null value
 * lives here instead, the same split `liveBinding.ts`'s own doc comment
 * describes for rows 1-11/16-23.
 *
 * Reuses `liveBinding.ts`'s `sat`/`ss` primitives and its row-9 `hazeBinding`
 * (the star-limit reduction is that row's own `starDeltaM`) rather than a
 * second copy — one haze->Δm formula, not two drifting apart.
 */
import { ss, sat, hazeBinding } from "./liveBinding.ts";
import type { DeviceTier } from "../../deviceTier.ts";
import type { SatelliteVisibility } from "../../../lib/satellites.ts";
import { activeFestival } from "../../../data/skyCalendar.ts";

// ---------------------------------------------------------------------------
// Row 13 — Stars: HYG bin, mLim and per-star alpha
// ---------------------------------------------------------------------------

/** "tiers draw to mag 5.0 / 4.5 / 4.0" (row 13). */
export const STAR_MAG_CEILING: Readonly<Record<DeviceTier, number>> = { 1: 5.0, 2: 4.5, 3: 4.0 };

/** `mLim = 5.0 - Δm - 1.5·f·ss(0, 20, moonAlt)` (row 13), where Δm is row 9's
 *  own haze reduction (`hazeBinding(pm25).starDeltaM`) — never a second haze
 *  formula. `moonAltDeg < 0` (moon not risen) naturally zeroes the moon term
 *  through `ss`'s own clamp, no separate branch needed. */
export function starMagLimit(pm25: number | null, moonFraction: number, moonAltDeg: number): number {
  const deltaHaze = hazeBinding(pm25).starDeltaM;
  const moonTerm = 1.5 * moonFraction * ss(0, 20, moonAltDeg);
  return 5.0 - deltaHaze - moonTerm;
}

/** The raw limit, capped at this device tier's own ceiling — never above it
 *  even on a haze-free, moonless night (row 13's "tiers draw to" clause is a
 *  hard ceiling, not just a floor-side reduction). */
export function effectiveStarMagLimit(rawLimit: number, tier: DeviceTier): number {
  return Math.min(rawLimit, STAR_MAG_CEILING[tier]);
}

/** `alpha = ss(-6,-12,α) · (1 - ss(0.7,0.9,c)) · ss(mLim+0.5, mLim-0.5, mag)`
 *  (row 13) for one star of magnitude `mag`. `cloudPct` is the raw 0-100
 *  reading (row 3's own convention); `null -> c = 0` (drawn clear, same as
 *  every other cloud-gated row). The cloud factor alone saturates to 0 at
 *  `cloudPct >= 90` regardless of sun altitude or magnitude — the overcast
 *  fixture (c = 0.95) keeps the night frame identical to Night Survey, as
 *  row 13 states. */
export function starFieldAlpha(sunAltDeg: number, cloudPct: number | null, magLimit: number, mag: number): number {
  const c = cloudPct == null ? 0 : sat(cloudPct / 100);
  const nightFactor = ss(-6, -12, sunAltDeg);
  const cloudFactor = 1 - ss(0.7, 0.9, c);
  const magFactor = ss(magLimit + 0.5, magLimit - 0.5, mag);
  return nightFactor * cloudFactor * magFactor;
}

// ---------------------------------------------------------------------------
// Row 12 — Moon disc: drawn iff alt > -1°
// ---------------------------------------------------------------------------

/** "disc when alt > -1°" (row 12) — the one gate `NightSky.tsx` reads before
 *  mounting the moon mesh at all. */
export function moonDiscVisible(moonAltDeg: number): boolean {
  return moonAltDeg > -1;
}

// ---------------------------------------------------------------------------
// Row 14 — ISS marker
// ---------------------------------------------------------------------------

/** `data-live-iss` value (this lane's own e2e contract): `null`/`undefined`
 *  (below the horizon, or `useSatellites()` not ready yet) -> "below";
 *  `satellite.js`'s own "eye" classification (sunlit AND Pune's sky dark,
 *  i.e. `alpha < -6`, per `satellites.ts`'s `classify()`) -> "visible", a
 *  bright streak; anything else above the horizon (`daylight` sunlit-but-
 *  bright-sky, or `shadow` in Earth's shadow) -> "above-not-visible", a
 *  faint ring labelled "ISS above the horizon, not visible to the eye now"
 *  (row 14's own fallback text). Reuses `classify()`'s three-way split
 *  rather than re-deriving "sunlit and alpha < -6" a second time. */
export type IssMarkerState = "visible" | "above-not-visible" | "below";

export function issMarkerState(reading: { state: SatelliteVisibility } | null | undefined): IssMarkerState {
  if (!reading) return "below";
  return reading.state === "eye" ? "visible" : "above-not-visible";
}

export const ISS_NOT_VISIBLE_LABEL = "ISS above the horizon, not visible to the eye now";

// ---------------------------------------------------------------------------
// Row 15 — Festival calendar: four distinct ambient forms (M16), never diyas
// ---------------------------------------------------------------------------

export type FestivalSlug = "diwali" | "ganeshotsav" | "makar-sankranti" | "gudi-padwa";

/** `festival-kit.glb`'s own four node names (P2-07b's `kitSockets.arch2`
 *  fixture) — never a fifth form, never a node named `diya*` (M16). */
export type FestivalNode = "RangoliDecal" | "ToranGarland" | "PaperKite" | "Gudi";

export interface FestivalForm {
  slug: FestivalSlug;
  node: FestivalNode;
}

/** M16's mapping from `skyCalendar.ts`'s festival names to festival-kit's
 *  ambient forms — the same pairing the original per-festival table (live-
 *  data-spec §2.2 row 15, superseded in form but not in which festival is
 *  which) already drew: Diwali's rangoli at the ghat landing, Ganeshotsav's
 *  toran on the room chhatris, Sankranti's kites over the east meadow,
 *  Gudi Padwa's gudi on the room chhatris. */
const FESTIVAL_FORMS: Readonly<Record<string, FestivalForm>> = {
  Diwali: { slug: "diwali", node: "RangoliDecal" },
  Ganeshotsav: { slug: "ganeshotsav", node: "ToranGarland" },
  "Makar Sankranti": { slug: "makar-sankranti", node: "PaperKite" },
  "Gudi Padwa": { slug: "gudi-padwa", node: "Gudi" },
};

/** The active festival's ambient form at `date`, or `null` when none is
 *  active (including past `skyCalendar.ts`'s own `validUntil`, which
 *  `activeFestival` already refuses past). `FestivalLayer.tsx` draws
 *  nothing at all, and mounts no instances, when this is `null` — "nothing
 *  drawn past validUntil" (this lane's own task list). */
export function activeFestivalForm(date: Date): FestivalForm | null {
  const row = activeFestival(date);
  if (!row) return null;
  return FESTIVAL_FORMS[row.name] ?? null;
}
