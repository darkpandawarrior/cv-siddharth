import type { ReactNode } from "react";

/**
 * Bolds the measured parts of a résumé bullet — "80%", "50,000+ MAU",
 * "1.6★", "~964k-LOC", "24 verified" — so the numbers carry the scan the way
 * they do on a designed CV, without every bullet needing hand-authored markup in
 * profile.ts. Prose stays plain; only number-bearing runs are emphasised.
 */
/**
 * Two negative lookbehinds guard the digit run, both added 2026-09-18 after
 * reading the rendered PDF rather than the source:
 *
 *  (?<![A-Za-z]-)   a digit that follows "letter-" belongs to an identifier, not
 *                   a metric. Without this, "AES-256" printed as AES-**256** and
 *                   "5 SHA-256 pins" as 5 SHA-**256** pins. Bolding half of a
 *                   cipher name reads as a typo and draws the eye to the wrong
 *                   token on a page whose whole emphasis budget is the numbers.
 *
 *  (?<!<platform> ) a version number after a platform or tool name is not an
 *                   achievement. "Android 12+", "AGP 9", "Material 3", "React 19"
 *                   are context, and bolding them competes with "80%" and
 *                   "50,000+ MAU", which are the numbers that should win the scan.
 */
const METRIC =
  /(?<!\d)(?<![A-Za-z]-)(?<!\b(?:Android|API|AGP|Material|Gradle|React|Kotlin|Java|Compose|SDK|Boot|JUnit|TLS|SHA|AES)\s)(~?\d[\d,]*(?:\.\d+)?\s*(?:%|★|×|k-LOC|k|K|M)?\+?(?:\s*(?:to|→|–|-)\s*~?\d[\d,]*(?:\.\d+)?\s*(?:%|★|k)?\+?)?)/g;

export function emphasise(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(METRIC)) {
    const i = m.index ?? 0;
    // A bare "1" or "2" is a count in prose, not a headline metric; requiring
    // either a unit or three+ characters keeps "across 2 databases" unbolded
    // while still catching "24 migrations" and "9 domains".
    // Bold the token, but re-emit the whitespace the match swallowed — trimming
    // it into the <strong> silently glued "67 reviews" into "67reviews".
    const [, pre = "", tok = "", post = ""] = m[0].match(/^(\s*)(.*?)(\s*)$/s) ?? [];
    if (!tok) continue;
    if (!/[%★×k+KM]/.test(tok) && tok.length < 2) continue;
    if (i > last) out.push(text.slice(last, i));
    if (pre) out.push(pre);
    out.push(
      <strong key={`${i}-${tok}`} className="font-semibold text-zinc-900">
        {tok}
      </strong>,
    );
    if (post) out.push(post);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}
