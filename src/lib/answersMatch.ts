import type { Answer } from "../data/source/answers.ts";

/**
 * Offline matching for the answer layer — the same "the model is the good
 * path, the offline floor is what fires when it's unreachable" shape as
 * src/lib/useJdFit.ts's runJdFit, applied to ordinary chat instead of the JD
 * scorecard. src/FloatingChat.tsx calls this ONLY once /api/chat has already
 * failed (a 503, a dead provider, a network error) — the model still answers
 * first when it can; this is the floor under it, not a replacement for it.
 *
 * Word-overlap, not embeddings or a new dependency: content words (4+ chars)
 * shared between the visitor's question and an answer's `question` + its
 * `keywords`, scored as a fraction of the QUERY's own words — the same shape
 * gen-system-prompt.mjs's `covered()` already uses for prompt-trimming, so
 * this repo has one matching idiom, not two. ponytail: no stemming, no
 * synonym table beyond each answer's own `keywords` — a query has to share
 * real words with a real answer. Good enough for a floor; the model handles
 * everything paraphrased past that.
 */
const words = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

const THRESHOLD = 0.3;

/** Best-scoring answer for `query`, or undefined if nothing clears THRESHOLD. */
export function matchAnswer(query: string, corpus: readonly Answer[]): Answer | undefined {
  const q = words(query);
  if (q.size === 0) return undefined;
  let best: { answer: Answer; score: number } | undefined;
  for (const a of corpus) {
    const target = words(`${a.question} ${(a.keywords ?? []).join(" ")}`);
    const hits = [...q].filter((w) => target.has(w)).length;
    const score = hits / q.size;
    if (score >= THRESHOLD && (!best || score > best.score)) best = { answer: a, score };
  }
  return best?.answer;
}

/** What the widget shows when the model is unreachable but the offline
 *  corpus has a real answer — the citation link is what makes it more than
 *  a canned reply. */
export function offlineAnswerText(a: Answer): string {
  return `${a.answer}\n\nSee [the source](${a.anchor}).`;
}
