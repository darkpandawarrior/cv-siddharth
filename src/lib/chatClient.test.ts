import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CHAT_FALLBACK,
  CHAT_UNAVAILABLE,
  JD_MAX_CHARS,
  MAX_SENT_TURNS,
  MAX_TURN_CHARS,
  chatErrorText,
  isJdNearCap,
  streamReply,
  trimHistory,
  type ChatMessage,
} from "./chatClient";

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

  it("truncates a turn the server would reject instead of letting it 400", () => {
    // A pasted job description lives in the transcript at up to 12k chars. Sent
    // verbatim with the NEXT ordinary question it blows the server's 2000-char
    // user cap and every following question 400s — reported to the visitor as
    // "the backend isn't configured", which is a lie.
    const [user, assistant] = trimHistory([
      { role: "user", content: "j".repeat(JD_MAX_CHARS) },
      { role: "assistant", content: "a".repeat(9000) },
    ]);
    expect(user.content).toHaveLength(MAX_TURN_CHARS.user);
    expect(user.content.endsWith("…")).toBe(true);
    expect(assistant.content).toHaveLength(MAX_TURN_CHARS.assistant);
    // A turn exactly at the cap is left alone (no off-by-one truncation).
    expect(trimHistory([{ role: "user", content: "x".repeat(MAX_TURN_CHARS.user) }])[0].content).toHaveLength(
      MAX_TURN_CHARS.user,
    );
    expect(trimHistory([{ role: "user", content: "x".repeat(MAX_TURN_CHARS.user) }])[0].content).not.toMatch(/…/);
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

  it("sends a JD whole, alone, and flagged with the mode", async () => {
    let sentBody: { messages: ChatMessage[]; mode?: string } | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            c.close();
          },
        }),
        { status: 200 },
      );
    });

    const paste = "R".repeat(9000);
    await streamReply([turn(0), turn(1), { role: "user", content: paste }], () => {}, "jd");

    expect(sentBody!.mode).toBe("jd");
    // Not trimmed (the server's jd cap is 12k) and not accompanied by history:
    // the raised cap can only ever be spent on the description itself.
    expect(sentBody!.messages).toEqual([{ role: "user", content: paste }]);
  });
});

// Two surfaces render a JD paste box against the same cap — the console's
// composer and the home page's Fit check section. Pinning the threshold here
// is what stops one of them drifting to a different "you're near the limit".
describe("isJdNearCap", () => {
  it("stays cold well under the cap and goes warm in the last 10%", () => {
    expect(isJdNearCap(0)).toBe(false);
    expect(isJdNearCap(JD_MAX_CHARS * 0.9)).toBe(false);
    expect(isJdNearCap(JD_MAX_CHARS * 0.9 + 1)).toBe(true);
    expect(isJdNearCap(JD_MAX_CHARS)).toBe(true);
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
    // 502 deliberately NO LONGER falls back to the contact line. It means a
    // provider is down while the site is configured correctly, and telling a
    // visitor "missing API key" in that state is a false statement about the
    // site. Asserted in its own test below.
    expect(chatErrorText(failure(502, "nope"))).toBe(CHAT_UNAVAILABLE);
    expect(chatErrorText(new TypeError("network down"))).toBe(CHAT_FALLBACK);
    expect(chatErrorText("not an error")).toBe(CHAT_FALLBACK);
  });
});

describe("a provider outage is not a missing key", () => {
  it("tells a 502 visitor to wait, not that the site is unconfigured", () => {
    const err = Object.assign(new Error("bad gateway"), { cause: 502 });
    expect(chatErrorText(err)).toBe(CHAT_UNAVAILABLE);
    expect(chatErrorText(err)).not.toContain("missing API key");
  });

  it("still says unconfigured on a 503, which is the case that is true", () => {
    const err = Object.assign(new Error("no key"), { cause: 503 });
    expect(chatErrorText(err)).toContain("missing API key");
  });
});
