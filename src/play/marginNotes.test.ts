import { describe, expect, it } from "vitest";
import { MARGIN_NOTES_MAX_PER_PIECE, addMarginNote, notesFor, removeMarginNote, type MarginNoteState } from "./marginNotes.ts";
import type { WallNote } from "./guestWall.ts";

/* Pure module, no socket, no DOM — same reason reactions.test.ts and
 * guestWall.test.ts stay pure: the keying and capping are what's worth
 * pinning down here, sanitizing itself is guestWall.test.ts's job. */

const note = (id: string): WallNote => ({ id, text: id, tint: "#3ddc84", at: 0 });

describe("notesFor", () => {
  it("is empty for a piece nobody has written against", () => {
    expect(notesFor({}, "deadline")).toEqual([]);
  });

  it("reads only this piece's notes, never another piece's", () => {
    const state: MarginNoteState = { deadline: [note("a")], ink: [note("b")] };
    expect(notesFor(state, "deadline").map((n) => n.id)).toEqual(["a"]);
  });
});

describe("addMarginNote", () => {
  it("appends without touching another piece's notes", () => {
    const state: MarginNoteState = { ink: [note("existing")] };
    const next = addMarginNote(state, "deadline", note("new"));
    expect(next.deadline.map((n) => n.id)).toEqual(["new"]);
    expect(next.ink.map((n) => n.id)).toEqual(["existing"]);
  });

  it("drops the oldest once one piece's thread is full, capped independently per piece", () => {
    const full: MarginNoteState = {
      deadline: Array.from({ length: MARGIN_NOTES_MAX_PER_PIECE }, (_, i) => note(`n${i}`)),
    };
    const next = addMarginNote(full, "deadline", note("newest"));
    expect(next.deadline).toHaveLength(MARGIN_NOTES_MAX_PER_PIECE);
    expect(next.deadline[0].id).toBe("n1");
    expect(next.deadline.at(-1)?.id).toBe("newest");
  });
});

describe("removeMarginNote", () => {
  it("removes only the matching note from the matching piece", () => {
    const state: MarginNoteState = { deadline: [note("a"), note("b")], ink: [note("a")] };
    const next = removeMarginNote(state, "deadline", "a");
    expect(next.deadline.map((n) => n.id)).toEqual(["b"]);
    expect(next.ink.map((n) => n.id)).toEqual(["a"]);
  });
});
