import { useState, type FormEvent } from "react";
import { usePageData } from "@playhtml/react";
import { sanitizeNote, tintFor, type WallNote } from "./guestWall.ts";
import { addMarginNote, notesFor, removeMarginNote, type MarginNoteState } from "./marginNotes.ts";
import { usePulse } from "./pulse.ts";
import { MarginNotesView } from "./MarginNotes.tsx";

/**
 * The half that touches playhtml, kept in its own module so the server never
 * loads it — same split as LiveReactionRow.tsx, same reason: `@playhtml/react`
 * reads `document` on import, and /ink and /read/$slug both server-render.
 */
const CHANNEL = "margin-notes-v1";
const MINE_KEY = "cv:margin:mine";

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

export function LiveMarginNotes({ pieceSlug, className }: { pieceSlug: string; className?: string }) {
  const [state, setState] = usePageData<MarginNoteState>(CHANNEL, {});
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<string[]>(readMine);
  const bump = usePulse();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = sanitizeNote(draft);
    if (!result.ok) {
      setError(result.reason === "link" ? "No links here, sorry — words only." : "Say something first.");
      return;
    }
    const id = crypto.randomUUID();
    const note: WallNote = { id, text: result.text, tint: tintFor(id), at: Date.now() };
    setState((draftState) => {
      const next = addMarginNote(draftState, pieceSlug, note);
      draftState[pieceSlug] = next[pieceSlug];
    });
    rememberMine(id);
    setMine(readMine());
    setDraft("");
    setError(null);
    bump("ink:margin-note");
  };

  const remove = (id: string) =>
    setState((draftState) => {
      draftState[pieceSlug] = removeMarginNote(draftState, pieceSlug, id)[pieceSlug];
    });

  return (
    <MarginNotesView
      notes={notesFor(state, pieceSlug)}
      mine={mine}
      draft={draft}
      error={error}
      onDraftChange={(v) => {
        setDraft(v);
        setError(null);
      }}
      onSubmit={submit}
      onRemove={remove}
      className={className}
    />
  );
}
