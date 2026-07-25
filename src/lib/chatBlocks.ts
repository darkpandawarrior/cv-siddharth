/**
 * Generative UI, provider-agnostically.
 *
 * The assistant can't call tools (the chat function fans out to Groq / Gemini /
 * Anthropic and each has a different tool-calling shape), so the model instead
 * emits a directive inside the markdown it's already streaming —
 * `[[rooms]]`, `[[project:mileway]]`, `[[jdfit:{…}]]` — and this parser splits
 * the reply into text runs and widget slots. The renderer swaps each widget
 * slot for a real component (src/ChatWidgets.tsx). Same mechanism works on
 * every provider because it's just text.
 *
 * Pure and DOM-free on purpose: the streaming rule below is the whole reason
 * this is a separate, unit-tested module.
 */

/** The JD fit scorecard's payload (`[[jdfit:{…}]]`) — see parseJdFit. */
export interface JdFitReport {
  /** 0-100, clamped and rounded here so the renderer can trust it. */
  score: number;
  /** The role title as the job description stated it, if it stated one. */
  role?: string;
  summary: string;
  strengths: { need: string; evidence: string; project?: string }[];
  gaps: { need: string; note: string }[];
}

export type ChatBlock =
  | { kind: "text"; text: string }
  | { kind: "widget"; name: string; arg?: string; data?: JdFitReport };

// `[[name]]`, `[[name:slug]]`, or the payload form `[[name:{…json…}]]` — for
// that last one the regex only matches the OPENER, because a JSON payload can
// legally contain "]]" inside a string and half of it is on the wire at any
// moment during a stream. Its end is found by scanning (endOfJson below).
//
// Slugs keep a tight charset: a loose `.+?` would swallow half a sentence when
// the model writes prose containing brackets.
const DIRECTIVE = /\[\[([a-z][a-z0-9-]*)(?:(?::([a-z0-9][a-z0-9._/-]*))?\]\]|:(?=\{))/gi;

// A directive still being typed by the stream: "[[", "[[proj", "[[project:mile",
// or "[[project:mileway]" (one closing bracket arrived, the other hasn't).
const HALF_STREAMED = /\[\[[a-z0-9:._/-]*\]?$/i;

/**
 * Content arrives token by token, so the tail of `content` is routinely half a
 * directive. Rendering that tail would flash `[[project:mile` at the reader and
 * then yank it away — so the tail is hidden until its `]]` lands.
 *
 * Only a tail that still *looks* like a directive is hidden: prose that happens
 * to contain "[[ " (a space kills the match) keeps rendering, otherwise a stray
 * double bracket would silently eat the rest of an answer forever.
 *
 * `cut` says a DIRECTIVE tail was hidden — which is invisible progress mid-stream
 * and a lost widget once the stream ends, so the caller needs to tell them apart
 * (see the `done` flag on parseChatBlocks).
 */
function hideHalfStreamedTail(content: string): { src: string; cut: boolean } {
  const open = content.lastIndexOf("[[");
  // `includes("]]", open)` — it closed, so this isn't a tail.
  if (open !== -1 && !content.includes("]]", open) && HALF_STREAMED.test(content.slice(open))) {
    return { src: content.slice(0, open), cut: true };
  }
  // A lone trailing "[" is as likely to be the first half of "[[" (or of a
  // markdown link) as a real bracket — a provider that chunks between the two
  // brackets would otherwise flash a stray "[" for one token. Verified
  // in-browser: this was the only character that ever reached the screen.
  // Not `cut`: one dropped character isn't a lost widget, so a finished reply
  // that happens to end in "[" must not claim it was cut off.
  return content.endsWith("[") ? { src: content.slice(0, -1), cut: false } : { src: content, cut: false };
}

function pushText(blocks: ChatBlock[], text: string) {
  const trimmed = text.trim();
  if (trimmed) blocks.push({ kind: "text", text: trimmed });
}

/**
 * Index just past the `}` that closes the JSON object starting at `src[start]`,
 * or -1 if it never closes — which is the normal state for most of a stream.
 *
 * Brace counting rather than a regex because the payload carries free text: a
 * `]]` (or a `}`) inside a string must not end the directive early, and a
 * half-arrived object must read as "not yet", never as "malformed".
 */
function endOfJson(src: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === "\\") i++; // escaped char — including \" and \\
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

// Bounds on what a payload can put on screen. The strings are model output
// about text a stranger pasted, so they are attacker-influenced: truncating
// keeps a novel-length "evidence" line from becoming a layout bomb, and the
// row caps keep the card a card.
//
// Deliberately LOOSER than what api/_lib/jd-prompt.ts asks the model for (3-4
// strengths, 2-3 gaps, ≤140-char strings): the prompt shapes a good card, these
// refuse a hostile one. Keep it that way round — a parser cap below the prompt's
// would silently truncate output the prompt considers correct.
const MAX_FIELD_CHARS = 240;
const MAX_ROWS = 6;

function field(value: unknown, max = MAX_FIELD_CHARS): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function rows<T>(value: unknown, read: (row: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ROWS).flatMap((row) => {
    const parsed = row && typeof row === "object" ? read(row as Record<string, unknown>) : null;
    return parsed ? [parsed] : [];
  });
}

/**
 * The JSON inside `[[jdfit:{…}]]` → a report the renderer can trust, or null.
 *
 * Null covers every failure the same way — unparseable JSON, wrong type, a
 * missing score, an empty summary — and the caller drops the whole block, so a
 * bad payload renders NOTHING rather than leaking raw JSON at the reader.
 * Individual bad rows are dropped instead of failing the card: a scorecard
 * missing one gap line still beats no scorecard.
 */
export function parseJdFit(raw: string): JdFitReport | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;

  const summary = field(o.summary, 400);
  if (typeof o.score !== "number" || !Number.isFinite(o.score) || !summary) return null;

  return {
    score: Math.max(0, Math.min(100, Math.round(o.score))),
    role: field(o.role, 120) ?? undefined,
    summary,
    strengths: rows(o.strengths, (r) => {
      const need = field(r.need);
      const evidence = field(r.evidence);
      // Lower-cased for the same reason the directive's arg is: the renderer
      // looks it up against real slugs, and an invented one must simply miss.
      return need && evidence ? { need, evidence, project: field(r.project, 60)?.toLowerCase() } : null;
    }),
    gaps: rows(o.gaps, (r) => {
      const need = field(r.need);
      const note = field(r.note);
      return need && note ? { need, note } : null;
    }),
  };
}

/**
 * A reply as words, not machinery — directives would paste (or be READ ALOUD)
 * as garbage. Used by the copy button and, via speakableText, by the reader.
 *
 * `done` behaves as it does in parseChatBlocks; both callers only ever act on a
 * settled reply, so both pass true and what you copy (or hear) is what's on
 * screen, cut-off note included.
 */
export function plainText(content: string, done = false): string {
  return parseChatBlocks(content, done)
    .flatMap((b) => {
      if (b.kind === "text") return [b.text];
      // The scorecard is the exception: it IS the answer, so copying only the
      // sentence around it hands a recruiter an empty quote. Every other
      // widget is navigation, which doesn't survive a paste anyway.
      return b.name === "jdfit" && b.data ? [jdFitText(b.data)] : [];
    })
    .join("\n\n");
}

export function jdFitText(r: JdFitReport): string {
  const lines = [`Fit: ${r.score}/100${r.role ? ` — ${r.role}` : ""}`, r.summary];
  if (r.strengths.length) lines.push("", "Matches:", ...r.strengths.map((s) => `- ${s.need}: ${s.evidence}`));
  if (r.gaps.length) lines.push("", "Gaps:", ...r.gaps.map((g) => `- ${g.need}: ${g.note}`));
  return lines.join("\n");
}

/**
 * A reply as something a speech synthesiser should say out loud.
 *
 * plainText already removes the widget directives — speaking "bracket bracket
 * project colon mileway" is the bug this starts from. Markdown is the second
 * half: every provider writes **bold**, `code`, [links](/lab) and "- " bullets,
 * and a synthesiser reads the punctuation. A fenced code block is dropped
 * outright rather than flattened; nobody wants a Kotlin snippet read to them.
 *
 * Order matters: fences before inline code, bold before italic (`**x**` would
 * otherwise be eaten as two italics), links before emphasis (a link label can
 * contain either).
 */
export function speakableText(content: string, done = false): string {
  return plainText(content, done)
    .replace(/```[\s\S]*?(?:```|$)/g, " ") // fenced code, including one still streaming
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // image → its alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // link → its label, never the href
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ") // horizontal rule
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(?<![\w*])[*_](?=\S)([^*_]+?)(?<=\S)[*_](?![\w*])/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What a finished reply says when a directive was swallowed. Hiding a
 * half-arrived directive is right while tokens are still coming; once the stream
 * has stopped, the same fail-safe is a permanently blank bubble — which is
 * exactly the bug a recruiter hit with a 5,398-character job description (the
 * scorecard ran past the provider's token ceiling and stopped mid-JSON).
 *
 * So: keep whatever prose the model did produce, and say the honest thing.
 * Never the raw JSON — that's machinery, and the visitor pasted a job
 * description, not a debugger.
 */
export const CUT_OFF_NOTE =
  "That's where I got cut off — the rest of that read didn't make it. Send it through again and I'll finish the job.";

/** The catch-all: a finished reply that renders to literally nothing. */
export const EMPTY_REPLY_NOTE = "Nothing came back that time — ask me again and I'll have another go.";

/**
 * The last word on a finished reply, and the whole point of the `done` flag: no
 * assistant turn ever renders as an empty bubble.
 */
function finish(blocks: ChatBlock[], done: boolean, dropped: boolean): ChatBlock[] {
  if (!done) return blocks;
  if (dropped) pushText(blocks, CUT_OFF_NOTE);
  else if (!blocks.length) pushText(blocks, EMPTY_REPLY_NOTE);
  return blocks;
}

/**
 * Splits a (possibly still-streaming) assistant reply into renderable blocks.
 * Unknown widget names are returned as-is — validating them against the real
 * data is the renderer's job, so this stays a pure string function.
 *
 * `done` is "the stream has stopped", and it changes exactly one thing: whether
 * a directive that never completed reads as "still on its way" (drop it
 * silently, the default, so raw `[[`/JSON never flashes) or as "it's not coming"
 * (say so — see CUT_OFF_NOTE). Callers that render a live stream must leave it
 * false; callers rendering a settled message pass true.
 */
export function parseChatBlocks(content: string, done = false): ChatBlock[] {
  const { src, cut } = hideHalfStreamedTail(content);
  const blocks: ChatBlock[] = [];
  // A directive went missing: a half-arrived tail, an opener that never closed,
  // or a payload that closed but failed validation.
  let dropped = cut;
  const re = new RegExp(DIRECTIVE); // fresh instance: /g regexes carry lastIndex
  let cursor = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const name = m[1].toLowerCase();
    // `m[0]` ends in "]]" for the plain forms, and in ":" for the payload one.
    if (m[0].endsWith("]]")) {
      pushText(blocks, src.slice(cursor, m.index));
      blocks.push({ kind: "widget", name, arg: m[2]?.toLowerCase() });
      cursor = m.index + m[0].length;
      continue;
    }
    const start = m.index + m[0].length;
    const end = endOfJson(src, start);
    const close = end < 0 ? null : /^\s*\]\]/.exec(src.slice(end));
    pushText(blocks, src.slice(cursor, m.index));
    // No closer yet: the payload is still streaming (or the model never closed
    // it). Everything from the opener on is dropped — showing the tail would
    // flash raw JSON, and there is nothing renderable after a directive that
    // never ends.
    if (!close) return finish(blocks, done, true);
    const data = parseJdFit(src.slice(start, end));
    if (data) blocks.push({ kind: "widget", name, data });
    else dropped = true; // it closed, but the JSON didn't survive validation
    cursor = end + close[0].length;
    re.lastIndex = cursor;
  }
  pushText(blocks, src.slice(cursor));
  return finish(blocks, done, dropped);
}
