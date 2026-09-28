import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGlobeSystemPrompt,
  GLOBE_CONTEXT_MAX_BYTES,
  GLOBE_TEXT_MAX_CHARS,
  handleGlobeAsk,
  parseModelJson,
  validateGlobeAction,
  validateGlobeActions,
} from "./globe-ask";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("validateGlobeAction — server-side copy (mirrors copilot/validate.ts)", () => {
  it("accepts a valid flyTo and clamps range", () => {
    expect(validateGlobeAction({ type: "flyTo", lat: 999, lon: 10 })).toEqual({ type: "flyTo", lat: 90, lon: 10 });
  });
  it("rejects an unknown type", () => {
    expect(validateGlobeAction({ type: "compare" })).toBeNull();
  });
  it("rejects a non-object", () => {
    expect(validateGlobeAction("narrate")).toBeNull();
  });
  it("accepts a valid setLayer", () => {
    expect(validateGlobeAction({ type: "setLayer", id: "hazards", on: true })).toEqual({ type: "setLayer", id: "hazards", on: true });
  });
  it("rejects an out-of-catalogue layer id", () => {
    expect(validateGlobeAction({ type: "setLayer", id: "moonbase", on: true })).toBeNull();
  });
});

describe("validateGlobeActions — array cap", () => {
  it("caps at MAX_ACTIONS (5)", () => {
    const raw = Array.from({ length: 9 }, () => ({ type: "narrate", text: "hi" }));
    expect(validateGlobeActions(raw)).toHaveLength(5);
  });
});

describe("parseModelJson", () => {
  it("parses a bare JSON object", () => {
    expect(parseModelJson('{"actions":[],"narrate":"hi"}')).toEqual({ actions: [], narrate: "hi" });
  });
  it("strips a ```json fence", () => {
    expect(parseModelJson('```json\n{"actions":[],"narrate":"hi"}\n```')).toEqual({ actions: [], narrate: "hi" });
  });
  it("returns null for unparsable text", () => {
    expect(parseModelJson("not json at all")).toBeNull();
  });
  it("returns null for valid JSON that isn't an object (e.g. a bare array)", () => {
    expect(parseModelJson("[1,2,3]")).toBeNull();
  });
});

describe("buildGlobeSystemPrompt", () => {
  it("appends the context as JSON under its own heading", () => {
    const prompt = buildGlobeSystemPrompt({ simTime: "2026-09-28T00:00:00Z", quakes: { count: 3, top: [] } });
    expect(prompt).toContain("# Globe state right now");
    expect(prompt).toContain('"count":3');
    expect(prompt).toContain("Reply with ONLY a single JSON object"); // rules are present, spot-checked
  });
});

// ---------------------------------------------------------------------------
// handleGlobeAsk — the full request flow, provider mocked like chat-handler.test.ts
// ---------------------------------------------------------------------------

const sse = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l));
      c.close();
    },
  });

describe("handleGlobeAsk", () => {
  it("400s a body that isn't { text, context }", async () => {
    const res = await handleGlobeAsk({ mode: "globe" }, { allowedOrigin: null });
    expect(res.status).toBe(400);
  });

  it(`400s text over ${GLOBE_TEXT_MAX_CHARS} characters`, async () => {
    const res = await handleGlobeAsk({ text: "x".repeat(GLOBE_TEXT_MAX_CHARS + 1), context: {} }, { allowedOrigin: null });
    expect(res.status).toBe(400);
  });

  it(`400s a context over ${GLOBE_CONTEXT_MAX_BYTES} bytes`, async () => {
    const res = await handleGlobeAsk({ text: "hi", context: { big: "x".repeat(GLOBE_CONTEXT_MAX_BYTES + 1) } }, { allowedOrigin: null });
    expect(res.status).toBe(400);
  });

  it("returns a friendly narrate (never a 500) when no provider is configured", async () => {
    vi.stubEnv("CHAT_PROVIDER", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("CEREBRAS_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await handleGlobeAsk({ text: "fly somewhere", context: {} }, { allowedOrigin: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toEqual([]);
    expect(typeof body.narrate).toBe("string");
  });

  it("validates and returns the model's actions on a successful call", async () => {
    vi.stubEnv("CHAT_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const payload = JSON.stringify({ actions: [{ type: "setStyle", style: "dots" }, { type: "compare" }], narrate: "Switched to dots." });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          sse([`data: ${JSON.stringify({ choices: [{ delta: { content: payload } }] })}\n\n`, "data: [DONE]\n\n"]),
          { status: 200 },
        ),
      ),
    );
    const res = await handleGlobeAsk({ text: "what's happening in Japan", context: { quakes: { count: 0, top: [] } } }, { allowedOrigin: "https://cv-siddharth.vercel.app" });
    expect(res.status).toBe(200);
    const body = await res.json();
    // The bogus "compare" action is dropped server-side — only the real one survives.
    expect(body.actions).toEqual([{ type: "setStyle", style: "dots" }]);
    expect(body.narrate).toBe("Switched to dots.");
  });

  it("returns a friendly narrate when the model's reply isn't valid JSON", async () => {
    vi.stubEnv("CHAT_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(sse([`data: ${JSON.stringify({ choices: [{ delta: { content: "not json at all" } }] })}\n\n`, "data: [DONE]\n\n"]), {
          status: 200,
        }),
      ),
    );
    const res = await handleGlobeAsk({ text: "what's happening in Japan", context: {} }, { allowedOrigin: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toEqual([]);
    expect(typeof body.narrate).toBe("string");
    expect(body.narrate.length).toBeGreaterThan(0);
  });

  it("falls through to a friendly narrate when every provider fails", async () => {
    vi.stubEnv("CHAT_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream said no", { status: 500 })));
    const res = await handleGlobeAsk({ text: "fly somewhere", context: {} }, { allowedOrigin: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toEqual([]);
    expect(typeof body.narrate).toBe("string");
  });
});
