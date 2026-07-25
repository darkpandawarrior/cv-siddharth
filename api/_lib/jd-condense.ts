/**
 * Trims a pasted job description down to the parts that decide a fit.
 *
 * A real JD is mostly not requirements. The one that surfaced the empty-bubble
 * bug spent its length on company history, benefits, perks and an EEO
 * statement; the section that actually determines whether Siddharth fits was a
 * fraction of it. Every one of those boilerplate tokens is read by the model,
 * and — on a reasoning model — thought about before it answers.
 *
 * This is a FOCUSING pass, not the fix for that bug: the cause there was
 * `reasoning_effort` defaulting to medium (see chat-handler's
 * reasoningEffortFor), and a 4.6k-character JD is only ~1.2k input tokens,
 * which was never the constraint. What this buys is a model that spends its
 * (now deliberately small) thinking budget on responsibilities and
 * qualifications instead of on a benefits list.
 *
 * Deliberately dumb — headings and line shapes, no model call, no dependency.
 * It runs on the server for mode "jd" so it can't be bypassed from the client.
 */

/**
 * Headings whose section is boilerplate for fit purposes. `about` is the
 * delicate one: "About the role" is the most useful section in many JDs, while
 * "About us" is the least, so the alternatives below match the company forms
 * specifically and leave the role forms to be kept.
 */
const NOISE_HEADING =
  /^[\s#*_>\-•\d.)]*(benefits?|perks?|what we offer|what's in it for you|why join|why work|our (?:story|mission|values|culture|team)|about (?:us|the company|our|who we are)|who we are|equal (?:opportunity|employment)|eeo\b|diversity|inclusion|accommodations?|how to apply|application process|interview process|hiring process|next steps|life at|working at|compensation (?:and|&) benefits|salary range|our office|location and)/i;

/**
 * Headings whose section decides the fit. Everything not matched by either list
 * is kept — the default is to keep, and only a positive boilerplate match drops
 * anything. A JD written with no headings at all therefore passes through whole.
 */
const KEEP_HEADING =
  /^[\s#*_>\-•\d.)]*(responsibilit|requirement|qualification|what you.{0,3}ll (?:do|bring|need|own)|what we.{0,3}re looking for|who you are|skills?|experience|must.?have|nice.?to.?have|preferred|bonus|desirable|the role|about the role|role overview|your impact|day.to.day|tech(?:nical)? stack|our stack|you (?:will|should|have|bring))/i;

/**
 * Could this line be a section label?
 *
 * Deliberately permissive: short, non-empty, and not a bullet. It does NOT try
 * to require markdown, ALL-CAPS or a trailing colon — most real JDs are pasted
 * as plain text and write `Benefits` on a line of its own with none of those
 * markers, and an isHeading that insisted on them recognised no sections at all.
 *
 * Being loose here is safe because the two section regexes are anchored to the
 * start of the line and do the real discriminating: an ordinary sentence like
 * "We offer great benefits" is a heading *candidate* and matches neither list,
 * so it is kept. Bullets are the one hard exclusion — "- Benefits administration
 * experience" is a requirement, and treating it as a heading would drop the rest
 * of the requirements with it.
 */
function isHeadingCandidate(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 80 && !/^[-*•]/.test(t);
}

/** Below this a JD is already short enough that focusing it buys nothing. */
const CONDENSE_ABOVE_CHARS = 2500;

/**
 * Never hand back a husk — an absolute floor, deliberately not a fraction.
 *
 * A fraction gets this backwards. The JD this feature exists for is the one
 * that really is three-quarters company narrative and perks, so "kept less than
 * 25% of the document" describes a *success*, not a misfire, and a proportional
 * guard would refuse to condense precisely the documents worth condensing.
 *
 * What actually needs catching is a NOISE heading matching something it
 * shouldn't and swallowing the requirements with it. That failure looks like
 * almost nothing surviving, at any input size. So: if less than this much text
 * is left, assume the headings were misread and send the original — the model
 * then sees exactly what the visitor pasted, which is never worse than a husk.
 */
const MIN_KEPT_CHARS = 400;

export function condenseJd(text: string): string {
  if (text.length <= CONDENSE_ABOVE_CHARS) return text;

  const kept: string[] = [];
  let dropping = false;
  let droppedAny = false;

  for (const line of text.split("\n")) {
    if (isHeadingCandidate(line)) {
      // Only a line that actually matches a list is a section boundary. A
      // candidate matching NEITHER is ordinary prose that merely happens to be
      // short — it must leave `dropping` exactly as it was. (Assigning the
      // combined predicate here instead silently ended every dropped section at
      // its first short sentence, so a benefits list resumed being kept two
      // lines in.) KEEP is checked first so it wins ties: "About the role"
      // matches both lists and is content.
      if (KEEP_HEADING.test(line)) {
        dropping = false;
      } else if (NOISE_HEADING.test(line)) {
        dropping = true;
        droppedAny = true;
        continue; // the boilerplate heading itself goes too
      }
    }
    if (!dropping) kept.push(line);
  }

  // Recognising no boilerplate is a no-op, not a reformat. Returning the input
  // byte-for-byte keeps this honest: a JD we had nothing to say about reaches
  // the model exactly as the visitor pasted it, whitespace included.
  if (!droppedAny) return text;

  const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out.length >= MIN_KEPT_CHARS ? out : text;
}
