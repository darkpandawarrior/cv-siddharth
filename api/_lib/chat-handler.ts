// `.js` extension: Vercel's @vercel/node builder type-checks this with its own
// tsconfig (moduleResolution "node16"), which requires explicit ESM extensions.
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { COMPOSE_SYSTEM_PROMPT } from "./compose-prompt.js";

// Vercel's builder type-checks this file WITHOUT @types/node, so bare `process`
// errors there (TS2591) even though our own tsconfig has the node types. This
// local declaration keeps both toolchains happy and needs no new dependency.
declare const process: { env: Record<string, string | undefined> };

const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 2000; // one user turn — matches the composer's maxLength
// A 1024-token reply is routinely longer than 2000 chars, and the client sends
// its own history back verbatim: capping assistant turns at MAX_MESSAGE_CHARS
// made a long reply 400 the *next* question and brick the conversation.
const MAX_ASSISTANT_CHARS = 6000;
const MAX_MESSAGES = 60; // array cap, checked BEFORE per-message validation
const MAX_TOTAL_CHARS = 24_000; // ~6k tokens of context per upstream request
const MAX_BODY_BYTES = 64 * 1024;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Which system prompt a request gets. The ONLY way to select the Compose
 * Playground's generator prompt is this server-validated field — never a magic
 * prefix inside a message, which any visitor can copy out of the public bundle
 * and type back (that was the jailbreak this replaced).
 */
type ChatMode = "chat" | "compose";

interface ChatRequest {
  messages: ChatMessage[];
  mode: ChatMode;
}

// ---------------------------------------------------------------------------
// Origin allowlist — the endpoint spends the owner's API key, so a third-party
// page must not be able to use it as a free LLM proxy from a visitor's browser.
// ---------------------------------------------------------------------------

const SITE_ORIGIN = "https://cv-siddharth.vercel.app";
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Preview deployments are matched by the hostnames Vercel hands THIS
 * deployment (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`),
 * not by a `cv-siddharth-*.vercel.app` name pattern: project names on
 * vercel.app are first-come, so anyone could register `cv-siddharth-evil` and
 * a prefix match would hand them the key. A deployment's own URL can't be
 * squatted. (If previews ever 403, the project's "Automatically expose System
 * Environment Variables" setting is off — turn it on, or list the origin in
 * ALLOWED_ORIGIN.)
 *
 * `ALLOWED_ORIGIN` keeps its documented job — the site being served from a
 * different origin than this function (GitHub Pages → Vercel) — but it is now
 * an allowlist entry rather than the literal `access-control-allow-origin`
 * value. Comma-separated for more than one.
 */
export function isAllowedOrigin(
  origin: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (origin === SITE_ORIGIN || LOCAL_ORIGIN.test(origin)) return true;
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && origin === `https://${host}`) return true;
  }
  return (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

// ---------------------------------------------------------------------------
// Rate limiting — the actual money guard.
//
// HONEST LIMITATION: this counter lives in the memory of one Edge isolate.
// Vercel runs isolates per region and recycles them freely, so an attacker who
// spreads requests across regions (or waits out a recycle) gets more than these
// numbers. It is best-effort — it stops a casual script and a stuck retry loop,
// not a determined distributed attacker. The durable fixes, when they're worth
// paying for: Vercel WAF rate limiting (Pro) or a KV/Upstash-backed counter
// (shared state across isolates). Neither is added here — no new paid
// dependency — and the limits below are deliberately generous enough that a
// per-isolate approximation still bounds the damage.
// ---------------------------------------------------------------------------

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// 10/min is ~3x faster than anyone reads a streamed reply; 60/hour is a long
// browsing session with the Compose Playground's generator included.
const RATE_WINDOWS = [
  { ms: 60_000, max: envInt(process.env.CHAT_RATE_PER_MIN, 10) },
  { ms: 3_600_000, max: envInt(process.env.CHAT_RATE_PER_HOUR, 60) },
];
const LONGEST_WINDOW_MS = 3_600_000;
const MAX_TRACKED_IPS = 5000; // bounded: ~60 timestamps per IP worst case

const hits = new Map<string, number[]>();

/**
 * Most-trustworthy header first. Vercel overwrites `x-forwarded-for` today, so
 * it can't be spoofed in production — but that guarantee is one CDN away from
 * being false (and vite.config.ts's dev middleware forwards client headers
 * verbatim, which IS spoofable), so the platform's own header wins.
 * `x-vercel-forwarded-for` is set by Vercel's edge and never by the client;
 * `x-forwarded-for` is the last resort and only its first hop is read.
 */
export function clientIp(request: Request): string {
  const h = (name: string) => request.headers.get(name)?.trim();
  return (
    h("x-vercel-forwarded-for") ||
    h("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * The bucket an address counts against.
 *
 * IPv4 (and "unknown") key on the whole address. IPv6 keys on the /64 prefix:
 * a residential IPv6 allocation IS a /64, so one machine can rotate through
 * 2^64 addresses it legitimately owns — keying on the full address turns
 * "10 per minute" into "unlimited". IPv4-mapped forms (`::ffff:1.2.3.4`) are
 * left alone: collapsing those to a prefix would put every IPv4 visitor in one
 * shared bucket, which is a denial of service against real people.
 */
export function rateLimitKey(ip: string): string {
  const bare = ip.replace(/^\[([^\]]+)\](:\d+)?$/, "$1"); // [2001:db8::1]:443
  if (!bare.includes(":") || bare.includes(".")) return bare;
  const [head, tail] = bare.split("::", 2);
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? bare.split(":")
      : [...left, ...new Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => (g || "0").toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/**
 * Sliding window per IP. A rejected request is NOT recorded, so a hammering
 * client is let back in once its oldest hit falls out of the window instead of
 * being locked out forever.
 */
export function checkRateLimit(
  ip: string,
  now: number = Date.now(),
  store: Map<string, number[]> = hits,
): { allowed: boolean; retryAfter: number } {
  const key = rateLimitKey(ip);
  if (store.size > MAX_TRACKED_IPS) {
    for (const [k, times] of store) {
      if (times[times.length - 1] <= now - LONGEST_WINDOW_MS) store.delete(k);
    }
    // Still oversized (a burst of distinct addresses): evict the oldest half by
    // last hit. NOT `store.clear()` — that let anyone rotating through 5000
    // addresses wipe the map and hand every real visitor a fresh window, i.e.
    // switch the limiter off on demand. Halving degrades it instead: the
    // clients that were just here (the ones actually being limited) survive.
    if (store.size > MAX_TRACKED_IPS) {
      const oldestFirst = [...store].sort((a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1]);
      for (const [k] of oldestFirst.slice(0, Math.ceil(oldestFirst.length / 2))) store.delete(k);
    }
  }

  const times = (store.get(key) ?? []).filter((t) => t > now - LONGEST_WINDOW_MS);
  for (const rule of RATE_WINDOWS) {
    const inWindow = times.filter((t) => t > now - rule.ms);
    if (inWindow.length >= rule.max) {
      store.set(key, times);
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((inWindow[0] + rule.ms - now) / 1000)) };
    }
  }
  times.push(now);
  store.set(key, times);
  return { allowed: true, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function isValidMessage(value: unknown): value is ChatMessage {
  const m = value as ChatMessage | null;
  if (!m || (m.role !== "user" && m.role !== "assistant")) return false;
  const limit = m.role === "assistant" ? MAX_ASSISTANT_CHARS : MAX_MESSAGE_CHARS;
  return typeof m.content === "string" && m.content.length > 0 && m.content.length <= limit;
}

/** Parsed body → messages, or null if anything about it is wrong (→ 400). */
export function validateMessages(body: unknown): ChatMessage[] | null {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  // Length first: `.every()` over an arbitrarily long array is a free DoS.
  if (messages.length > MAX_MESSAGES) return null;
  return messages.every(isValidMessage) ? (messages as ChatMessage[]) : null;
}

/**
 * Parsed body → { messages, mode }, or null (→ 400).
 *
 * `mode` is absent (normal chat) or the exact string "compose". Anything else
 * — a different string, a number, an object, `null` — is a 400 rather than a
 * silent fallback: an allowlist of one, so a future third mode can't be
 * reached by guessing and a typo fails loudly instead of quietly billing the
 * full CV prompt.
 */
export function validateRequest(body: unknown): ChatRequest | null {
  const messages = validateMessages(body);
  if (!messages) return null;
  const mode = (body as { mode?: unknown }).mode;
  if (mode !== undefined && mode !== "compose") return null;
  return { messages, mode: mode === "compose" ? "compose" : "chat" };
}

/**
 * Reads the body with a hard ceiling, then hands back the text.
 *
 * `content-length` on its own is not a check: a chunked body has none
 * (`Number(null)` → 0) and a garbage one gives NaN — both sail past a `>`
 * comparison, after which `request.json()` reads however much the client
 * sends. So the declared length is only a cheap early out; the stream itself
 * is counted as it arrives. Returns null when the ceiling is hit (→ 413).
 * Web-standard streams only — this runs on Edge.
 */
export async function readBoundedBody(request: Request, max: number = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return ""; // no body at all — let JSON parsing 400 it

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * What actually gets sent upstream: the last MAX_HISTORY turns, trimmed from
 * the front until the context fits MAX_TOTAL_CHARS. Trimming rather than
 * rejecting — a long, legitimate conversation must not start erroring, and the
 * cost per request is bounded either way.
 *
 * Also drops a leading assistant turn: Anthropic rejects a history that opens
 * on one, which `slice(-20)` of an alternating log produces on its own.
 */
export function selectHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY);
  let total = recent.reduce((n, m) => n + m.content.length, 0);
  let start = 0;
  while (start < recent.length - 1 && total > MAX_TOTAL_CHARS) total -= recent[start++].content.length;
  while (start < recent.length - 1 && recent[start].role === "assistant") start++;
  return recent.slice(start);
}

// ---------------------------------------------------------------------------
// Providers — the first one with a configured key wins (override with
// CHAT_PROVIDER=groq|gemini|anthropic). Each returns the upstream streaming
// Response plus a function that extracts the text delta from one SSE event.
// ---------------------------------------------------------------------------

interface Provider {
  name: string;
  key: () => string | undefined;
  /** `system` is chosen by the server from `mode` — never from message text. */
  request: (key: string, messages: ChatMessage[], system: string) => Promise<Response>;
  extractDelta: (event: unknown) => string | undefined;
}

/** The system prompt a validated mode selects. */
export function systemPromptFor(mode: ChatMode): string {
  return mode === "compose" ? COMPOSE_SYSTEM_PROMPT : SYSTEM_PROMPT;
}

export const PROVIDERS: Provider[] = [
  {
    name: "groq",
    key: () => process.env.GROQ_API_KEY,
    request: (key, messages, system) =>
      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: 1024,
          stream: true,
        }),
      }),
    extractDelta: (e) => (e as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content,
  },
  {
    name: "gemini",
    key: () => process.env.GEMINI_API_KEY,
    request: (key, messages, system) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
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
    request: (key, messages, system) =>
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
          system,
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

export function pickProvider(): { provider: Provider; key: string } | null {
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

/** Reflects the caller's origin once it's been allowed — never `*`. */
function corsHeaders(allowedOrigin: string | null): Record<string, string> {
  if (!allowedOrigin) return { vary: "origin" };
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function jsonError(
  status: number,
  message: string,
  allowedOrigin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(allowedOrigin), ...extraHeaders },
  });
}

/**
 * Re-emits an upstream SSE body as a provider-independent stream the widget
 * understands: `data: {"text":"…"}` events terminated by `data: [DONE]`.
 */
export function normalizeStream(upstream: ReadableStream<Uint8Array>, extractDelta: Provider["extractDelta"]): ReadableStream<Uint8Array> {
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
 * POST { messages: [{role, content}, ...], mode?: "compose" } → SSE stream of
 * `data: {"text": "…"}` events, regardless of the underlying LLM provider.
 *
 * `mode` only selects a system prompt (see systemPromptFor). Every guard —
 * origin allowlist, rate limit, body ceiling, array/char caps — runs before it
 * is even read, so the Compose Playground's path is not a second, softer door.
 */
export async function handleChat(request: Request): Promise<Response> {
  // A request with NO Origin header is rejected. This endpoint exists for one
  // thing — the chat UI on this site — and browsers attach Origin to every
  // POST, same-origin included, so nothing legitimate loses out. curl/server
  // callers can forge an Origin anyway, which is exactly why the rate limiter
  // below (not this check) is the real money guard; rejecting no-Origin just
  // removes the zero-effort case. If a 403 ever shows up for a real visitor,
  // relax this to "allow when absent" and rely on the limiter alone.
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : null;

  if (request.method === "OPTIONS") {
    // No CORS headers on a denied preflight — the browser blocks the request.
    return new Response(null, { status: allowedOrigin ? 204 : 403, headers: corsHeaders(allowedOrigin) });
  }
  if (request.method !== "POST") return jsonError(405, "Method not allowed", allowedOrigin);

  if (!allowedOrigin) {
    return jsonError(403, "This chat endpoint only serves Siddharth's portfolio site.", null);
  }

  const limit = checkRateLimit(clientIp(request));
  if (!limit.allowed) {
    return jsonError(429, "You're sending messages faster than I can think — give it a moment and try again.", allowedOrigin, {
      "retry-after": String(limit.retryAfter),
    });
  }

  // Bounded read: the ceiling is enforced on the bytes that actually arrive,
  // not on a content-length header the client controls (or omits).
  const raw = await readBoundedBody(request);
  if (raw === null) return jsonError(413, "That message is too large.", allowedOrigin);

  const picked = pickProvider();
  if (!picked) {
    // The visitor gets nothing operational — naming the env vars told an
    // attacker exactly which providers to look for. The fix stays in the logs.
    console.error("chat: no provider key configured (set GROQ_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY)");
    return jsonError(503, "Chat is not configured right now.", allowedOrigin);
  }

  const parsed = validateRequest(parseJson(raw));
  if (!parsed) return jsonError(400, 'Expected { messages: [{role, content}, ...], mode?: "compose" }.', allowedOrigin);

  const upstream = await picked.provider.request(
    picked.key,
    selectHistory(parsed.messages),
    systemPromptFor(parsed.mode),
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error(`${picked.provider.name} API error`, upstream.status, detail);
    return jsonError(502, "The model is unavailable right now. Please try again.", allowedOrigin);
  }

  return new Response(normalizeStream(upstream.body, picked.provider.extractDelta), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      ...corsHeaders(allowedOrigin),
    },
  });
}
