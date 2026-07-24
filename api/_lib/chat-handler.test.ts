import { describe, it, expect } from "vitest";
import { PROVIDERS, normalizeStream } from "./chat-handler";

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

describe("provider extractDelta", () => {
  it("groq pulls choices[0].delta.content", () => {
    const groq = PROVIDERS.find((p) => p.name === "groq")!;
    expect(groq.extractDelta({ choices: [{ delta: { content: "Hi" } }] })).toBe("Hi");
    // wrong shape (e.g. gemini's) must not accidentally match
    expect(groq.extractDelta({ candidates: [{ content: { parts: [{ text: "yo" }] } }] })).toBeUndefined();
  });

  it("gemini pulls candidates[0].content.parts[0].text", () => {
    const gemini = PROVIDERS.find((p) => p.name === "gemini")!;
    expect(gemini.extractDelta({ candidates: [{ content: { parts: [{ text: "yo" }] } }] })).toBe("yo");
    expect(gemini.extractDelta({ choices: [{ delta: { content: "Hi" } }] })).toBeUndefined();
  });

  it("anthropic pulls delta.text only on content_block_delta/text_delta events", () => {
    const anthropic = PROVIDERS.find((p) => p.name === "anthropic")!;
    expect(
      anthropic.extractDelta({ type: "content_block_delta", delta: { type: "text_delta", text: "x" } }),
    ).toBe("x");
    // right event type, wrong delta type
    expect(
      anthropic.extractDelta({ type: "content_block_delta", delta: { type: "input_json_delta", text: "x" } }),
    ).toBeUndefined();
    // unrelated event
    expect(anthropic.extractDelta({ type: "message_start" })).toBeUndefined();
  });
});

describe("normalizeStream", () => {
  it("re-emits provider deltas as data:{text} events terminated by [DONE]", async () => {
    const groq = PROVIDERS.find((p) => p.name === "groq")!;
    const upstream = sse([
      'data: {"choices":[{"delta":{"content":"He"}}]}\n',
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n',
      "data: [DONE]\n",
    ]);
    const out = await collect(normalizeStream(upstream, groq.extractDelta));
    expect(out).toBe('data: {"text":"He"}\n\ndata: {"text":"llo"}\n\ndata: [DONE]\n\n');
  });

  it("drops events whose extractDelta yields nothing (no empty text frames)", async () => {
    const anthropic = PROVIDERS.find((p) => p.name === "anthropic")!;
    const upstream = sse([
      'data: {"type":"message_start"}\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n',
    ]);
    const out = await collect(normalizeStream(upstream, anthropic.extractDelta));
    expect(out).toBe('data: {"text":"hi"}\n\ndata: [DONE]\n\n');
  });
});
