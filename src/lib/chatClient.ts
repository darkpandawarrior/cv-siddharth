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

// A provider is down, but the site is set up correctly and waiting helps.
// Kept separate from CHAT_FALLBACK because the two are different facts about
// the site and only one of them is the owner's fault.
export const CHAT_UNAVAILABLE =
  "My assistant is having trouble reaching its provider right now. Try again in a moment, or reach Siddharth directly at **siddharthpandalai990@gmail.com**.";

/**
 * What a visitor should read when a reply fails.
 *
 * The server goes to real trouble to tell 503 (a config or auth failure, which
 * the owner must fix) apart from 502 (a provider genuinely down, which nobody
 * can fix by editing anything) and logs them differently. This function used
 * to throw that distinction away and hand both the same line: "the chat
 * backend isn't configured yet (missing API key)". On a 502 that is simply
 * false. Every key is set, the site is fine, and it tells a recruiter the
 * owner shipped a half-built feature.
 *
 * 429 passes the server's own message through, the one case where it is
 * written for the visitor and actionable. 400/413 mean the request was too
 * big, which waiting does not fix.
 */
export function chatErrorText(err: unknown): string {
  const status = err instanceof Error ? err.cause : undefined;
  if (status === 429) return (err as Error).message;
  if (status === 400 || status === 413)
    return "That was too long for me to take in one go. Try a shorter message, or `/clear` to start a fresh conversation.";
  if (status === 502) return CHAT_UNAVAILABLE;
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

/**
 * The server's per-turn ceilings, mirrored. A turn over them is truncated
 * rather than sent: a JD-mode paste lands in the transcript at up to 12k chars
 * (see JD_MAX_CHARS), and replaying it verbatim in the NEXT ordinary question
 * would 400 the whole conversation. Truncating keeps the context and the
 * conversation.
 */
export const MAX_TURN_CHARS: Record<ChatMessage["role"], number> = { user: 2000, assistant: 6000 };

/** How much of a job description the JD analyzer accepts — matches the server. */
export const JD_MAX_CHARS = 12_000;

/**
 * When the character counter should go warm. Two surfaces render a JD paste box
 * against the same cap — the console's composer (src/FloatingChat.tsx) and the
 * home page's Fit check section (src/FitCheck.tsx) — so the "you're near the
 * limit" threshold lives here rather than as a magic 0.9 in each of them.
 */
export function isJdNearCap(length: number): boolean {
  return length > JD_MAX_CHARS * 0.9;
}

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_SENT_TURNS).map((m) => {
    const max = MAX_TURN_CHARS[m.role];
    return m.content.length > max ? { ...m, content: `${m.content.slice(0, max - 1)}…` } : m;
  });
}

/**
 * Consumes the server's normalized SSE stream: `data: {"text": "…"}` events.
 *
 * `mode: "jd"` is the job-description fit analyzer: a different server-side
 * system prompt, a much larger per-message cap, and a tighter rate limit. The
 * pasted description goes up ALONE — no transcript — so the raised cap can
 * only ever be spent on the thing it was raised for, and the model reads the
 * description as the one piece of data it was asked to analyse.
 *
 * `route` is where the visitor is standing (src/lib/chatContext.ts). It is a
 * hint, not a turn: the server validates it against its own allowlist and
 * appends it to the SYSTEM prompt, so it can never read as something the
 * visitor said. JD mode doesn't send it — that path is one pasted document,
 * and the page it was pasted from tells the analyzer nothing.
 */
export async function streamReply(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  mode?: "jd",
  route?: string,
): Promise<void> {
  const res = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Trimmed HERE, at the one place every surface streams through, rather
    // than in each caller — a future third caller can't reintroduce the bug.
    body: JSON.stringify(
      mode === "jd" ? { messages: messages.slice(-1), mode } : { messages: trimHistory(messages), route },
    ),
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
