import { useCallback, useRef, useState } from "react";
import { chatErrorText, isAbortError, streamReply } from "./chatClient.ts";
import { matchJd, toFitReport } from "./skillMatch.ts";

/**
 * One update as a JD analysis progresses. `content` is the raw reply text —
 * prose, then a `[[jdfit:{…}]]` directive — the same shape a chat bubble
 * renders; parse it with parseChatBlocks/parseJdFit (chatBlocks.ts) for a
 * JdFitReport. `done` mirrors parseChatBlocks' own flag: false while more
 * tokens may still arrive, true once the analysis has settled (model reply,
 * or every provider failed).
 */
export interface JdFitUpdate {
  content: string;
  done: boolean;
}

/**
 * Runs the JD fit analyzer once: the offline instant match (src/lib/skillMatch.ts)
 * renders through `onUpdate` immediately — no network, no rate limit — then the
 * model's real read streams in over the SAME `onUpdate` and supersedes it if it
 * lands before `signal` aborts or every provider fails.
 *
 * THE ONE IMPLEMENTATION. Both surfaces that let a visitor paste a job
 * description — the console's `/jd` path (src/FloatingChat.tsx) and the home
 * page's inline scorecard (src/FitCheck.tsx) — call this, so JD_RATE_WINDOWS
 * (the tightest budget the endpoint has) is spent once per paste, never once
 * per surface a visitor happens to trigger it from.
 *
 * An abort is RE-THROWN rather than reported through `onUpdate` — stopping is
 * not a failure, and only the caller knows what its own "stopped" UI should
 * look like (FloatingChat leaves a short note on an empty bubble; a caller
 * that doesn't care can just swallow it with `isAbortError`).
 */
export async function runJdFit(
  text: string,
  onUpdate: (update: JdFitUpdate) => void,
  signal?: AbortSignal,
): Promise<void> {
  const content = text.trim();
  if (!content) return;

  const jdMatch = matchJd(content);
  const hasOffline = jdMatch.asked > 0;
  const offlineCard = (final: boolean) => (hasOffline ? `[[jdfit:${JSON.stringify(toFitReport(jdMatch, final))}]]` : "");

  onUpdate({ content: offlineCard(false), done: false });

  // The model's answer SUPERSEDES the offline card rather than appending to
  // it — two scorecards stacked in one bubble is worse than either alone.
  let superseded = false;
  let streamed = "";
  try {
    await streamReply(
      [{ role: "user", content }],
      (delta) => {
        streamed = (superseded ? streamed : "") + delta;
        superseded = true;
        onUpdate({ content: streamed, done: false });
      },
      "jd",
      undefined,
      signal,
    );
  } catch (err) {
    if (isAbortError(err)) throw err;
    /* This is the payoff. Rate limit, 502, dead provider — the recruiter
     * still gets a real answer instead of only an apology, because the
     * offline pass never depended on the network. */
    onUpdate({
      content: hasOffline && !superseded ? `${offlineCard(true)}\n\n${chatErrorText(err)}` : chatErrorText(err),
      done: true,
    });
    return;
  }
  onUpdate({ content: streamed, done: true });
}

/** Thin React wrapper around runJdFit — see it for the actual contract. */
export function useJdFit() {
  const [state, setState] = useState<JdFitUpdate>({ content: "", done: false });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback((text: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ content: "", done: false });
    runJdFit(text, setState, controller.signal).catch((err) => {
      if (!isAbortError(err)) throw err; // a real bug, not a deliberate stop
    });
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { ...state, start, cancel };
}
