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
 */
function hideHalfStreamedTail(content: string): string {
  const open = content.lastIndexOf("[[");
  // `includes("]]", open)` — it closed, so this isn't a tail.
  if (open !== -1 && !content.includes("]]", open) && HALF_STREAMED.test(content.slice(open))) {
    return content.slice(0, open);
  }
  // A lone trailing "[" is as likely to be the first half of "[[" (or of a
  // markdown link) as a real bracket — a provider that chunks between the two
  // brackets would otherwise flash a stray "[" for one token. Verified
  // in-browser: this was the only character that ever reached the screen.
  return content.endsWith("[") ? content.slice(0, -1) : content;
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
 */
export function plainText(content: string): string {
  return parseChatBlocks(content)
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
export function speakableText(content: string): string {
  return plainText(content)
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
 * Splits a (possibly still-streaming) assistant reply into renderable blocks.
 * Unknown widget names are returned as-is — validating them against the real
 * data is the renderer's job, so this stays a pure string function.
 */
export function parseChatBlocks(content: string): ChatBlock[] {
  const src = hideHalfStreamedTail(content);
  const blocks: ChatBlock[] = [];
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
    if (!close) return blocks;
    const data = parseJdFit(src.slice(start, end));
    if (data) blocks.push({ kind: "widget", name, data });
    cursor = end + close[0].length;
    re.lastIndex = cursor;
  }
  pushText(blocks, src.slice(cursor));
  return blocks;
}
