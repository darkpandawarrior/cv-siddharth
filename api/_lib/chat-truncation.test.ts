// Regression coverage for the production truncation bug: /api/chat
// intermittently ended answers mid-sentence ("…It features a 44-module
// registry" then [DONE]). Root cause: the SAME reasoning-token spend as the
// already-fixed empty-bubble bug (see reasoningEffortFor's comment in
// chat-handler.ts) — gpt-oss-120b spends most of the 1,024-token ceiling in
// `delta.reasoning`, and this time enough was left over for a *partial*
// answer instead of none, so the provider's own `finish_reason: "length"`
// cuts it off mid-sentence rather than emitting nothing.
//
// Separate file from chat-handler.test.ts (per this lane's `owns`) so the
// break-it fixture and its explanation live next to each other rather than
// buried in an 1,800-line file.
import { describe, it, expect } from "vitest";
import { PROVIDERS, normalizeStream, EMPTY_STREAM_FALLBACK } from "./chat-handler";

const sse = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l));
      c.close();
    },
  });

async function collect(rs: ReadableStream<Uint8Array>): Promise<string> {
  const reader = rs.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

/** Pulls every `{"text": "…"}` payload back out of a normalized SSE body, in
 *  order, joined — what the chat widget would actually render. */
function renderedText(body: string): string {
  let out = "";
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
    out += (JSON.parse(line.slice(6)) as { text: string }).text;
  }
  return out;
}

const groq = PROVIDERS.find((p) => p.name === "groq")!;
const gemini = PROVIDERS.find((p) => p.name === "gemini")!;
const anthropic = PROVIDERS.find((p) => p.name === "anthropic")!;

/* ── THE PRODUCTION FIXTURE ─────────────────────────────────────────────────
 * Recorded shape of what Groq actually sends for a reasoning model when the
 * 1,024-token ceiling lands mid-sentence: content deltas, then a terminal
 * chunk carrying `finish_reason: "length"` and no new text. */
const LENGTH_STOPPED_GROQ = [
  'data: {"choices":[{"delta":{"content":"PaymentsLab-KMP is a Kotlin Multiplatform payments showcase. "}}]}\n',
  'data: {"choices":[{"delta":{"content":"It features a 46-module registry with real gateway"}}]}\n',
  'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
  "data: [DONE]\n",
];

describe("chat truncation — a length-stopped stream never reaches the visitor as a fragment", () => {
  it("BREAK-IT: this exact fixture DOES produce the dangling fragment without finish-reason detection", async () => {
    // Simulates calling normalizeStream the way it always was — no third
    // argument, so no provider's finish_reason is ever read and every delta
    // is flushed regardless of how the stream ended. This is what proves the
    // fixture below is a real regression test and not a tautology: the same
    // input, run without the fix, reproduces the production bug exactly.
    const out = await collect(normalizeStream(sse(LENGTH_STOPPED_GROQ), groq.extractDelta));
    const text = renderedText(out);
    expect(text.endsWith("gateway")).toBe(true); // the exact production bug
    expect(/[.!?]$/.test(text)).toBe(false);
  });

  it("FIXED: with finish-reason detection wired in, the same fixture ends at a full sentence", async () => {
    const out = await collect(normalizeStream(sse(LENGTH_STOPPED_GROQ), groq.extractDelta, groq.extractFinishReason));
    const text = renderedText(out);
    expect(text).toBe("PaymentsLab-KMP is a Kotlin Multiplatform payments showcase.");
    expect(/[.!?]$/.test(text)).toBe(true);
    expect(text).not.toContain("with real gateway"); // the fragment is dropped, never shown
  });

  it("a normal (non-length) stop still flushes everything, punctuation or not", async () => {
    // Guards against over-correcting: a reply that legitimately ends without
    // trailing punctuation (a short "yes", a list item) must still reach the
    // visitor in full when the provider stopped on its own, not be treated
    // as a fragment just because it lacks a period.
    const frames = [
      'data: {"choices":[{"delta":{"content":"Yes, he built that"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
      "data: [DONE]\n",
    ];
    const out = await collect(normalizeStream(sse(frames), groq.extractDelta, groq.extractFinishReason));
    expect(renderedText(out)).toBe("Yes, he built that");
  });

  it("gemini's MAX_TOKENS stop trims to the last full sentence too", async () => {
    const frames = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Doori is offline-first. It spans five platforms with a"}]}}]}\n',
      'data: {"candidates":[{"finishReason":"MAX_TOKENS"}]}\n',
      "data: [DONE]\n",
    ];
    const out = await collect(normalizeStream(sse(frames), gemini.extractDelta, gemini.extractFinishReason));
    expect(renderedText(out)).toBe("Doori is offline-first.");
  });

  it("anthropic's max_tokens stop_reason trims to the last full sentence too", async () => {
    const frames = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Gaddi is a bluffing game. It ships"}}\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n',
      "data: [DONE]\n",
    ];
    const out = await collect(normalizeStream(sse(frames), anthropic.extractDelta, anthropic.extractFinishReason));
    expect(renderedText(out)).toBe("Gaddi is a bluffing game.");
  });

  it("if a length-stopped reply never reaches a sentence boundary, the visitor sees the honest fallback, not silence", async () => {
    // The harsher case: nothing in the whole reply was ever safe to flush.
    // Emitting nothing at all would reproduce the exact empty-bubble bug this
    // endpoint already fixed once (EMPTY_STREAM_FALLBACK's own regression
    // test in chat-handler.test.ts) — so this falls back to the same honest
    // message instead of silence.
    const frames = [
      'data: {"choices":[{"delta":{"content":"It features a 46-module registry with real"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      "data: [DONE]\n",
    ];
    const out = await collect(normalizeStream(sse(frames), groq.extractDelta, groq.extractFinishReason));
    expect(out).toContain(EMPTY_STREAM_FALLBACK);
  });
});

/* ── Multi-part SSE chunk keeps all parts (normalizeStream-level companion) ─
 * Gemini may split one chunk's answer across several `parts`; reading only
 * parts[0] used to silently drop the rest — covered at the extractDelta level
 * in chat-handler.test.ts already. Repeated here at the normalizeStream level
 * because the sentence-boundary buffering this fix adds is exactly the kind
 * of change that could plausibly reintroduce that bug by mishandling a
 * multi-part delta while assembling `full`. */
describe("multi-part SSE chunk keeps all parts (normalizeStream level)", () => {
  it("joins every part of a single multi-part Gemini chunk", async () => {
    const frames = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Kotlin, "},{"text":"Compose, "},{"text":"Room."}]}}]}\n',
      "data: [DONE]\n",
    ];
    const out = await collect(normalizeStream(sse(frames), gemini.extractDelta, gemini.extractFinishReason));
    expect(renderedText(out)).toBe("Kotlin, Compose, Room.");
  });

  it("still keeps every part even when the SAME chunk also carries finishReason", async () => {
    // The realistic shape: Gemini's terminal chunk often carries both its
    // last text and finishReason together, not as two separate events.
    const frames = [
      'data: {"candidates":[{"content":{"parts":[{"text":"It ships five "},{"text":"platforms."}]},"finishReason":"STOP"}]}\n',
      "data: [DONE]\n",
    ];
    const out = await collect(normalizeStream(sse(frames), gemini.extractDelta, gemini.extractFinishReason));
    expect(renderedText(out)).toBe("It ships five platforms.");
  });
});
