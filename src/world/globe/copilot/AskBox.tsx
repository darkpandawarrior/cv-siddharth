import { useState } from "react";
import { runGlobeAsk } from "./execute.ts";

/** LANE W12 ("Ask the globe"). A minimal text input — NOT mounted anywhere
 *  in this wave (brief: "a later UI lane gives it its final home: command
 *  palette + AI panel"). Importing this module (even without rendering it
 *  anywhere) is enough to pull execute.ts into the bundle graph, which is
 *  what makes its `?globeTest=1` window seam reachable at all — see
 *  execute.ts's own comment and this lane's report, "Needs from
 *  integration".
 *
 *  Deliberately unstyled beyond function: whoever mounts this decides where
 *  it lives and what it looks like (command palette row vs. a docked panel
 *  input) — this only has to prove the wiring works. */
export default function AskBox() {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setReply(null);
    try {
      setReply(await runGlobeAsk(q));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} data-globe-ask-box className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Ask the globe — "fly to Tokyo", "show quakes above 5"…'
          aria-label="Ask the globe"
          disabled={busy}
          className="min-w-0 flex-1 rounded-full border border-line bg-ink px-3 py-1.5 text-sm text-zinc-100 placeholder-muted outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
        >
          Ask
        </button>
      </div>
      {reply && (
        <p data-globe-ask-reply role="status" className="px-1 text-xs text-muted">
          {reply}
        </p>
      )}
    </form>
  );
}
