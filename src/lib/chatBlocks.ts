/**
 * Generative UI, provider-agnostically.
 *
 * The assistant can't call tools (the chat function fans out to Groq / Gemini /
 * Anthropic and each has a different tool-calling shape), so the model instead
 * emits a directive inside the markdown it's already streaming —
 * `[[rooms]]`, `[[project:mileway]]` — and this parser splits the reply into
 * text runs and widget slots. The renderer swaps each widget slot for a real
 * component (src/ChatWidgets.tsx). Same mechanism works on every provider
 * because it's just text.
 *
 * Pure and DOM-free on purpose: the streaming rule below is the whole reason
 * this is a separate, unit-tested module.
 */

export type ChatBlock = { kind: "text"; text: string } | { kind: "widget"; name: string; arg?: string };

// `[[name]]` or `[[name:arg]]`. Slugs are the only argument shape we need, so
// the charset stays tight — a loose `.+?` would swallow half a sentence when
// the model writes prose containing brackets.
const DIRECTIVE = /\[\[([a-z][a-z0-9-]*)(?::([a-z0-9][a-z0-9._/-]*))?\]\]/gi;

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
    pushText(blocks, src.slice(cursor, m.index));
    blocks.push({ kind: "widget", name: m[1].toLowerCase(), arg: m[2]?.toLowerCase() });
    cursor = m.index + m[0].length;
  }
  pushText(blocks, src.slice(cursor));
  return blocks;
}
