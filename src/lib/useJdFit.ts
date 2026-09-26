import { useCallback, useRef, useState } from "react";
import { chatErrorText, isAbortError, streamReply } from "./chatClient.ts";
import { matchJd, toFitReport } from "./skillMatch.ts";
// A value import from api/_lib on purpose (not the type-only imports the rest
// of src/ uses for that directory): jd-condense.ts is pure string work with
// no server-only API (no `process`, no Node builtin), so it bundles into the
// client fine, and the dossier below needs the SAME split chat-handler.ts
// actually sent upstream — not a second, hand-kept copy of the heading
// regexes. (The promptFence.ts extraction a sibling lane, P2-13b, does for
// prompt-guard.ts is the tidier long-term shape for this kind of sharing;
// out of scope here since this lane doesn't own a new src/lib file to put it
// in.)
import { jdSections } from "../../api/_lib/jd-condense.ts";

/**
 * SYS-7's dossier chit: click-to-reveal provenance behind a JD Fit score —
 * which of his skills the JD's own words matched, which sections of the
 * pasted description survived jd-condense's boilerplate trim (or none, on a
 * JD short enough that condensing never ran), and every heading it dropped.
 * `report.source` (chatBlocks.ts's JdFitReport) already names the engine —
 * this is what it doesn't carry.
 */
export interface JdFitDossier {
  matchedSkills: string[];
  keptSections: string[];
  trimmedSections: string[];
}

/**
 * One update as a JD analysis progresses. `content` is the raw reply text —
 * prose, then a `[[jdfit:{…}]]` directive — the same shape a chat bubble
 * renders; parse it with parseChatBlocks/parseJdFit (chatBlocks.ts) for a
 * JdFitReport. `done` mirrors parseChatBlocks' own flag: false while more
 * tokens may still arrive, true once the analysis has settled (model reply,
 * or every provider failed). `dossier` is computed once, from the pasted text
 * alone, and carried on every update from the first (the offline card) —
 * unlike the report itself it never changes as the model's reply supersedes
 * the instant match, so a caller can hold onto whichever copy arrived last.
 */
export interface JdFitUpdate {
  content: string;
  done: boolean;
  dossier?: JdFitDossier;
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
  // Computed once from the pasted text alone — never changes as the model's
  // reply supersedes the offline card, so every onUpdate call below carries
  // the same copy.
  const sections = jdSections(content);
  const dossier: JdFitDossier = {
    matchedSkills: jdMatch.matched.map((m) => m.skill.name),
    keptSections: sections.kept,
    trimmedSections: sections.trimmed,
  };

  onUpdate({ content: offlineCard(false), done: false, dossier });

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
        onUpdate({ content: streamed, done: false, dossier });
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
      dossier,
    });
    return;
  }
  onUpdate({ content: streamed, done: true, dossier });
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
