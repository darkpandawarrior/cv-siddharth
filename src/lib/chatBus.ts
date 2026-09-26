/**
 * Opening the console from anywhere — the small CustomEvent dispatches that
 * used to live inline in src/FloatingChat.tsx (which still owns the
 * listeners: the panel's `open-chat` effect). Moved out so a caller that
 * only needs to OPEN the panel — src/FaqDock.tsx's follow-up button — never
 * has to import the 1,100-line panel component to reach two functions
 * (spine F12). FloatingChat.tsx re-exports both for its 15 existing
 * `import { openChat } from "./FloatingChat.tsx"` call sites, unchanged; a
 * later lane (SP-10) repoints those imports at this module directly.
 *
 * Three payload shapes, so no caller needs prop drilling:
 *  - a string  → ask that question (every card deep-links into a
 *    conversation about itself). The original `openChat(question?)`.
 *  - `{ mode: "jd", text }` → run the fit analyzer on a pasted job
 *    description (src/FitCheck.tsx's hand-off). `openJdFit(text)`.
 *  - `{ prompt?, context? }` → FaqDock's "Ask Panda a follow-up": `context`
 *    (the FAQ question + its canned answer) is seeded into the transcript
 *    as though it already happened, so the visitor's next message — typed
 *    from `prompt`, when given, or from a focused composer otherwise — is a
 *    real follow-up rather than a re-ask of what the dock already answered.
 */
const OPEN_CHAT_EVENT = "open-chat";

/** A short quote of an FAQ answer already shown, so the panel can seed it
 *  into the transcript instead of making the model repeat it. */
export interface ChatFollowupContext {
  question: string;
  answer: string;
  /** Where the answer is cited from, e.g. "/project/doori" — informational only. */
  source?: string;
}

export interface OpenChatOpts {
  /** Auto-sent as the next question once the panel is open and idle. Omit
   *  it (context-only) to open straight into the composer instead. */
  prompt?: string;
  context?: ChatFollowupContext;
}

export type OpenChatDetail = string | OpenChatOpts | { mode: "jd"; text: string };

function dispatchOpen(detail?: OpenChatDetail) {
  window.dispatchEvent(new CustomEvent<OpenChatDetail | undefined>(OPEN_CHAT_EVENT, { detail }));
}

/** `openChat()` — just opens. `openChat("a question")` — opens and asks it
 *  (unchanged, every existing call site). `openChat({ prompt, context })` —
 *  the FAQ follow-up shape described above. */
export function openChat(question?: string | OpenChatOpts) {
  dispatchOpen(question);
}

/** Open the console straight into a fit analysis of `text`. */
export function openJdFit(text: string) {
  dispatchOpen({ mode: "jd", text });
}

export { OPEN_CHAT_EVENT };
