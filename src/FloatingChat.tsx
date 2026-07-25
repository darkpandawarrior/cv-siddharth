import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, Maximize2, MessageCircle, Minimize2, RotateCw, Send, X } from "lucide-react";
import { projects, projectBySlug } from "./data/profile.ts";
import { ChatMessageBody } from "./ChatWidgets.tsx";
import { parseChatBlocks } from "./lib/chatBlocks.ts";
import { chatErrorText, streamReply, type ChatMessage } from "./lib/chatClient.ts";

/**
 * The console — the AI assistant, as a terminal-flavoured panel.
 *
 * Three things make it more than a chat bubble:
 *  1. Generative UI — the model emits `[[rooms]]` / `[[project:mileway]]` and
 *     the reply renders REAL components (src/ChatWidgets.tsx).
 *  2. Slash commands — `/projects`, `/open <slug>`, `/rooms`… run locally with
 *     no model call, with the same ghost-completion + ↑/↓ history the terminal
 *     has, so the two surfaces feel like one system.
 *  3. The conversation survives navigation (the panel is mounted per route).
 */

const QUICK_PROMPTS = [
  "What can I do on this site?",
  "Show me the interactive demos",
  "How did you get GPS accuracy to 95%?",
  "Which project should I look at first?",
  "Tell me about the Compose migration",
];

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi, I'm **Sid** — Siddharth's AI assistant. Ask me about his Android work (GPS engineering, the Compose migration, crash hunts), or ask me to show you around — I can link you straight to the demos, case studies and writing on this site. Type `/` for commands.",
};

// The panel is mounted per route, so without this a conversation died the
// moment the assistant navigated you somewhere. Capped: this is a chat about a
// portfolio, not a document store.
const STORE_KEY = "sid-chat-v1";
const MAX_STORED = 24;

// Lets any button on the page open the widget without prop drilling.
// Pass a question to have the assistant asked it immediately — every card
// can deep-link straight into a conversation about itself.
const OPEN_CHAT_EVENT = "open-chat";
export function openChat(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: question }));
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
}

const SLUGS = projects.map((p) => p.slug);

const SLASH_COMMANDS: { name: string; usage: string; help: string; run: (arg: string, api: SlashApi) => void }[] = [
  {
    name: "projects",
    usage: "/projects",
    help: "every build, as cards",
    run: (_arg, api) =>
      api.say(`Everything I've built outside employer work:\n\n${SLUGS.map((s) => `[[project:${s}]]`).join("\n\n")}`),
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
    run: (_arg, api) => api.say("What I build with:\n\n[[skills]]"),
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

/** Copy the words, not the machinery — directives would paste as garbage. */
function plainText(content: string) {
  return parseChatBlocks(content)
    .flatMap((b) => (b.kind === "text" ? [b.text] : []))
    .join("\n\n");
}

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuHidden, setMenuHidden] = useState(false);
  const [histCursor, setHistCursor] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const firstSaveRef = useRef(true);

  /* ── Persistence ──────────────────────────────────────────────────────
   * Read in an effect, never in a state initializer: this component is
   * server-rendered on /, /resume and /project/*, where `localStorage` doesn't
   * exist and any mismatch would be a hydration error. */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
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
      localStorage.setItem(STORE_KEY, JSON.stringify({ messages: stored, expanded }));
    } catch {
      /* quota or private mode — the conversation just won't survive a reload */
    }
  }, [messages, expanded, busy]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent).detail;
      if (typeof q === "string" && q.trim()) setPendingAsk(q);
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

  // Esc closes the widget — same escapable contract as the lightbox and
  // command palette. (An open slash menu swallows Esc first, in onKeyDown.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Fire a deep-linked question once the widget is open and idle.
  useEffect(() => {
    if (open && pendingAsk && !busy) {
      const q = pendingAsk;
      setPendingAsk(null);
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingAsk, busy]);

  /** `base` lets Regenerate replay from before the last exchange. */
  async function send(text: string, base: ChatMessage[] = messages) {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    const history: ChatMessage[] = [...base.filter((m) => m !== GREETING), { role: "user", content }];
    setMessages([...base, { role: "user", content }, { role: "assistant", content: "" }]);
    try {
      await streamReply(history, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + delta };
          return next;
        });
      });
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: chatErrorText(err) };
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
      clear: () => setMessages([GREETING]),
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

  function regenerate() {
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0 || busy) return;
    void send(messages[lastUser].content, messages.slice(0, lastUser));
  }

  async function copyReply(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(plainText(content));
      setCopied(index);
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500);
    } catch {
      /* clipboard blocked — nothing useful to say about it */
    }
  }

  /* ── Slash menu + completion (mirrors the terminal's Tab/ghost UX) ────── */
  const slashQuery = input.startsWith("/") && !input.includes(" ") ? input.slice(1).toLowerCase() : null;
  const matches = slashQuery === null ? [] : SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery));
  const menuOpen = !menuHidden && matches.length > 0;
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
  const asked = new Set(messages.flatMap((m) => (m.role === "user" ? [m.content] : [])));
  const settled = !busy && messages[messages.length - 1]?.role === "assistant";
  const suggestions = settled ? QUICK_PROMPTS.filter((q) => !asked.has(q)).slice(0, messages.length === 1 ? 5 : 3) : [];
  // Regenerating a local command would just re-send "/rooms" to the model.
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  const canRegenerate = settled && lastUserIndex >= 0 && !messages[lastUserIndex].content.startsWith("/");

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
                Sid <span className="font-normal text-muted">· AI assistant</span>
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

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            <div className={`space-y-3 ${expanded ? "mx-auto w-full max-w-2xl" : ""}`}>
              {messages.map((m, i) => {
                const streaming = busy && i === messages.length - 1 && m.role === "assistant";
                // A user turn renders as plain text — deliberately NOT through
                // ChatMessageBody. Widget directives are assistant-only, so a
                // visitor typing `[[rooms]]` sees those characters back rather
                // than spoofing site UI inside the conversation.
                if (m.role === "user")
                  return (
                    <div
                      key={i}
                      className="ml-8 whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2.5 text-sm text-zinc-100"
                    >
                      {m.content}
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
                        <ChatMessageBody content={m.content} onNavigate={() => setOpen(false)} />
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
                      onClick={() => submit(q)}
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
                aria-controls="chat-slash-menu"
                aria-autocomplete="list"
                aria-activedescendant={menuOpen ? `chat-slash-${selected.name}` : undefined}
                aria-label="Ask Sid, or type a slash command"
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
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-ink transition disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
