import { useState } from "react";
import { usePageData } from "@playhtml/react";
import { Eraser, MessageSquarePlus, Trash2 } from "lucide-react";
import { usePulse } from "./pulse.ts";
import { NOTE_MAX_LENGTH, appendNote, sanitizeNote, tintFor, type WallNote } from "./guestWall.ts";

/**
 * The guest wall — the one place on this site where a visitor's own words are
 * shown to the next visitor. Everything else in the shared layer is bounded
 * (presence, counters, tiles from a fixed set); this isn't, so it carries the
 * moderation.
 *
 * Three levels of it, weakest to strongest:
 *
 *  - Per-note: `sanitizeNote` strips control and bidi characters, collapses to
 *    one line, caps the length and refuses links. The wall itself is capped, so
 *    it can't be used to bloat the document every visitor downloads.
 *  - Per-author: whoever wrote a note can remove it. Ownership is a list of ids
 *    in localStorage — enough to let someone take back what they wrote, and
 *    deliberately not presented as anything stronger.
 *  - Per-deploy: VITE_GUEST_WALL=off removes the wall entirely on the next
 *    deploy. This is the switch that matters. Until the counters move behind a
 *    real API there is no server to appeal to, so the ability to turn the
 *    feature off without a code change is the actual safety net.
 *
 * `?moderate=1` reveals a clear-the-wall button. That is a convenience for me,
 * not access control — the state lives in a public room and anyone who reads
 * this file can do the same from a console. It stops being theatre when the
 * store moves server-side; the kill switch above is what to reach for
 * meanwhile.
 */

const CHANNEL = "guest-wall-v1";
const MINE_KEY = "cv:wall:mine";

export const GUEST_WALL_ENABLED = import.meta.env.VITE_GUEST_WALL !== "off";

function readMine(): string[] {
  try {
    const raw = localStorage.getItem(MINE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberMine(id: string) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([...readMine(), id].slice(-50)));
  } catch {
    /* private mode — the note still posts, it just can't be taken back later */
  }
}

export function GuestWall() {
  const [wall, setWall] = usePageData<{ notes: WallNote[] }>(CHANNEL, { notes: [] });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<string[]>(readMine);
  const bump = usePulse();

  const canModerate = typeof location !== "undefined" && new URLSearchParams(location.search).get("moderate") === "1";
  const notes = wall.notes ?? [];

  const post = (e: React.FormEvent) => {
    e.preventDefault();
    const result = sanitizeNote(draft);
    if (!result.ok) {
      setError(result.reason === "link" ? "No links on the wall, sorry — words only." : "Say something first.");
      return;
    }
    const id = crypto.randomUUID();
    const note: WallNote = { id, text: result.text, tint: tintFor(id), at: Date.now() };
    setWall((d) => {
      d.notes = appendNote(d.notes ?? [], note);
    });
    rememberMine(id);
    setMine(readMine());
    setDraft("");
    setError(null);
    bump("wall:note");
  };

  const remove = (id: string) =>
    setWall((d) => {
      d.notes = (d.notes ?? []).filter((n) => n.id !== id);
    });

  return (
    <section className="mt-16" aria-labelledby="guest-wall-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the wall</p>
          <h2 id="guest-wall-heading" className="font-display text-2xl font-bold tracking-tight">
            Leave something behind
          </h2>
        </div>
        {canModerate && notes.length > 0 && (
          <button
            type="button"
            onClick={() => setWall((d) => void (d.notes = []))}
            className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-muted transition hover:border-red-500/50 hover:text-red-400"
          >
            <Eraser size={12} /> clear the wall
          </button>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Everyone who comes through here sees this. One line, no links, and you can take yours back.
      </p>

      <form onSubmit={post} className="mt-5 flex flex-wrap items-center gap-2">
        <label htmlFor="wall-note" className="sr-only">
          Your note for the wall
        </label>
        <input
          id="wall-note"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="say hi, or tell me what you'd build with this…"
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent/60"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim"
        >
          <MessageSquarePlus size={14} /> pin it
        </button>
      </form>
      <p className="mt-2 min-h-[1.25rem] font-mono text-[11px] text-red-400" role="status">
        {error}
      </p>

      {notes.length === 0 ? (
        <p className="mt-4 font-mono text-[11px] text-muted">nothing on the wall yet — be the first.</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-3">
          {[...notes].reverse().map((n) => (
            <li
              key={n.id}
              className="group relative max-w-xs rounded-xl border p-3 text-sm leading-relaxed"
              style={{ borderColor: `${n.tint}40`, background: `${n.tint}0f` }}
            >
              {n.text}
              {mine.includes(n.id) && (
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label="Remove your note"
                  className="absolute -right-2 -top-2 rounded-full border border-line bg-ink p-1 text-muted opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
