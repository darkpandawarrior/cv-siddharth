/**
 * The one implementation of "talk to /api/chat". Both surfaces that stream a
 * reply — the floating console (src/FloatingChat.tsx) and the terminal's
 * inline `ask` (src/Terminal.tsx) — import from here, so the SSE contract,
 * the API URL override and the no-key fallback can't drift apart.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// On static hosts (GitHub Pages) there is no /api — point this at a
// deployed function instead, e.g. VITE_CHAT_API_URL=https://cv.vercel.app/api/chat
export const CHAT_API_URL: string = import.meta.env.VITE_CHAT_API_URL || "/api/chat";

// Shown when the backend answers 503 (no provider key configured) or the
// request otherwise fails — the visitor still leaves with a way to reach me.
export const CHAT_FALLBACK =
  "The chat backend isn't configured yet (missing API key). You can reach Siddharth directly at **siddharthpandalai990@gmail.com**.";

/**
 * What a visitor should read when a reply fails. Most failures are the site's
 * problem (no key, upstream down) and get the contact fallback; a 429 from the
 * endpoint's rate limiter is the one case where the server's own message is
 * written for the visitor and actually actionable ("wait a moment").
 *
 * 400/413 get their own line: they mean "this request was too big", which is
 * neither the contact fallback's fault nor something waiting fixes. Telling
 * someone the backend isn't configured when the real problem is a long
 * transcript left them stuck with no way out.
 */
export function chatErrorText(err: unknown): string {
  const status = err instanceof Error ? err.cause : undefined;
  if (status === 429) return (err as Error).message;
  if (status === 400 || status === 413)
    return "That was too long for me to take in one go — try a shorter message, or `/clear` to start a fresh conversation.";
  return CHAT_FALLBACK;
}

/**
 * How many turns actually go up the wire. The server keeps the last 20
 * (selectHistory) and 400s past 60, so sending a whole session was a slow
 * fuse: around 30 exchanges the array tripped MAX_MESSAGES and every further
 * question failed — showing the "not configured" fallback, which is a lie.
 * Trimming here loses nothing the server wouldn't have dropped anyway.
 */
export const MAX_SENT_TURNS = 20;

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_SENT_TURNS);
}

/** Consumes the server's normalized SSE stream: `data: {"text": "…"}` events. */
export async function streamReply(messages: ChatMessage[], onDelta: (text: string) => void): Promise<void> {
  const res = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Trimmed HERE, at the one place every surface streams through, rather
    // than in each caller — a future third caller can't reintroduce the bug.
    body: JSON.stringify({ messages: trimHistory(messages) }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`, { cause: res.status });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (typeof event.text === "string") onDelta(event.text);
      } catch {
        // ignore non-JSON keepalives
      }
    }
  }
}
