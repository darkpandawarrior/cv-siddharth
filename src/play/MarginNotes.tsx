import type { FormEvent } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { NOTE_MAX_LENGTH, type WallNote } from "./guestWall.ts";
import { LiveMarginNotes } from "./LiveMarginNotes.tsx";

/**
 * A margin note thread against one piece — /ink (slug "ink") and every
 * /read/$slug reader (the piece's own slug) share this component.
 *
 * THIS MODULE MUST NOT IMPORT @playhtml/react, for the same reason
 * ReactionRow.tsx doesn't: it reads `document` on import, and both /ink and
 * /read/$slug server-render. The live half lives in LiveMarginNotes.tsx,
 * wrapped in `<ClientOnly>` (not a hand-rolled mounted-state check): Start's
 * compiler recognises that JSX and strips its children out of the SERVER
 * compile entirely, which is what importProtection's static scan actually
 * needs — a runtime-only check alone only stops it at runtime; React still
 * resolves a lazy child while streaming on the server, and the scan still
 * finds the chunk regardless of the runtime gate. `<Hydrate when={load()}
 * split>` inside it keeps LiveMarginNotes in its own chunk, fetched once this
 * boundary is reached, now that the import above is static. The server
 * renders the same empty-state markup and the client swaps in the shared
 * notes — identical shape either way, so there is no layout shift on
 * hydration.
 */
export function MarginNotesView({
  notes,
  mine = [],
  draft = "",
  error = null,
  onDraftChange,
  onSubmit,
  onRemove,
  className = "",
}: {
  notes: WallNote[];
  mine?: string[];
  draft?: string;
  error?: string | null;
  onDraftChange?: (value: string) => void;
  onSubmit?: (e: FormEvent) => void;
  onRemove?: (id: string) => void;
  className?: string;
}) {
  const live = Boolean(onSubmit);
  return (
    <section className={`mt-12 border-t border-line pt-6 ${className}`} aria-labelledby="margin-notes-heading">
      <p className="kicker-accent">// margin notes</p>
      <h2 id="margin-notes-heading" className="sr-only">
        Leave a note against this piece
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
        Anonymous, one line, no links — and you can take yours back.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor="margin-note" className="sr-only">
          Your note
        </label>
        <input
          id="margin-note"
          value={draft}
          onChange={onDraftChange ? (e) => onDraftChange(e.target.value) : undefined}
          disabled={!live}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="leave a note here…"
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!live}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim disabled:opacity-60"
        >
          <MessageSquarePlus size={14} /> pin it
        </button>
      </form>
      {error && (
        <p className="mt-2 font-mono text-[11px] text-red-400" role="status">
          {error}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {[...notes].reverse().map((n) => (
            <li
              key={n.id}
              className="group relative max-w-xs rounded-xl border p-3 text-sm leading-relaxed"
              style={{ borderColor: `${n.tint}40`, background: `${n.tint}0f` }}
            >
              {n.text}
              {onRemove && mine.includes(n.id) && (
                <button
                  type="button"
                  onClick={() => onRemove(n.id)}
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

export function MarginNotes({ pieceSlug, className = "" }: { pieceSlug: string; className?: string }) {
  const placeholder = <MarginNotesView notes={[]} className={className} />;
  return (
    <ClientOnly fallback={placeholder}>
      <Hydrate when={load()} split fallback={placeholder}>
        <LiveMarginNotes pieceSlug={pieceSlug} className={className} />
      </Hydrate>
    </ClientOnly>
  );
}
