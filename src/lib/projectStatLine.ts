import { projectStats } from "../data/projectStats.ts";

/**
 * The one-line repo stat a card shows — modules, features, gateways — derived
 * from projectStats.ts, which gen-project-stats.mjs writes from each repo's
 * own settings.gradle.kts and README banner, keyed by the site's own current
 * slugs (renamed 2026-09-05 — gen-project-stats.mjs emits doori/paymentslab-kmp/gaddi
 * directly, so no translation table is needed here any more).
 *
 * It lives here rather than in App.tsx because two renderers need it: the
 * homepage project grid and ReposShowcase's "The Source" cards, which used to
 * carry a second, hand-typed copy of the same sentence. That copy said
 * "39 modules · 71 gateways" while this function computed 40 and 66 — the
 * exact drift a shared derivation makes impossible. It cannot live in
 * projectStats.ts either: that file carries a "do not edit by hand" banner
 * and the generator would overwrite anything added to it.
 *
 * Facts no generator produces (PaymentsLab-KMP's 5 rails, Gaddi's 10 AI
 * personas) are the caller's to append — see ReposShowcase's APPS_CHROME.
 */
export const dooriStats = projectStats.doori;
export const paymentStats = projectStats["paymentslab-kmp"];

/** Local and substituted modules use the same definition on every surface. */
export const projectModuleCounts = {
  doori: projectStats.doori.modules + projectStats.doori.composedModules,
  "paymentslab-kmp": projectStats["paymentslab-kmp"].modules + projectStats["paymentslab-kmp"].composedModules,
  gaddi: projectStats.gaddi.modules,
} as const;

export const paymentGatewayCount = projectStats["paymentslab-kmp"].gatewaysNative
  + projectStats["paymentslab-kmp"].gatewaysHosted + projectStats["paymentslab-kmp"].gatewaysMobileMoney
  + projectStats["paymentslab-kmp"].gatewaysStub
  + Number("gatewaysInternal" in projectStats["paymentslab-kmp"] ? projectStats["paymentslab-kmp"].gatewaysInternal : 0);

export function repoStatLine(slug: string): string | null {
  const s = projectStats[slug as keyof typeof projectStats];
  if (!s) return null;
  // `screenshots` is a PNG count over the repo's docs/screenshots folder (see
  // pngCount in gen-project-stats.mjs). It was labelled "tests" here and put
  // "368 tests" on the live Doori card while every other surface said 159.
  // A screenshot is not a test; the label now says what the number is.
  // `modules + composedModules`, exactly as paymentslab-kmp below — the audited
  // definition of a module count here is "local includes + substituted
  // includeBuild projects" (claims.json `mileway-modules`). Using the raw
  // local count printed "36 modules" directly beneath the card's own
  // "[ 46 MODULES · 5 PLATFORMS · 159 TESTS ]", so one card contradicted
  // itself on its single most quoted number.
  if (slug === "doori" && "features" in s) {
    return `${s.modules + s.composedModules} modules · ${s.features} features · ${s.screenshots} screenshots`;
  }
  if (slug === "paymentslab-kmp" && "gatewaysNative" in s) {
    const gateways = paymentGatewayCount;
    return `${s.modules + s.composedModules} modules · ${gateways} gateways`;
  }
  // candidai (private repo) and portfolio (the Compose Multiplatform twin,
  // not a "consumer app") carry composedModules/substitutedModules only —
  // no local `modules` count to publish. Guarding here (not after the gaddi
  // branch) matters: `s.modules` below is unguarded, and printed "undefined
  // modules" on the Candidai card the moment P1-10's generator added those
  // two keys to projectStats.ts.
  if (!("modules" in s)) return null;
  if (slug === "gaddi") return `${s.modules} modules · 4 platforms`;
  return `${s.modules} modules`;
}

/** Normalised for comparison: "46 modules" and "46 Modules" are one fact. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The distinct facts a project's curated status line already states. */
const statusFacts = (status: string) => new Set(status.split("·").map((x) => norm(x.trim())));

/**
 * A card prints THREE fact rows: the bracketed `status`, this generated stat
 * line, and the badge chips. Nothing stopped them saying the same thing, and
 * mostly they did — a Gaddi card read
 *
 *     [ 14 MODULES · 4 PLATFORMS · 10 BOT PERSONAS ]
 *     ◇ 14 modules · 4 platforms
 *     … Kotlin Multiplatform · Game engine · ISMCTS AI
 *
 * and PaymentsLab-KMP said "40 modules · 66 gateways" three times in 200px. That
 * is the same redundancy the hero banners had, one layer down.
 *
 * These two keep the row that ADDS something and drop the part that echoes.
 * Doori keeps "13 features · 368 screenshots" (genuinely new) and loses the
 * "46 modules" it had already said; Gaddi's stat line disappears entirely,
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
