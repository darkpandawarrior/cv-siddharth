import type { ProjectDetailData } from "../data/profile.ts";

/** CaseSpine's headline number: the `metrics[]` entry at `outcomeMetricIndex`,
 *  or undefined if the project has no metric wired to its result beat.
 *  Pulled out of the component so the lookup (an off-by-one away from
 *  silently rendering nothing) has a unit test that doesn't need a DOM. */
export function pickOutcomeMetric(
  d: Pick<ProjectDetailData, "outcomeMetricIndex" | "metrics">,
): { value: string; label: string } | undefined {
  return d.outcomeMetricIndex !== undefined ? d.metrics?.[d.outcomeMetricIndex] : undefined;
}

/** Marquee screens minus the one CaseSpine already shows as evidence, so the
 *  same frame never appears twice on the same page seconds apart. */
export function excludeOutcomeScreenshot(srcs: string[], outcomeShot: string | undefined): string[] {
  return srcs.filter((src) => src !== outcomeShot);
}
