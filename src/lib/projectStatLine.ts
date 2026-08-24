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
  if (slug === "mileway" && "features" in s) return `${s.modules} modules · ${s.features} features · ${s.screenshots} screenshots`;
  if (slug === "paymentslab" && "gatewaysNative" in s) {
    const gateways = s.gatewaysNative + s.gatewaysHosted + s.gatewaysMobileMoney + s.gatewaysStub;
    return `${s.modules + s.composedModules} modules · ${gateways} gateways`;
  }
  if (slug === "kursi") return `${s.modules} modules · 4 platforms`;
  return `${s.modules} modules`;
}
