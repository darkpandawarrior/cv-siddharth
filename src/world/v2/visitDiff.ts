/**
 * "Since your last visit" (living-ledger-spec §7.3). Pure: takes the
 * already-computed features, the current I-class counts and whatever S17
 * (localStorage `world:lastSeen`) supplied, plus `now` — never reads a
 * clock or storage itself. A first visit (`lastSeen === null`) gets the
 * same shape, windowed to the last 30 days.
 */
import type { Feature } from "./worldModel.ts";

export interface LastSeen {
  at: string; // ISO date
  counts: Record<string, number>; // I-class rule id -> countOf() at that visit
}

export interface GrownRow {
  ruleId: string;
  from: number;
  to: number;
}

export interface VisitDiffResult {
  sinceDays: number;
  grown: GrownRow[];
  newFeatureIds: string[];
  sentence: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function buildSentence(sinceDays: number, grown: GrownRow[], newCount: number): string {
  if (grown.length === 0 && newCount === 0) {
    return sinceDays <= 0 ? "Welcome back." : `Since you were last here (${sinceDays} days): nothing new yet.`;
  }
  const parts = grown.map((g) => `+${g.to - g.from} ${g.ruleId}`);
  return `Since you were last here (${sinceDays} days): ${parts.join(", ")}.`;
}

export function visitDiff(
  features: readonly Feature[],
  counts: Readonly<Record<string, number>>,
  lastSeen: LastSeen | null,
  now: Date,
): VisitDiffResult {
  const sinceDate = lastSeen ? new Date(lastSeen.at) : new Date(now.getTime() - THIRTY_DAYS_MS);
  const sinceDays = Math.max(0, Math.round((now.getTime() - sinceDate.getTime()) / (24 * 60 * 60 * 1000)));

  const newFeatureIds = features
    .filter((f) => f.date !== null && new Date(f.date).getTime() > sinceDate.getTime())
    .map((f) => f.id);

  let grown: GrownRow[];
  if (lastSeen) {
    grown = Object.entries(counts)
      .map(([ruleId, to]) => ({ ruleId, from: lastSeen.counts[ruleId] ?? 0, to }))
      .filter((g) => g.to > g.from);
  } else {
    // No baseline snapshot exists yet: narrate the last 30 days purely from
    // each new feature's own date, tallied by the rule it belongs to
    // (Feature.rule) — never from the all-time `counts`, which would read
    // as "everything happened in the last month" on a first visit.
    const tally = new Map<string, number>();
    for (const f of features) {
      if (f.date !== null && new Date(f.date).getTime() > sinceDate.getTime()) {
        tally.set(f.rule, (tally.get(f.rule) ?? 0) + 1);
      }
    }
    grown = [...tally.entries()].map(([ruleId, n]) => ({ ruleId, from: 0, to: n }));
  }

  return { sinceDays, grown, newFeatureIds, sentence: buildSentence(sinceDays, grown, newFeatureIds.length) };
}
