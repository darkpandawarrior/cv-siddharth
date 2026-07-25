import { describe, it, expect, vi, afterEach } from "vitest";
import { CHAT_FALLBACK, MAX_SENT_TURNS, chatErrorText, streamReply, trimHistory, type ChatMessage } from "./chatClient";

const turn = (i: number): ChatMessage => ({ role: i % 2 === 0 ? "user" : "assistant", content: `turn ${i}` });

describe("trimHistory", () => {
  it("sends at most the 20 turns the server would have kept anyway", () => {
    const long = Array.from({ length: 70 }, (_, i) => turn(i));
    const sent = trimHistory(long);
    expect(sent).toHaveLength(MAX_SENT_TURNS);
    expect(sent[sent.length - 1]).toEqual(turn(69)); // newest survives
    expect(sent[0]).toEqual(turn(50));
  });

  it("leaves a short conversation alone", () => {
    const short = [turn(0), turn(1)];
    expect(trimHistory(short)).toEqual(short);
  });
});

describe("streamReply", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("trims the transcript before it goes up the wire", async () => {
    // The bug: FloatingChat built history from the WHOLE in-session
    // transcript, so past ~30 exchanges the array blew the server's
    // MAX_MESSAGES=60 and every further question 400'd — reported to the
    // visitor as "the backend isn't configured".
    let sentBody: { messages: ChatMessage[] } | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"text":"hi"}\n\ndata: [DONE]\n\n'));
            c.close();
          },
        }),
        { status: 200 },
      );
    });

    const out: string[] = [];
    await streamReply(
      Array.from({ length: 70 }, (_, i) => turn(i)),
      (d) => out.push(d),
    );

    expect(sentBody!.messages).toHaveLength(20);
    expect(sentBody!.messages.at(-1)).toEqual(turn(69));
    expect(out.join("")).toBe("hi");
  });
});

describe("chatErrorText", () => {
  const failure = (status: number, message: string) => new Error(message, { cause: status });

  it("passes the rate limiter's own message through", () => {
    expect(chatErrorText(failure(429, "give it a moment"))).toBe("give it a moment");
  });

  it("tells the truth about 400/413 instead of blaming configuration", () => {
    for (const status of [400, 413]) {
      const text = chatErrorText(failure(status, "Expected { messages: … }"));
      expect(text, String(status)).not.toBe(CHAT_FALLBACK);
      expect(text).toMatch(/too long/i);
    }
  });

  it("still falls back to the contact line for everything else", () => {
    expect(chatErrorText(failure(503, "nope"))).toBe(CHAT_FALLBACK);
    expect(chatErrorText(failure(502, "nope"))).toBe(CHAT_FALLBACK);
    expect(chatErrorText(new TypeError("network down"))).toBe(CHAT_FALLBACK);
    expect(chatErrorText("not an error")).toBe(CHAT_FALLBACK);
  });
});
