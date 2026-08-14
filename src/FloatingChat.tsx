import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, Copy, Maximize2, MessageCircle, Mic, Minimize2, RotateCw, Send, Volume2, VolumeX, X } from "lucide-react";
import { projects, projectBySlug } from "./data/profile.ts";
// ponytail: ChatWidgets pulls in react-markdown, and this widget mounts on
// every route as a closed button. Rendering a message is the FIRST moment any
// of it is needed, and it cannot happen before someone opens the panel — so
// the whole markdown renderer was arriving before `load` on every page for a
// panel most visitors never open. Same code-split idiom as ParticleHeroScene.
const ChatMessageBody = lazy(() => import("./ChatWidgets.tsx").then((m) => ({ default: m.ChatMessageBody })));
import { plainText, speakableText } from "./lib/chatBlocks.ts";
import { matchJd, toFitReport } from "./lib/skillMatch.ts";
import { HOME_GREETING, JD_PROMPT, canonicalRoute, chipsFor, greetingFor } from "./lib/chatContext.ts";
import { useSpeechInput, useSpeechOutput } from "./lib/voice.ts";
import { JD_MAX_CHARS, MAX_TURN_CHARS, chatErrorText, isJdNearCap, streamReply, type ChatMessage } from "./lib/chatClient.ts";

/**
 * The console — the AI assistant, as a terminal-flavoured panel.
 *
 * Three things make it more than a chat bubble:
 *  1. Generative UI — the model emits `[[rooms]]` / `[[project:mileway]]` and
 *     the reply renders REAL components (src/ChatWidgets.tsx).
 *  2. Slash commands — `/projects`, `/open <slug>`, `/rooms`… run locally with
 *     no model call, with the same ghost-completion + ↑/↓ history the terminal
 *     has, so the two surfaces feel like one system.
 *  3. The conversation survives navigation (the panel is mounted per route) —
 *     and it KNOWS which route that is: the chips, the greeting and the
 *     server's system prompt are all route-aware (src/lib/chatContext.ts).
 *  4. Voice, both ways, on the browser's own Web Speech APIs (src/lib/voice.ts).
 */

// The greeting is a SENTINEL as much as a message: `m !== GREETING` is how the
// panel keeps it out of localStorage, out of the model's history and out of
// the copy/regenerate affordances. What's RENDERED for it comes from the
// current route (greetingFor), so the object identity has to stay stable —
// never rebuild this per render. The content below is the home text, kept as
// the fallback for any path that reads it directly.
const GREETING: ChatMessage = { role: "assistant", content: HOME_GREETING };

/** A user turn longer than this collapses behind a summary — a pasted JD is a wall. */
const COLLAPSE_TURN_CHARS = 400;

// The panel is mounted per route, so without this a conversation died the
// moment the assistant navigated you somewhere. Capped: this is a chat about a
// portfolio, not a document store.
//
// sessionStorage, NOT localStorage: the need above is "survive navigation and
// reload within one visit", which is exactly what sessionStorage scopes to.
// localStorage has no expiry, so a recruiter's half-finished JD paste — or a
// stale "nothing came back that time" error — greeted them again days later,
// as if the site had been sitting there waiting. A new visit starts clean.
const STORE_KEY = "sid-chat-v1";
const MAX_STORED = 24;

/* ── Opening the console from anywhere ───────────────────────────────────
 * One custom event, two shapes of payload, so no caller needs prop drilling:
 *  - a string  → ask that question (every card deep-links into a conversation
 *    about itself). This is `openChat(question?)`, unchanged.
 *  - `{ mode: "jd", text }` → run the fit analyzer on a pasted job description.
 *    This is what the home page's Fit check section (src/FitCheck.tsx) sends,
 *    so the section owns the textarea and NOTHING else: the request, the
 *    streaming and the scorecard stay in the one JD path below. */
const OPEN_CHAT_EVENT = "open-chat";
type OpenChatDetail = string | { mode: "jd"; text: string };

function dispatchOpen(detail?: OpenChatDetail) {
  window.dispatchEvent(new CustomEvent<OpenChatDetail | undefined>(OPEN_CHAT_EVENT, { detail }));
}

export function openChat(question?: string) {
  dispatchOpen(question);
}

/** Open the console straight into a fit analysis of `text`. */
export function openJdFit(text: string) {
  dispatchOpen({ mode: "jd", text });
}

/* ── Slash commands ──────────────────────────────────────────────────────
 * These run entirely client-side — no model call, no latency, no API key
 * needed. `/rooms` and friends answer by emitting the same widget directives
 * the model uses, so the local path and the AI path render identically. */

interface SlashApi {
  /** Append an assistant message (may contain widget directives). */
  say: (content: string) => void;
  /** Navigate and get out of the way, exactly like a link in a reply. */
  go: (to: string) => void;
  clear: () => void;
  /** Swap the composer for the job-description paste box. */
  jd: (prefill: string) => void;
}

const SLUGS = projects.map((p) => p.slug);

const SLASH_COMMANDS: { name: string; usage: string; help: string; run: (arg: string, api: SlashApi) => void }[] = [
  {
    name: "jd",
    usage: "/jd",
    help: "paste a job description, get an honest fit read",
    run: (arg, api) => api.jd(arg),
  },
  {
    name: "projects",
    usage: "/projects",
    help: "every build, as cards",
    run: (_arg, api) =>
      api.say(`Everything he's built outside employer work:\n\n${SLUGS.map((s) => `[[project:${s}]]`).join("\n\n")}`),
  },
  {
    name: "open",
    usage: "/open <slug>",
    help: "jump to a case study",
    run: (arg, api) => {
      const slug = arg.toLowerCase();
      const project = projectBySlug(slug); // typed by a visitor — never routed to unvalidated
      if (project) return api.go(`/project/${project.slug}`);
      api.say(
        slug
          ? `There's no build called \`${slug}\`. Try: ${SLUGS.join(", ")}.`
          : `Usage: \`/open <slug>\` — one of ${SLUGS.join(", ")}.`,
      );
    },
  },
  {
    name: "rooms",
    usage: "/rooms",
    help: "the interactive rooms",
    run: (_arg, api) => api.say("Every room on this site — each one is a real, working thing:\n\n[[rooms]]"),
  },
  {
    name: "metrics",
    usage: "/metrics",
    help: "the headline numbers",
    run: (_arg, api) => api.say("The numbers behind the work:\n\n[[metrics]]"),
  },
  {
    name: "skills",
    usage: "/skills",
    help: "the stack, grouped",
    run: (_arg, api) => api.say("What he builds with:\n\n[[skills]]"),
  },
  { name: "resume", usage: "/resume", help: "open the résumé", run: (_arg, api) => api.go("/resume") },
  { name: "clear", usage: "/clear", help: "reset the conversation", run: (_arg, api) => api.clear() },
  {
    name: "help",
    usage: "/help",
    help: "list these commands",
    run: (_arg, api) =>
      api.say(
        `**Console commands** — type \`/\` any time to see them:\n\n${SLASH_COMMANDS.map((c) => `- \`${c.usage}\` — ${c.help}`).join("\n")}\n\nAnything that isn't a command goes to me. **↑/↓** recalls what you've already asked, **Tab** completes.`,
      ),
  },
];

const ICON_BUTTON = "rounded p-1 text-muted transition hover:text-accent focus-visible:text-accent focus-visible:outline-none";
// The composer's round controls (mic, reader, send) — same 36px hit target as
// the send button so a phone user can hit any of them.
const COMPOSER_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line transition focus-visible:border-accent focus-visible:outline-none";

/**
 * The honest version of what "voice input" does. Chrome's SpeechRecognition is
 * not on-device — it streams audio to Google's speech service — and this site
 * has already had to correct one privacy claim it couldn't back up. Short,
 * accurate, on the control itself rather than buried in a privacy page.
 */
const MIC_DISCLOSURE =
  "Voice input is transcribed by your browser's speech service — in Chrome that means the audio is sent to Google.";

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // A turn queued by openChat()/openJdFit() before the panel was ready. Carries
  // the mode so a JD arriving from the page runs down the same path `/jd` does.
  const [pendingAsk, setPendingAsk] = useState<{ text: string; mode?: "jd" } | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuHidden, setMenuHidden] = useState(false);
  const [histCursor, setHistCursor] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  // null = normal composer; a string (possibly empty) = the JD paste box is up.
  const [jd, setJd] = useState<string | null>(null);
  const navigate = useNavigate();
  // Where the visitor is standing. Drives the chips, the greeting, and the one
  // route field the server gets (which it re-validates — see validateRoute).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const jdRef = useRef<HTMLTextAreaElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const firstSaveRef = useRef(true);
  // Whatever was already typed when the mic was pressed — a half-written
  // question must survive dictating the rest of it.
  const voicePrefixRef = useRef("");
  const spokenRef = useRef<string | null>(null);

  /* ── Voice ────────────────────────────────────────────────────────────
   * Speech-to-text FILLS the composer; it never submits on its own. A
   * recogniser mishears, and the two things a wrong send costs here are both
   * unrecoverable by the visitor: a wrong question in a transcript they can't
   * edit, and one of a small number of rate-limited model calls. Filling puts
   * the words in front of them with the caret ready — Enter is one keystroke,
   * and a misheard word is one backspace instead of one wasted turn. */
  const onTranscript = useCallback((text: string, final: boolean) => {
    const prefix = voicePrefixRef.current;
    setInput(prefix && text ? `${prefix} ${text}` : prefix + text);
    setMenuHidden(true); // a dictated "/" must not pop the command menu open
    // Hand the caret back on the last result: the words are there, Enter sends
    // them, and a misheard one is a backspace rather than a wasted turn.
    if (final) inputRef.current?.focus();
  }, []);
  const mic = useSpeechInput(onTranscript);
  const reader = useSpeechOutput();
  const { enabled: readAloud, speak, stop: stopSpeech } = reader;
  const { cancel: cancelMic } = mic;

  function toggleMic() {
    if (mic.listening) return mic.stop();
    voicePrefixRef.current = input.trim();
    mic.start();
  }

  function toggleReader() {
    // Turning it back on should read what's on screen, so forget what was
    // already spoken — otherwise the second press is a dead click.
    if (reader.enabled) spokenRef.current = null;
    reader.toggle();
  }

  /* ── Persistence ──────────────────────────────────────────────────────
   * Read in an effect, never in a state initializer: this component is
   * server-rendered on /, /resume and /project/*, where `localStorage` doesn't
   * exist and any mismatch would be a hydration error. */
  useEffect(() => {
    try {
      // Anyone who visited while this used localStorage is still carrying that
      // conversation; drop it rather than leave it orphaned in their browser.
      localStorage.removeItem(STORE_KEY);
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null");
      if (Array.isArray(saved?.messages) && saved.messages.length) setMessages([GREETING, ...saved.messages]);
      if (typeof saved?.expanded === "boolean") setExpanded(saved.expanded);
    } catch {
      /* corrupt or unavailable storage — start fresh */
    }
  }, []);

  useEffect(() => {
    // Skip the first pass: it runs in the same commit as the load effect above
    // and would write this render's (still empty) state over what was restored.
    if (firstSaveRef.current) {
      firstSaveRef.current = false;
      return;
    }
    if (busy) return; // don't write once per streamed token
    try {
      const stored = messages.filter((m) => m !== GREETING).slice(-MAX_STORED);
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ messages: stored, expanded }));
    } catch {
      /* quota or private mode — the conversation just won't survive a reload */
    }
  }, [messages, expanded, busy]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const detail = (e as CustomEvent<OpenChatDetail | undefined>).detail;
      if (typeof detail === "string") {
        if (detail.trim()) setPendingAsk({ text: detail });
        return;
      }
      if (detail?.mode === "jd" && detail.text.trim()) {
        // Clamped here as well as at the textarea: this event is reachable by
        // any caller, and the raised JD cap is the one the server enforces.
        setPendingAsk({ text: detail.text.trim().slice(0, JD_MAX_CHARS), mode: "jd" });
        setJd(null); // a half-typed paste box would outlive the analysis it started
      }
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, expanded]);

  // Focus management: whichever control opened the widget (the launcher
  // button, a card's "ask my AI" link, ...) gets focus back once it closes —
  // the panel covers it visually but nothing traps Tab inside it, so a
  // keyboard user must not be left focused on a hidden element.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      inputRef.current?.focus();
      return;
    }
    previouslyFocusedRef.current?.focus();
  }, [open]);

  // Swapping the composer moves focus with it, both ways — a keyboard user who
  // types /jd lands in the paste box, and cancelling puts them back in the
  // input rather than at the top of the document.
  const jdOpen = jd !== null;
  useEffect(() => {
    if (!open) return;
    (jdOpen ? jdRef.current : inputRef.current)?.focus();
  }, [jdOpen, open]);

  // Esc closes the widget — same escapable contract as the lightbox and
  // command palette. (An open slash menu swallows Esc first, in onKeyDown.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Closing the panel — by the X, by Esc, or by following a link out of a
  // reply — must silence it. A voice reading a page the visitor has left, or a
  // mic still open behind a closed panel, is the worst failure mode here.
  useEffect(() => {
    if (open) return;
    stopSpeech();
    cancelMic();
  }, [open, stopSpeech, cancelMic]);

  // Read a reply once it has SETTLED, not as it streams: speaking a token at a
  // time stutters, and speechSynthesis has no way to append to an utterance
  // mid-sentence. Keyed on the content, so Regenerate re-reads the new answer
  // while a re-render of the same one stays quiet.
  useEffect(() => {
    if (busy || !readAloud) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last === GREETING || !last.content) return;
    if (spokenRef.current === last.content) return;
    spokenRef.current = last.content;
    speak(speakableText(last.content, true)); // settled by definition — `busy` is false
  }, [messages, busy, readAloud, speak]);

  // Fire a deep-linked question (or a pasted JD) once the widget is open and idle.
  useEffect(() => {
    if (open && pendingAsk && !busy) {
      const { text, mode } = pendingAsk;
      setPendingAsk(null);
      void send(text, messages, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingAsk, busy]);

  /**
   * `base` lets Regenerate replay from before the last exchange; `mode` is the
   * JD analyzer, which deliberately sends the pasted description ALONE — the
   * transcript would only dilute the one thing it's meant to read.
   */
  async function send(text: string, base: ChatMessage[] = messages, mode?: "jd") {
    const content = text.trim();
    if (!content || busy) return;
    stopSpeech(); // a new question cuts off the previous answer mid-sentence
    setBusy(true);
    const history: ChatMessage[] =
      mode === "jd" ? [{ role: "user", content }] : [...base.filter((m) => m !== GREETING), { role: "user", content }];

    /* The offline first pass. matchJd is pure string work over a stack we ship
     * in the bundle, so a real scorecard is on screen in the same frame as the
     * paste — no request, no rate limit, nothing to fail. `asked` is the guard:
     * when the text named nothing recognisable there is no honest card to draw,
     * and a spinner beats a scorecard full of zeroes. */
    const jdMatch = mode === "jd" ? matchJd(content) : null;
    const hasOffline = !!jdMatch && jdMatch.asked > 0;
    const offlineCard = (final: boolean) =>
      hasOffline ? `[[jdfit:${JSON.stringify(toFitReport(jdMatch, final))}]]` : "";

    setMessages([...base, { role: "user", content }, { role: "assistant", content: offlineCard(false) }]);

    // The model's answer SUPERSEDES the offline card rather than appending to
    // it — two scorecards stacked in one bubble is worse than either alone.
    let superseded = false;
    try {
      await streamReply(
        history,
        (delta) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            const prior = superseded ? last.content : "";
            superseded = true;
            next[next.length - 1] = { ...last, content: prior + delta };
            return next;
          });
        },
        mode,
        canonicalRoute(pathname),
      );
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const next = [...prev];
        /* This is the payoff. Rate limit, 502, dead provider — the recruiter
         * still gets a real answer instead of only an apology, because the
         * offline pass never depended on the network. */
        next[next.length - 1] = {
          role: "assistant",
          content: hasOffline && !superseded ? `${offlineCard(true)}\n\n${chatErrorText(err)}` : chatErrorText(err),
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  function runSlash(line: string) {
    const [name, ...rest] = line.slice(1).split(/\s+/);
    setMessages((prev) => [...prev, { role: "user", content: line }]);
    const api: SlashApi = {
      say: (content) => setMessages((prev) => [...prev, { role: "assistant", content }]),
      go: (to) => { setOpen(false); void navigate({ to }); },
      clear: () => { setMessages([GREETING]); setJd(null); },
      jd: (prefill) => setJd(prefill.slice(0, JD_MAX_CHARS)),
    };
    const cmd = SLASH_COMMANDS.find((c) => c.name === name.toLowerCase());
    if (!cmd) return api.say(`\`/${name}\` isn't a command — type \`/help\` for the list.`);
    cmd.run(rest.join(" ").trim(), api);
  }

  function submit(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setHistCursor(null);
    setMenuIndex(0);
    setMenuHidden(false);
    if (text.startsWith("/")) runSlash(text);
    else void send(text);
  }

  /** The JD path: one paste, one analysis, straight back to the normal composer. */
  function submitJd() {
    const text = (jd ?? "").trim();
    if (!text || busy) return;
    setJd(null);
    void send(text, messages, "jd");
  }

  function regenerate() {
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0 || busy) return;
    void send(messages[lastUser].content, messages.slice(0, lastUser));
  }

  async function copyReply(content: string, index: number) {
    try {
      // `true`: the copy button only exists on a settled reply, so what lands on
      // the clipboard is what's on screen.
      await navigator.clipboard.writeText(plainText(content, true));
      setCopied(index);
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500);
    } catch {
      /* clipboard blocked — nothing useful to say about it */
    }
  }

  /* ── Slash menu + completion (mirrors the terminal's Tab/ghost UX) ────── */
  const slashQuery = input.startsWith("/") && !input.includes(" ") ? input.slice(1).toLowerCase() : null;
  const matches = slashQuery === null ? [] : SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery));
  const menuOpen = !menuHidden && !jdOpen && matches.length > 0;
  const selected = matches[Math.min(menuIndex, matches.length - 1)];
  // Second-token completion for the one command that takes an argument.
  const argQuery = /^\/open\s+(\S*)$/i.exec(input)?.[1]?.toLowerCase();
  const argHit = argQuery === undefined ? undefined : SLUGS.find((s) => s.startsWith(argQuery));
  const ghost = menuOpen && selected ? selected.name.slice(slashQuery!.length) : argHit ? argHit.slice(argQuery!.length) : "";
  const completion = menuOpen && selected
    ? `/${selected.name}${selected.usage.includes("<") ? " " : ""}`
    : argHit
      ? `/open ${argHit}`
      : null;

  const history = useMemo(() => messages.flatMap((m) => (m.role === "user" ? [m.content] : [])), [messages]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // An IME fires Enter to commit a composition — since this handler owns
    // Enter (below), without this guard typing in Japanese/Chinese would send
    // the message mid-word.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Tab" && completion) {
      e.preventDefault();
      setInput(completion);
      return;
    }
    // Enter is handled here rather than left to the form's implicit submission:
    // with the command menu open it runs the highlighted command, and it keeps
    // the keyboard path identical everywhere (implicit submit is skipped by
    // some IME/automation key paths).
    if (e.key === "Enter") {
      e.preventDefault();
      submit(menuOpen ? `/${selected.name}` : input);
      return;
    }
    if (menuOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenuIndex((i) => (i + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((i) => (i - 1 + matches.length) % matches.length); return; }
      // Dismiss the popup before the panel — standard combobox Esc behaviour.
      if (e.key === "Escape") { e.stopPropagation(); setMenuHidden(true); return; }
      return;
    }
    if (e.key === "ArrowUp") {
      if (!history.length) return;
      e.preventDefault();
      const next = histCursor === null ? history.length - 1 : Math.max(0, histCursor - 1);
      setHistCursor(next);
      setInput(history[next]);
      // Recalling a past `/command` would otherwise pop the menu open and trap
      // the next ↑ inside it. Typing anything brings the menu back.
      setMenuHidden(true);
    } else if (e.key === "ArrowDown") {
      if (histCursor === null) return;
      e.preventDefault();
      const next = histCursor + 1;
      if (next >= history.length) { setHistCursor(null); setInput(""); }
      else { setHistCursor(next); setInput(history[next]); }
    }
  }

  // The quick prompts double as follow-ups: after every settled reply the user
  // gets a few next steps they haven't asked yet, instead of the chips
  // disappearing forever after the first question. No second model call.
  //
  // They're also route-aware: on /project/mileway they ask about Mileway, in a
  // room they ask about that room. Derived from profile.ts (chatContext.ts),
  // never per-slug copy that drifts when a project is renamed.
  const asked = new Set(messages.flatMap((m) => (m.role === "user" ? [m.content] : [])));
  const settled = !busy && messages[messages.length - 1]?.role === "assistant";
  const chips = useMemo(() => chipsFor(pathname), [pathname]);
  const greeting = useMemo(() => greetingFor(pathname), [pathname]);
  const suggestions = settled ? chips.filter((q) => !asked.has(q)).slice(0, messages.length === 1 ? 5 : 3) : [];
  // Regenerating a local command would just re-send "/rooms" to the model, and
  // replaying a pasted JD through ordinary chat would send a truncated copy of
  // it against the wrong prompt — paste it again instead.
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  const canRegenerate =
    settled &&
    lastUserIndex >= 0 &&
    !messages[lastUserIndex].content.startsWith("/") &&
    messages[lastUserIndex].content.length <= MAX_TURN_CHARS.user;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink shadow-lg shadow-accent/20 transition hover:scale-105 print:hidden"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {open && (
        <div
          className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl print:hidden ${
            expanded
              ? "inset-2 sm:inset-6 lg:inset-10"
              : "bottom-6 right-6 h-[560px] max-h-[calc(100dvh-3rem)] w-[min(400px,calc(100vw-2rem))]"
          }`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
            <div className="min-w-0">
              <p className="font-display text-sm font-bold">
                <span className="mr-1.5 font-mono text-[11px] font-normal text-accent">sid@android:~$</span>
                Panda <span className="font-normal text-muted">· Siddharth’s AI assistant</span>
              </p>
              <p className="truncate text-xs text-muted">
                Answers as Siddharth · <span className="font-mono text-accent2">/</span> for commands
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Collapse chat panel" : "Expand chat panel"}
                aria-pressed={expanded}
                className={ICON_BUTTON}
              >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className={ICON_BUTTON}>
                <X size={18} />
              </button>
            </div>
          </header>

          {/* tabIndex + role: a scrollable region has to be reachable by
              keyboard, or a visitor who cannot use a pointer has no way to
              read back a long answer (WCAG 2.1.1). The transcript is also a
              live region, so replies are announced as they settle. */}
          <div
            ref={scrollRef}
            tabIndex={0}
            role="log"
            aria-live="polite"
            aria-label="Conversation transcript"
            className="flex-1 overflow-y-auto px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          >
            <div className={`space-y-3 ${expanded ? "mx-auto w-full max-w-2xl" : ""}`}>
              {messages.map((m, i) => {
                const streaming = busy && i === messages.length - 1 && m.role === "assistant";
                // LOAD-BEARING: a user turn renders as plain text and must
                // NEVER go through parseChatBlocks / ChatMessageBody. Widget
                // directives are assistant-only; the moment visitor text is
                // parsed, typing `[[rooms]]` (or any future directive) spoofs
                // real site UI inside the conversation. If you refactor these
                // two branches into one renderer, this invariant dies silently.
                if (m.role === "user")
                  return (
                    <div
                      key={i}
                      className="ml-8 whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2.5 text-sm text-zinc-100"
                    >
                      {m.content.length > COLLAPSE_TURN_CHARS ? (
                        // A pasted job description is a wall of text. <details>
                        // is the native, keyboard-operable way to fold it away
                        // without the panel becoming a scroll canyon.
                        <details>
                          <summary className="cursor-pointer font-mono text-[11px] text-zinc-300 marker:text-accent">
                            pasted text · {m.content.length.toLocaleString()} characters
                          </summary>
                          <div className="mt-2 max-h-64 overflow-y-auto text-xs leading-relaxed text-zinc-200">
                            {m.content}
                          </div>
                        </details>
                      ) : (
                        m.content
                      )}
                    </div>
                  );
                return (
                  <div key={i} className="mr-8">
                    <div
                      className={`rounded-2xl rounded-bl-sm bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-zinc-200 [&_strong]:text-accent [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 ${
                        streaming && m.content ? "chat-streaming" : ""
                      }`}
                    >
                      {streaming && !m.content ? (
                        <span className="animate-pulse text-muted">thinking…</span>
                      ) : (
                        // The greeting is rendered from the CURRENT route, not
                        // from its stored content — that's what makes it
                        // acknowledge where you are without ever becoming a
                        // second message or resetting the conversation.
                        <Suspense fallback={<span className="animate-pulse text-muted">thinking…</span>}>
                        <ChatMessageBody
                          content={m === GREETING ? greeting : m.content}
                          // Not streaming = the reply is final, so a directive
                          // that never closed is a lost widget rather than one
                          // still on the wire — and must not render as a blank
                          // bubble. (Every earlier message is final too.)
                          done={!streaming}
                          onNavigate={() => setOpen(false)}
                        />
                        </Suspense>
                      )}
                    </div>
                    {!streaming && m !== GREETING && m.content && (
                      <div className="mt-1 flex items-center gap-1 pl-1">
                        <button onClick={() => void copyReply(m.content, i)} aria-label="Copy reply" className={ICON_BUTTON}>
                          {copied === i ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                        </button>
                        {canRegenerate && i === messages.length - 1 && (
                          <button onClick={regenerate} aria-label="Regenerate reply" className={ICON_BUTTON}>
                            <RotateCw size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {suggestions.length > 0 && (
                <div className="space-y-2 pt-2">
                  {messages.length > 1 && <p className="text-[11px] uppercase tracking-widest text-muted">Ask next</p>}
                  {suggestions.map((q) => (
                    <button
                      key={q}
                      // The JD chip opens the paste box; every other chip is
                      // just a question typed for you.
                      onClick={() => (q === JD_PROMPT ? setJd("") : submit(q))}
                      className="block w-full rounded-xl border border-line px-3 py-2 text-left text-xs text-zinc-400 transition hover:border-accent hover:text-accent"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {menuOpen && (
            <ul
              id="chat-slash-menu"
              role="listbox"
              aria-label="Console commands"
              className="max-h-44 overflow-y-auto border-t border-line bg-ink px-1.5 py-1.5"
            >
              {matches.map((c, i) => (
                <li
                  key={c.name}
                  id={`chat-slash-${c.name}`}
                  role="option"
                  aria-selected={i === menuIndex}
                  onMouseEnter={() => setMenuIndex(i)}
                  onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                  onClick={() => submit(`/${c.name}`)}
                  className={`flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-1.5 ${
                    i === menuIndex ? "bg-surface" : ""
                  }`}
                >
                  <span className="font-mono text-xs text-accent">{c.usage}</span>
                  <span className="truncate text-[11px] text-muted">{c.help}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Voice status. The live region is always mounted (an aria-live
              region added at the same moment as its text is unreliably
              announced); the visible strip only appears when there IS
              something, so the composer doesn't grow a permanent bar. */}
          <p role="status" aria-live="polite" className="sr-only">
            {mic.listening ? "Listening. Speak your question." : mic.error ? mic.error : reader.speaking ? "Reading the reply aloud." : ""}
          </p>
          {(mic.listening || mic.error || reader.speaking) && (
            <div className="flex items-start gap-2 border-t border-line bg-surface px-3 pt-2 text-[11px] leading-snug">
              {mic.listening ? (
                <>
                  <span aria-hidden className="voice-live mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <span className="text-muted">
                    <span className="text-accent">Listening…</span> {MIC_DISCLOSURE}
                  </span>
                </>
              ) : mic.error ? (
                <span className="text-accent2">{mic.error}</span>
              ) : (
                <>
                  <span aria-hidden className="voice-live mt-1 h-2 w-2 shrink-0 rounded-full bg-accent2" />
                  <span className="text-muted">Reading the reply aloud.</span>
                  <button
                    type="button"
                    onClick={reader.stop}
                    className="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-muted transition hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:outline-none"
                  >
                    Stop
                  </button>
                </>
              )}
            </div>
          )}

          {jdOpen ? (
            /* JD mode — the flagship path. A single-line input can't take a
               job description, so the composer becomes a real textarea with a
               counter against the same 12k cap the server enforces, and a way
               back out (Cancel, or Esc). Enter stays a newline here; ⌘/Ctrl +
               Enter sends, like every other multi-line composer. */
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitJd();
              }}
              className="space-y-2 border-t border-line bg-surface p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="jd-input" className="font-mono text-[10px] uppercase tracking-widest text-accent2">
                  job description → fit analysis
                </label>
                <span className={`font-mono text-[10px] ${isJdNearCap(jd!.length) ? "text-accent" : "text-muted"}`}>
                  {jd!.length.toLocaleString()} / {JD_MAX_CHARS.toLocaleString()}
                </span>
              </div>
              <textarea
                id="jd-input"
                ref={jdRef}
                value={jd!}
                onChange={(e) => setJd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  // Esc backs out of JD mode before the panel's own Esc closes
                  // the whole widget — same layering as the slash menu.
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setJd(null);
                    return;
                  }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitJd();
                  }
                }}
                maxLength={JD_MAX_CHARS}
                rows={5}
                placeholder="Paste the job description here — the whole thing. I'll score the fit against my real experience and name the gaps."
                aria-describedby="jd-hint"
                className="h-28 w-full resize-none rounded-xl border border-line bg-ink px-3 py-2 text-sm leading-snug text-zinc-100 placeholder-muted outline-none focus:border-accent"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setJd(null)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:outline-none"
                >
                  Cancel
                </button>
                {/* sr-only on phones (no ⌘ key to press) but never hidden from
                    assistive tech — aria-describedby can't read display:none. */}
                <span
                  id="jd-hint"
                  className="sr-only text-[11px] text-muted sm:not-sr-only sm:min-w-0 sm:flex-1 sm:truncate sm:text-center"
                >
                  ⌘/Ctrl + Enter · Esc cancels
                </span>
                <button
                  type="submit"
                  disabled={busy || !jd!.trim()}
                  className="ml-auto rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-ink transition disabled:opacity-40"
                >
                  Analyse fit
                </button>
              </div>
            </form>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex gap-2 border-t border-line bg-surface p-3"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setMenuIndex(0);
                  setMenuHidden(false);
                }}
                onKeyDown={onKeyDown}
                placeholder="Ask about my work, or / for commands…"
                maxLength={2000}
                autoComplete="off"
                role="combobox"
                aria-expanded={menuOpen}
                // Only while the listbox exists — aria-controls pointing at a
                // missing id is a dangling reference to a screen reader.
                aria-controls={menuOpen ? "chat-slash-menu" : undefined}
                aria-autocomplete="list"
                aria-activedescendant={menuOpen ? `chat-slash-${selected.name}` : undefined}
                aria-label="Ask Panda, or type a slash command"
                className="w-full rounded-full border border-line bg-ink px-4 py-2 text-sm text-zinc-100 placeholder-muted outline-none focus:border-accent"
              />
              {ghost && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-4 flex items-center whitespace-pre text-sm text-muted"
                >
                  <span className="invisible">{input}</span>
                  {ghost}
                </span>
              )}
            </div>
            {/* Voice is an ADDITION, never the only way to do anything: every
                one of these has a typed equivalent. Where an API is missing
                (Firefox ships no SpeechRecognition) the control stays visible
                but inert — aria-disabled rather than `disabled`, so it keeps
                its place in the tab order and a screen-reader user can still
                read WHY it's off instead of finding a button that does
                nothing. */}
            <button
              type="button"
              onClick={mic.supported ? toggleMic : undefined}
              aria-pressed={mic.listening}
              aria-disabled={!mic.supported}
              aria-label={mic.supported ? "Ask by voice" : "Ask by voice — not supported in this browser"}
              title={mic.supported ? MIC_DISCLOSURE : "This browser doesn't do speech recognition — type your question instead."}
              className={`${COMPOSER_BUTTON} ${
                !mic.supported
                  ? "cursor-not-allowed border-line text-muted opacity-50"
                  : mic.listening
                    ? "border-accent bg-accent/15 text-accent"
                    : "text-muted hover:border-accent hover:text-accent"
              }`}
            >
              <Mic size={15} className={mic.listening ? "voice-live" : undefined} />
            </button>
            <button
              type="button"
              onClick={reader.supported ? toggleReader : undefined}
              aria-pressed={reader.enabled}
              aria-disabled={!reader.supported}
              aria-label={reader.supported ? "Read replies aloud" : "Read replies aloud — not supported in this browser"}
              title={
                reader.supported
                  ? "Read replies aloud. Off until you turn it on — nothing plays on its own."
                  : "This browser doesn't do speech synthesis."
              }
              className={`${COMPOSER_BUTTON} ${
                !reader.supported
                  ? "cursor-not-allowed border-line text-muted opacity-50"
                  : reader.enabled
                    ? "border-accent2 bg-accent2/15 text-accent2"
                    : "text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {reader.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-ink transition disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </form>
          )}
        </div>
      )}
    </>
  );
}
