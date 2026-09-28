// LANE W12. The LLM fallback path: sends whatever the deterministic parser
// (intents.ts) didn't recognise, plus a compact snapshot of the globe's
// current state (context.ts), to the site's existing /api/chat endpoint in
// "globe" mode. Same endpoint, same origin allowlist, same per-IP rate
// limit and daily spend cap as every other chat mode (api/_lib/chat-handler.ts's
// own guards run before the mode-specific dispatch ever sees the request).
import { validateActions } from "./validate.ts";
import type { GlobeAction } from "./actions.ts";
import type { GlobeContextSnapshot } from "./context.ts";

export interface AskLlmResult {
  actions: GlobeAction[];
  narrate?: string;
}

// A model call for a short command; long enough for a cold provider, short
// enough that a visitor typing a question isn't left waiting indefinitely.
const ASK_TIMEOUT_MS = 12_000;

/** Never throws. A timeout, a network failure, a non-200, or a reply this
 *  client can't parse all come back as an empty action list plus one
 *  friendly `narrate` — brief: "Timeouts and failures return a friendly
 *  narrate, never an error page." */
export async function askGlobeLLM(text: string, context: GlobeContextSnapshot): Promise<AskLlmResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "globe", text, context }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const error = (body as { error?: unknown } | null)?.error;
      return { actions: [], narrate: typeof error === "string" ? error : "I couldn't reach the globe's AI co-pilot just now." };
    }

    const body: unknown = await res.json().catch(() => null);
    const b = body as { actions?: unknown; narrate?: unknown } | null;
    return {
      // Server-validated already (api/_lib/globe-ask.ts); validated again
      // here as defense in depth — see validate.ts's own header.
      actions: validateActions(b?.actions, { maxActions: 5 }),
      narrate: typeof b?.narrate === "string" ? b.narrate.slice(0, 280) : undefined,
    };
  } catch {
    return {
      actions: [],
      narrate: 'The globe\'s AI co-pilot didn\'t answer in time — try a simpler command, like "fly to Tokyo" or "show quakes above 5".',
    };
  } finally {
    clearTimeout(timer);
  }
}
