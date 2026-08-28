import { projectStats } from "../data/projectStats.ts";

/**
 * The one-line repo stat a card shows — modules, features, gateways — derived
 * from projectStats.ts, which gen-project-stats.mjs writes from each repo's
 * own settings.gradle.kts and README banner.
 *
 * It lives here rather than in App.tsx because two renderers need it: the
 * homepage project grid and ReposShowcase's "The Source" cards, which used to
 * carry a second, hand-typed copy of the same sentence. That copy said
 * "39 modules · 71 gateways" while this function computed 40 and 66 — the
 * exact drift a shared derivation makes impossible. It cannot live in
 * projectStats.ts either: that file carries a "do not edit by hand" banner
 * and the generator would overwrite anything added to it.
 *
 * Facts no generator produces (PaymentsLab's 5 rails, Kursi's 10 AI personas)
 * are the caller's to append — see ReposShowcase's APPS_CHROME.
 */
export function repoStatLine(slug: string): string | null {
  const s = projectStats[slug as keyof typeof projectStats];
  if (!s) return null;
  // `screenshots` is a PNG count over the repo's docs/screenshots folder (see
  // pngCount in gen-project-stats.mjs). It was labelled "tests" here and put
  // "368 tests" on the live Mileway card while every other surface said 159.
  // A screenshot is not a test; the label now says what the number is.
  // `modules + composedModules`, exactly as paymentslab below — the audited
  // definition of a module count here is "local includes + substituted
  // includeBuild projects" (claims.json `mileway-modules`). Using the raw
  // local count printed "36 modules" directly beneath the card's own
  // "[ 46 MODULES · 5 PLATFORMS · 159 TESTS ]", so one card contradicted
  // itself on its single most quoted number.
  if (slug === "mileway" && "features" in s) {
    return `${s.modules + s.composedModules} modules · ${s.features} features · ${s.screenshots} screenshots`;
  }
  if (slug === "paymentslab" && "gatewaysNative" in s) {
    const gateways = s.gatewaysNative + s.gatewaysHosted + s.gatewaysMobileMoney + s.gatewaysStub;
    return `${s.modules + s.composedModules} modules · ${gateways} gateways`;
  }
  if (slug === "kursi") return `${s.modules} modules · 4 platforms`;
  return `${s.modules} modules`;
}

/** Normalised for comparison: "46 modules" and "46 Modules" are one fact. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The distinct facts a project's curated status line already states. */
const statusFacts = (status: string) => new Set(status.split("·").map((x) => norm(x.trim())));

/**
 * A card prints THREE fact rows: the bracketed `status`, this generated stat
 * line, and the badge chips. Nothing stopped them saying the same thing, and
 * mostly they did — a Kursi card read
 *
 *     [ 14 MODULES · 4 PLATFORMS · 10 BOT PERSONAS ]
 *     ◇ 14 modules · 4 platforms
 *     … Kotlin Multiplatform · Game engine · ISMCTS AI
 *
 * and PaymentsLab said "40 modules · 66 gateways" three times in 200px. That
 * is the same redundancy the hero banners had, one layer down.
 *
 * These two keep the row that ADDS something and drop the part that echoes.
 * Mileway keeps "13 features · 368 screenshots" (genuinely new) and loses the
 * "46 modules" it had already said; Kursi's stat line disappears entirely,
 * because every word of it was already in the bracket above.
 */
export function statLineExtras(slug: string, status: string): string | null {
  const line = repoStatLine(slug);
  if (!line) return null;
  const known = statusFacts(status);
  const fresh = line.split("·").map((x) => x.trim()).filter((x) => x && !known.has(norm(x)));
  return fresh.length ? fresh.join(" · ") : null;
}

/** Badges minus the ones the status line already states verbatim. */
export function badgesBeyondStatus(badges: readonly string[], status: string): string[] {
  const known = statusFacts(status);
  return badges.filter((b) => !known.has(norm(b)));
}
