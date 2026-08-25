import { describe, expect, it } from "vitest";
import {
  countsFor,
  incrementReaction,
  totalReactions,
  type ReactionState,
} from "./reactions.ts";

/* Pure module, no socket, no DOM — the arithmetic and the reading of a
 * world-writable document are what's worth pinning down here. */

describe("countsFor", () => {
  it("is empty for an item nobody has reacted to", () => {
    expect(countsFor({}, "weeb", "made-in-abyss")).toEqual({});
  });

  it("reads only this item's counts, never another item's or another surface's", () => {
    const state: ReactionState = {
      "weeb:made-in-abyss": { fire: 3 },
      "chess:made-in-abyss": { fire: 99 },
      "weeb:frieren": { laugh: 1 },
    };
    expect(countsFor(state, "weeb", "made-in-abyss")).toEqual({ fire: 3 });
  });

  it("drops anything a stranger could have written that no button ever would", () => {
    const state: ReactionState = {
      "anthology:the-tide-that-owes": {
        fire: -5,
        laugh: NaN,
        mind: Infinity,
      } as ReactionState[string],
    };
    // Nothing a real click could produce survives — including "not even a
    // number", the one case a naive Math.min(cap, n) would let through.
    const counts = countsFor(state, "anthology", "the-tide-that-owes");
    expect(counts).toEqual({});
  });

  it("caps an absurdly large but finite count rather than trusting it", () => {
    const state: ReactionState = { "chess:x": { fire: 50_000_000 } };
    expect(countsFor(state, "chess", "x").fire).toBe(999_999);
  });

  it("ignores a reaction key that isn't in the closed registry", () => {
    const state = { "chess:the-flagfall": { yeet: 40 } } as unknown as ReactionState;
    expect(countsFor(state, "chess", "the-flagfall")).toEqual({});
  });
});

describe("incrementReaction", () => {
  it("starts an item at 1 the first time it's reacted to", () => {
    const next = incrementReaction({}, "chess", "the-flagfall", "fire");
    expect(countsFor(next, "chess", "the-flagfall")).toEqual({ fire: 1 });
  });

  it("adds to the existing count without touching other reactions or other items", () => {
    const state: ReactionState = { "weeb:frieren": { fire: 2, laugh: 1 }, "weeb:other": { fire: 9 } };
    const next = incrementReaction(state, "weeb", "frieren", "fire");
    expect(countsFor(next, "weeb", "frieren")).toEqual({ fire: 3, laugh: 1 });
    expect(countsFor(next, "weeb", "other")).toEqual({ fire: 9 });
  });

  it("never pushes a single count past the cap", () => {
    const state: ReactionState = { "chess:x": { fire: 999_999 } };
    const next = incrementReaction(state, "chess", "x", "fire");
    expect(countsFor(next, "chess", "x").fire).toBe(999_999);
  });
});

describe("totalReactions", () => {
  it("sums every reaction kind on an item", () => {
    expect(totalReactions({ fire: 3, laugh: 2, mind: 1 })).toBe(6);
  });

  it("is 0 for an item with no reactions", () => {
    expect(totalReactions({})).toBe(0);
  });
});
