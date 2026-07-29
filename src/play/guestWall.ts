/** Pure rules for the guest wall — kept out of the component so the parts that
 *  face untrusted input can be tested without a socket or a DOM. */

export interface WallNote {
  id: string;
  text: string;
  tint: string;
  at: number;
}

export const NOTE_MAX_LENGTH = 140;
/** Oldest notes fall off past this. Bounds both the render cost and the size of
 *  the shared document, which every visitor downloads on arrival. */
export const WALL_MAX_NOTES = 60;

export const NOTE_TINTS = ["#3ddc84", "#5ee6ff", "#db61ff", "#f0883e"] as const;

/* Anonymous, unauthenticated, world-writable input rendered to every later
 * visitor — so it gets treated as hostile even though React escapes it. Links
 * are refused outright: a public wall on a job-hunt portfolio is a spam target
 * long before it is a defacement target, and there is no good reason for a
 * "say hi" box to carry a URL. */
const LINK_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|top|link|shop)\b)/i;

/* C0/C1 controls, plus the bidi overrides that let a string render as something
 * other than what it says. Newlines are in here too: a note is one line. */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export type NoteRejection = "empty" | "link";

/** Normalise a submitted note, or say why it can't be posted. */
export function sanitizeNote(raw: string): { ok: true; text: string } | { ok: false; reason: NoteRejection } {
  const text = raw.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX_LENGTH);
  if (!text) return { ok: false, reason: "empty" };
  if (LINK_PATTERN.test(text)) return { ok: false, reason: "link" };
  return { ok: true, text };
}

/** Append a note, keeping the wall inside its cap (oldest out first). */
export function appendNote(notes: WallNote[], note: WallNote): WallNote[] {
  return [...notes, note].slice(-WALL_MAX_NOTES);
}

/** A stable tint per note, so the wall looks composed rather than random. */
export function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return NOTE_TINTS[h % NOTE_TINTS.length];
}
