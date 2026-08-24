/** Margin notes — a short, anonymous note left against one piece of writing,
 *  on /ink (keyed by the fixed slug "ink") and on every /read/$slug reader
 *  (keyed by the piece's own slug).
 *
 *  One shared document, keyed by piece slug — the same shape reactions.ts
 *  already uses to keep chess/weeb/anthology from colliding on one channel —
 *  rather than one playhtml channel per piece, which would mean guessing a
 *  channel name for every one of the ~50 printed and anthology slugs.
 *
 *  Sanitizing and capping reuse guestWall.ts's `sanitizeNote` and `appendNote`
 *  rather than re-deriving either: same "no links, one line, oldest out first"
 *  rules the guest wall already tests, just applied per piece instead of
 *  globally.
 */
import { appendNote, type WallNote } from "./guestWall.ts";

/** Oldest note falls off past this, per piece — smaller than the guest wall's
 *  global cap because this bounds one piece's aside, not the whole page. */
export const MARGIN_NOTES_MAX_PER_PIECE = 20;

/** The whole shared document: every piece's notes, keyed by slug. */
export type MarginNoteState = Record<string, WallNote[]>;

/** This piece's notes, oldest first — never undefined, whatever a stranger's
 *  document looks like before anyone has written into a given slug. */
export function notesFor(state: MarginNoteState, pieceSlug: string): WallNote[] {
  return state?.[pieceSlug] ?? [];
}

/** Pure append — the state after one visitor leaves a note against a piece,
 *  capped so a flood can't grow a single piece's thread without bound. */
export function addMarginNote(state: MarginNoteState, pieceSlug: string, note: WallNote): MarginNoteState {
  return { ...state, [pieceSlug]: appendNote(notesFor(state, pieceSlug), note, MARGIN_NOTES_MAX_PER_PIECE) };
}

/** Pure removal — for the author taking their own note back. */
export function removeMarginNote(state: MarginNoteState, pieceSlug: string, id: string): MarginNoteState {
  return { ...state, [pieceSlug]: notesFor(state, pieceSlug).filter((n) => n.id !== id) };
}
