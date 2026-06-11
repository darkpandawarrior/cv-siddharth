import { SYSTEM_PROMPT } from "./system-prompt";

const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 2000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Providers — the first one with a configured key wins (override with
// CHAT_PROVIDER=groq|gemini|anthropic). Each returns the upstream streaming
// Response plus a function that extracts the text delta from one SSE event.
// ---------------------------------------------------------------------------

interface Provider {
  name: string;
  key: () => string | undefined;
  request: (key: string, messages: ChatMessage[]) => Promise<Response>;
  extractDelta: (event: unknown) => string | undefined;
}

const PROVIDERS: Provider[] = [
  {
    name: "groq",
    key: () => process.env.GROQ_API_KEY,
    request: (key, messages) =>
      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 1024,
          stream: true,
        }),
      }),
    extractDelta: (e) => (e as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content,
  },
  {
    name: "gemini",
    key: () => process.env.GEMINI_API_KEY,
    request: (key, messages) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: { maxOutputTokens: 1024 },
          }),
        },
      ),
    extractDelta: (e) =>
      (e as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts?.[0]
        ?.text,
  },
  {
    name: "anthropic",
    key: () => process.env.ANTHROPIC_API_KEY,
    request: (key, messages) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
          stream: true,
        }),
      }),
    extractDelta: (e) => {
      const event = e as { type?: string; delta?: { type?: string; text?: string } };
      return event.type === "content_block_delta" && event.delta?.type === "text_delta"
        ? event.delta.text
        : undefined;
    },
  },
];

function pickProvider(): { provider: Provider; key: string } | null {
  const forced = process.env.CHAT_PROVIDER;
  const candidates = forced ? PROVIDERS.filter((p) => p.name === forced) : PROVIDERS;
  for (const provider of candidates) {
    const key = provider.key();
    if (key) return { provider, key };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

// When the site is hosted on a different origin than this function
// (e.g. GitHub Pages → Vercel), set ALLOWED_ORIGIN to the site origin.
function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": process.env.ALLOWED_ORIGIN ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

/**
 * Re-emits an upstream SSE body as a provider-independent stream the widget
 * understands: `data: {"text":"…"}` events terminated by `data: [DONE]`.
 */
function normalizeStream(upstream: ReadableStream<Uint8Array>, extractDelta: Provider["extractDelta"]): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const delta = extractDelta(JSON.parse(line.slice(6)));
            if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
          } catch {
            // partial or non-JSON event — skip
          }
        }
      },
      flush(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      },
    }),
  );
}

/**
 * POST { messages: [{role, content}, ...] } → SSE stream of
 * `data: {"text": "…"}` events, regardless of the underlying LLM provider.
 */
export async function handleChat(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "POST") return jsonError(405, "Method not allowed");

  const picked = pickProvider();
  if (!picked) {
    return jsonError(503, "Chat is not configured: set GROQ_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.");
  }

  let messages: ChatMessage[];
  try {
    const body = await request.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
    if (
      !messages.every(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length > 0 &&
          m.content.length <= MAX_MESSAGE_CHARS,
      )
    ) {
      throw new Error();
    }
  } catch {
    return jsonError(400, "Expected { messages: [{role, content}, ...] }.");
  }

  const upstream = await picked.provider.request(picked.key, messages.slice(-MAX_HISTORY));

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error(`${picked.provider.name} API error`, upstream.status, detail);
    return jsonError(502, "The model is unavailable right now. Please try again.");
  }

  return new Response(normalizeStream(upstream.body, picked.provider.extractDelta), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      ...corsHeaders(),
    },
  });
}
