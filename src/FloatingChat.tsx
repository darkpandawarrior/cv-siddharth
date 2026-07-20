import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import Markdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  "How did you get GPS accuracy to 95%?",
  "Tell me about the Compose migration",
  "What's your biggest production win?",
];

const GREETING: Message = {
  role: "assistant",
  content:
    "Hi, I'm **Sid** — Siddharth's AI assistant. Ask me anything about his Android work: the GPS engineering, the Compose migration, crash hunts, or whether he's a fit for your team.",
};

const FALLBACK =
  "The chat backend isn't configured yet (missing API key). You can reach Siddharth directly at **siddharthpandalai990@gmail.com**.";

// On static hosts (GitHub Pages) there is no /api — point this at a
// deployed function instead, e.g. VITE_CHAT_API_URL=https://cv.vercel.app/api/chat
const CHAT_API_URL: string = import.meta.env.VITE_CHAT_API_URL || "/api/chat";

// Lets any button on the page open the widget without prop drilling.
// Pass a question to have the assistant asked it immediately — every card
// can deep-link straight into a conversation about itself.
const OPEN_CHAT_EVENT = "open-chat";
export function openChat(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: question }));
}

/** Consumes the server's normalized SSE stream: `data: {"text": "…"}` events. */
async function streamReply(messages: Message[], onDelta: (text: string) => void): Promise<void> {
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

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
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

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    setBusy(true);
    const history: Message[] = [...messages.filter((m) => m !== GREETING), { role: "user", content }];
    setMessages([...messages, { role: "user", content }, { role: "assistant", content: "" }]);
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
        next[next.length - 1] = { role: "assistant", content: FALLBACK };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink shadow-lg shadow-accent/20 transition hover:scale-105"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
          <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <div>
              <p className="font-display text-sm font-bold">
                Sid <span className="font-normal text-zinc-500">· AI assistant</span>
              </p>
              <p className="text-xs text-zinc-500">Answers as Siddharth, powered by Claude</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-zinc-500 hover:text-zinc-200">
              <X size={18} />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2.5 text-sm text-zinc-100"
                    : "mr-8 rounded-2xl rounded-bl-sm bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-zinc-200 [&_strong]:text-accent [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4"
                }
              >
                {m.content === "" && busy && i === messages.length - 1 ? (
                  <span className="animate-pulse text-zinc-500">thinking…</span>
                ) : (
                  <Markdown>{m.content}</Markdown>
                )}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="space-y-2 pt-2">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="block w-full rounded-xl border border-line px-3 py-2 text-left text-xs text-zinc-400 transition hover:border-accent hover:text-accent"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex gap-2 border-t border-line bg-surface p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about my work…"
              maxLength={2000}
              className="flex-1 rounded-full border border-line bg-ink px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-ink transition disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
