import { describe, expect, it } from "vitest";
import {
  PULSE_EVENTS,
  eventsInGroup,
  sumEvents,
  topEvents,
  totalInteractions,
  touchedCount,
  type PulseCounts,
} from "./pulseEvents.ts";
import { siteRooms } from "../data/surfaces.ts";

/**
 * The counter's one branch, checked against the inputs a world-writable
 * document can actually deliver.
 *
 * Imports pulseEvents.ts rather than pulse.ts on purpose: pulse.ts pulls in
 * `@playhtml/react`, which reads `document` at module load, and vitest runs
 * this project under `environment: "node"`. Pointing this file at pulse.ts
 * fails on the import line, before a single assertion runs.
 */
describe("touchedCount", () => {
  it("counts nothing in an empty document", () => {
    expect(touchedCount({})).toBe(0);
  });

  it("counts a registered event that has fired", () => {
    expect(touchedCount({ "room:lab": 3 })).toBe(1);
  });

  it("ignores a key the registry does not know", () => {
    // The whole reason this is keyed off PULSE_EVENTS and not off the keys
    // present in `counts`. The document is public and client-writable, so a
    // key left behind by an older registry — or one a stranger typed into a
    // console — is a real input, and neither may inflate the "N of M things
    // touched" finding that leads the page, whose M is the registry's size.
    expect(touchedCount({ "room:atlantis": 99 } as unknown as PulseCounts)).toBe(0);
  });

  it("does not treat zero, a negative or NaN as touched", () => {
    // Same document, same reason: a number field in it is only a number by
    // convention. `NaN > 0` is false, which is the behaviour wanted here.
    const junk = { "room:lab": 0, "room:map": -4, "room:forge": Number.NaN } as PulseCounts;
    expect(touchedCount(junk)).toBe(0);
  });

  it("tops out at the registry's own size", () => {
    const everything = Object.fromEntries(Object.keys(PULSE_EVENTS).map((event) => [event, 1])) as PulseCounts;
    expect(touchedCount(everything)).toBe(Object.keys(PULSE_EVENTS).length);
  });
});

/**
 * The guard that stops a room being counted by nothing.
 *
 * `/weeb` shipped with a card, a pavilion and a `bump("room:weeb")` call and no
 * entry in PULSE_EVENTS — RoomGrid casts `room:${slug}` for every room, so the
 * cast accepted a key the registry did not know and the clicks went into the
 * shared document to be read by nobody. /pulse drew no row for it, and every
 * figure on this site that says "rooms" was quietly saying seven of eight.
 *
 * Nothing failed when that happened, which is why it lasted. These two
 * assertions are the failing thing: a ninth room added to surfaces.ts without
 * a counter key turns them red, naming the route.
 */
describe("eventsInGroup", () => {
  it("has a counter key for every room the site ships", () => {
    const missing = siteRooms.filter((r) => !(`room:${r.to.slice(1)}` in PULSE_EVENTS));
    // The route paths, not a bare count: a red run should say `["/weeb"]`
    // rather than "expected 8 to be 9".
    expect(missing.map((r) => r.to)).toEqual([]);
  });

  it("lists them in the site's own room order", () => {
    // Order as well as membership. eventsInGroup is what /pulse's rows and
    // /playground's live sentence iterate, so registry order is render order,
    // and the site already has one canonical room order in surfaces.ts. This
    // also catches the other direction — a `room:` key in the group with no
    // room behind it.
    expect(eventsInGroup("Rooms entered")).toEqual(siteRooms.map((r) => `room:${r.to.slice(1)}`));
  });

  it("has nothing to say about a group the registry does not define", () => {
    expect(eventsInGroup("In the Atlantis Room")).toEqual([]);
  });
});

describe("sumEvents", () => {
  const inBlueprint = eventsInGroup("In the Blueprint Room");

  it("adds up what happened inside a room", () => {
    expect(sumEvents({ "blueprint:fly": 4, "blueprint:tour": 2 }, inBlueprint)).toBe(6);
  });

  it("ignores keys outside the set it was given", () => {
    expect(sumEvents({ "room:blueprint": 40, "blueprint:fly": 1 }, inBlueprint)).toBe(1);
  });

  it("cannot be dragged below zero by junk in the document", () => {
    const junk = { "blueprint:fly": -100, "blueprint:ascii": Number.NaN, "blueprint:tour": 3 } as PulseCounts;
    expect(sumEvents(junk, inBlueprint)).toBe(3);
  });
});

describe("totalInteractions", () => {
  it("counts only registered keys, so the headline equals the rows below it", () => {
    // room:weeb was the live case — bumped by RoomGrid and World.tsx with no
    // registry entry, so a raw sum over the document put the <h1> four ahead
    // of the rows a reader can add up themselves. It is registered now, so the
    // stand-in is a key nothing draws a row for: the document is shared and
    // long-lived, and an old or invented key in it must not move the headline.
    const doc = { "room:lab": 3, "room:atlantis": 4 } as unknown as PulseCounts;
    expect(totalInteractions(doc)).toBe(3);
  });

  it("cannot render NaN as the page's headline number", () => {
    const junk = { "room:lab": Number.NaN, "room:map": -8, "room:forge": 2 } as PulseCounts;
    expect(totalInteractions(junk)).toBe(2);
  });
});

describe("topEvents", () => {
  const rooms = eventsInGroup("Rooms entered");

  it("reports zero, and no winner worth naming, on an untouched document", () => {
    const top = topEvents({}, rooms);
    expect(top.count).toBe(0);
    // Every key ties at zero. The caller's contract is to read `count === 0`
    // first and never name one of these.
    expect(top.events).toEqual(rooms);
  });

  it("names the single leader", () => {
    expect(topEvents({ "room:blueprint": 6, "room:lab": 2 }, rooms)).toEqual({ events: ["room:blueprint"], count: 6 });
  });

  it("returns the whole tied set rather than picking by declaration order", () => {
    // The case the sentence exists for: at single-digit counts a tie is
    // ordinary, and returning `room:compose` here because it is declared first
    // would be a ranking invented out of the registry's source order.
    const top = topEvents({ "room:compose": 2, "room:chess": 2, "room:lab": 1 }, rooms);
    expect(top.count).toBe(2);
    expect(top.events).toEqual(["room:compose", "room:chess"]);
  });

  it("does not let a negative or a NaN win", () => {
    const junk = { "room:map": Number.NaN, "room:forge": -9, "room:lab": 1 } as PulseCounts;
    expect(topEvents(junk, rooms)).toEqual({ events: ["room:lab"], count: 1 });
  });
});
