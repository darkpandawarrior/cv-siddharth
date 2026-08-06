import type { ReactNode } from "react";

/**
 * Bolds the measured parts of a résumé bullet — "80%", "50,000+ MAU",
 * "1.6★", "~964k-LOC", "24 verified" — so the numbers carry the scan the way
 * they do on a designed CV, without every bullet needing hand-authored markup in
 * profile.ts. Prose stays plain; only number-bearing runs are emphasised.
 */
const METRIC =
  /(~?\d[\d,]*(?:\.\d+)?\s*(?:%|★|×|k-LOC|k|K|M)?\+?(?:\s*(?:to|→|–|-)\s*~?\d[\d,]*(?:\.\d+)?\s*(?:%|★|k)?\+?)?)/g;

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
