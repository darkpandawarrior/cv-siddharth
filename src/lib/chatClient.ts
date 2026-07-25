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

/** Consumes the server's normalized SSE stream: `data: {"text": "…"}` events. */
export async function streamReply(messages: ChatMessage[], onDelta: (text: string) => void): Promise<void> {
  const res = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
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
