// Split out of skills.ts (itself arch-L15 out of profile.ts): `provenIn`
// needs the full `projects` array (stack + detail.techStack) and skills.ts's
// own `skills`/`resumeSkills` arrays don't. Keeping them in one file meant
// anyone reading the plain skills list — ChatWidgets.tsx's [[skills]] widget,
// reached from every route through ChatLauncher.tsx's eager root mount — also
// evaluated this file's `projects` import, pulling profile-projects-heavy
// into the same chunk graph (e2e/spine-payload.spec.ts: /terminal cold-loaded
// it even with ChatMessageBody's own render already behind a `<Hydrate
// split>` boundary, since __vitePreload warms a lazy chunk's own
// dependencies as soon as its PARENT starts loading, not just when it
// actually renders).
import { projects } from "./projects.ts";

const STOPWORDS = new Set(["and", "the", "a", "for", "with", "in", "on", "of", "to", "via"]);

/** Lowercased, punctuation-stripped whole words, 3+ letters — short enough to
 *  skip real terms ("AI", "R8") but that keeps this a coarse skill-to-tech
 *  matcher rather than a semantic one; see provenIn's own comment. */
function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[()+/·,._-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Every project's own vocabulary: `stack` plus every `detail.techStack`
 *  group's items — built once, not per lookup. */
const PROJECT_WORDS: { slug: string; words: Set<string> }[] = projects.map((p) => {
  const bag = new Set(p.stack.flatMap((s) => [...words(s)]));
  for (const group of p.detail?.techStack ?? []) {
    for (const item of group.items) for (const w of words(item)) bag.add(w);
  }
  return { slug: p.slug, words: bag };
});

/**
 * Which projects' own stack/techStack actually names this skill — no hand
 * list to drift out of sync with the registry, at the cost of being a coarse
 * word-overlap match rather than a semantic one (a skill and a project share
 * a real, non-stopword word). Good enough for "1-3 project links under a
 * filtered skill", not for anything asserting a project does NOT use a skill.
 * ponytail: O(skills × projects × words), fine at this corpus size — index by
 * word if the registry ever grows past a few dozen projects.
 */
export function provenIn(skill: string): string[] {
  const needle = words(skill);
  if (needle.size === 0) return [];
  return PROJECT_WORDS.filter((p) => [...needle].some((w) => p.words.has(w))).map((p) => p.slug);
}
