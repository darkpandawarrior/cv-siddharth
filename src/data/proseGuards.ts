// The vocabulary and the walk two test files guard fiction surfaces with.
//
// This used to be a private BANNED array inside canonLore.test.ts, seeing
// only canonLore.ts's exports. anthology.ts carries 34 story bodies and
// blurbs that are exactly as reader-visible and were checked by nothing.
// The fix is not a second array in anthology.test.ts: a second copy is how
// the two drift and the weaker one becomes the one people edit. One array,
// one walk, imported by both.

/** Every string reachable from a value, path included for failure messages. */
export function walk(
  value: unknown,
  path: string,
  out: { path: string; text: string }[] = [],
): { path: string; text: string }[] {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
  }
  return out;
}

// /canon carried a Sources list linking .md filenames straight at the working
// bibles, and an "outside the fiction" note naming the prompting, the model
// and a cross-lab ownership audit. It shipped, and it read as production
// apparatus printed inside the lore. This is the reader-visible vocabulary
// that note was written in, so it is what gets matched rather than the
// symbol names that carried it: deleting an export and re-adding the same
// sentence under a new name is the exact way this comes back.
// No bare `/\bcouncil\b/i` here: widening this walk to anthology.ts's 34
// story bodies (running it over that corpus for the first time is the whole
// point of guard B) turned up two entries using "council" as an ordinary
// noun for a governing body — "Councils of elders convened..." and "There is
// no council that suppressed anything...". Both are in-world prose, neither
// is a leak, and a guard that is permanently red for a bogus reason is the
// same defect as one that is green for reading nothing. `cross[- ]lab` and
// `ownership audit` below already catch the actual incident phrasing
// ("a cross-lab ownership audit"); a bare "council" was never part of it.
export const BANNED: RegExp[] = [
  /\bprompt(?:ing|ed)?\b/i,
  /\bthe model\b/i,
  /\bcross[- ]lab\b/i,
  /\bownership audit\b/i,
  /\bLLM\b/i,
  /\btoken\b/i,
  /\bopenrouter\b/i,
  /\.md\b/,
];

// Pipeline residue: a tag or fence marker a generator can leave behind that
// nobody said. anthology.ts shipped `\n</content>` at the end of s3-09's body
// for weeks, because the source .md was fixed and the generated artifact was
// never regenerated — the exact reason this has to run on the OUTPUT, not
// the source prose.
export const RESIDUE = /<\/?(content|document|response|thinking|antml[^>]*)>|^```\s*$|^---\s*$/m;
