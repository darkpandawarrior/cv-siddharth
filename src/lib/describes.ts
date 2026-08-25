/**
 * The description a page or a feed is ALLOWED to publish for an anthology entry.
 *
 * Entry #2300 stops mid-sentence because the Directory never got to finish it.
 * That unfinished sentence is the corpus's load-bearing wall, and the threat to
 * it was never fans: it is og:description generators, excerpt trimmers and feed
 * builders, every one of which either trims to a sentence boundary or appends
 * an ellipsis. Either one finishes, in a share card, the sentence the whole
 * entry exists to leave unfinished.
 *
 * So the rule is not "do not truncate", which is a promise a comment cannot
 * keep. On a story with no ending the blurb is FINGERPRINTED against the prose:
 * if it opens where the story opens, or carries the story's last words, it came
 * from the body and is refused, and the caller publishes no description at all.
 * An absent tag is a smaller lie than a completed sentence.
 *
 * A blank blurb is refused for the same reason. `gen-anthology.mjs` emits
 * `e.blurb || ""`, and an empty description is exactly the pressure that makes
 * the next person reach for the body.
 *
 * Everything with an ending is handed back untouched. That is deliberate rather
 * than lazy: nine printed blurbs legitimately ARE their own opening lines, and a
 * piece that finished its last sentence has no ending for a description to
 * finish for it.
 *
 * THIS FILE EXISTS BECAUSE THE RULE NOW HAS TWO CALLERS. It was written inside
 * read.$slug.tsx, where it guarded meta tags only, and the anthology feed needs
 * the identical rule. A guard with two copies is a guard with one copy and one
 * liability: this repo has already shipped a test that stayed green against a
 * reintroduced defect because it was asserting its own copy of the thing it
 * guarded. One implementation, imported by both, is the only version that can
 * fail honestly.
 */

/** Every generated entry closes with exactly one "\n\n---\n\n" before its
 *  Terminologies block, so splitting on it separates the story from the tape. */
const TERMINOLOGIES_DIVIDER = "\n\n---\n\n";

/** The story as it was filed, without the tape. */
export function storyOf(body: string): string {
  const at = body.indexOf(TERMINOLOGIES_DIVIDER);
  return at >= 0 ? body.slice(0, at) : body;
}

/**
 * True when the story has no last sentence.
 *
 * Generic rather than a slug list: entry #2300 is filed incomplete on purpose,
 * s3-09 stops on a stray tag, and the corpus is allowed a third.
 */
export function endsMidSentence(body: string): boolean {
  return !/[.!?"'”’)\]]$/.test(storyOf(body).trim());
}

/** Letters and digits only, lowercased.
 *
 *  A comparison against raw prose is not a guard: the first version of this
 *  tested `body.includes(blurb)` and a simulated `body.slice(0, 150) + "…"`
 *  walked straight through it, because the ellipsis the excerpt added was
 *  enough to stop it being a substring. That ellipsis IS the thing being
 *  guarded against, so the fingerprint has to be blind to punctuation,
 *  wrapping and quote marks or it only catches an excerpt nobody would write. */
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** About seven words of prose once squashed. Long enough that no two authored
 *  sentences in this corpus collide, short enough that nothing lifted off this
 *  story gets past. */
const FINGERPRINT = 40;

/** The blurb this entry may publish, or null for none at all. */
export function describes(entry: { blurb: string; body: string }): string | null {
  const blurb = entry.blurb.trim();
  if (!blurb) return null;
  if (!endsMidSentence(entry.body)) return blurb;
  const story = squash(storyOf(entry.body));
  const said = squash(blurb);
  const fromTheOpening = story.startsWith(said.slice(0, FINGERPRINT));
  const carriesTheEnding = said.includes(story.slice(-FINGERPRINT));
  return fromTheOpening || carriesTheEnding ? null : blurb;
}
