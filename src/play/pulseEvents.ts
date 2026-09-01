/**
 * The interaction registry, and the arithmetic over it that has to be testable.
 *
 * Split out of pulse.ts for one mechanical reason: pulse.ts imports
 * `@playhtml/react`, which reads `document` the moment it is loaded, and this
 * project runs vitest under `environment: "node"` with no DOM. Anything a test
 * has to import therefore cannot sit beside that import. It is the same split
 * visitors.ts, guestWall.ts and reactions.ts already make, for the same reason
 * — pulse.ts was the one shared-layer module that never got its pure half.
 *
 * pulse.ts re-exports everything here, so no consumer moved.
 */

/* The closed set of things worth counting. A registry rather than free-form
 * strings so /pulse can label and group without a second lookup table, and so a
 * typo is a type error instead of a section that silently counts into nowhere. */
export const PULSE_EVENTS = {
  "room:compose": { label: "Compose Playground", group: "Rooms entered" },
  "room:lab": { label: "The Lab Bench", group: "Rooms entered" },
  "room:blueprint": { label: "The Blueprint Room", group: "Rooms entered" },
  "room:map": { label: "The 3D Storyboard", group: "Rooms entered" },
  "room:forge": { label: "The Particle Forge", group: "Rooms entered" },
  "room:terminal": { label: "The Terminal", group: "Rooms entered" },
  "room:chess": { label: "The Board", group: "Rooms entered" },
  "room:weeb": { label: "Weeb Central", group: "Rooms entered" },
  "blueprint:fly": { label: "Flew through it in 3D", group: "In the Blueprint Room" },
  "blueprint:ascii": { label: "Switched to the ASCII render", group: "In the Blueprint Room" },
  "blueprint:sketch": { label: "Opened the whiteboard", group: "In the Blueprint Room" },
  "blueprint:tour": { label: "Took the guided tour", group: "In the Blueprint Room" },
  "blueprint:reset": { label: "Reset the view", group: "In the Blueprint Room" },
  "playground:move": { label: "Rearranged the room tiles", group: "In the Playground" },
  "playground:tidy": { label: "Tidied the tiles back up", group: "In the Playground" },
  "wall:note": { label: "Left a note on the wall", group: "In the Playground" },
  "ink:margin-note": { label: "Left a margin note", group: "In the Ink" },
  "chess:guess": { label: "Called a game won or lost", group: "In the Chess Room" },
  "chess:puzzle": { label: "Tried the daily puzzle", group: "In the Chess Room" },
} as const;

export type PulseEvent = keyof typeof PULSE_EVENTS;
export type PulseCounts = Partial<Record<PulseEvent, number>>;

/**
 * How many of the counted things have ever fired — the finding /pulse leads
 * with, rather than a total that says nothing about coverage.
 *
 * Keyed off the registry rather than off whatever keys `counts` happens to
 * hold. The document is world-writable and long-lived, so a key from an older
 * registry, or one a stranger typed into a console, is a real input; counting
 * `Object.keys(counts)` would let either inflate the "N of M things touched"
 * finding past what the site actually measures — and M is this registry's own
 * size, so the numerator has to come from the same place. `> 0` also rejects
 * the negatives and NaNs that a world-writable number field can carry.
 */
export function touchedCount(counts: PulseCounts): number {
  return (Object.keys(PULSE_EVENTS) as PulseEvent[]).filter((event) => (counts[event] ?? 0) > 0).length;
}

/**
 * One reading of one key, sanitised.
 *
 * Same reasoning as touchedCount's `> 0`: the channel is a public,
 * client-writable document, so a "number" in it is only a number by
 * convention. A negative or a NaN left there by a stranger's console must not
 * be able to drag a sum below zero or poison a Math.max comparison.
 */
const reading = (counts: PulseCounts, event: PulseEvent): number => {
  const n = counts[event];
  return typeof n === "number" && n > 0 ? n : 0;
};

/**
 * The registered keys in one display group, in registry order.
 *
 * Keyed off the group string the registry already carries rather than off a
 * second hand-kept list of "the room keys". `room:weeb` is the case that
 * proved it: /playground and the 3D world both bumped that key while the
 * registry above had no entry for it, and the fix was that one entry — every
 * consumer of this function picked the room up with no second edit to forget.
 * pulse.test.ts now fails if a room route ever loses its key again.
 */
export function eventsInGroup(group: string): PulseEvent[] {
  return (Object.keys(PULSE_EVENTS) as PulseEvent[]).filter((event) => PULSE_EVENTS[event].group === group);
}

/**
 * The keys a room counts once you are INSIDE it — `"blueprint"` → the
 * `blueprint:*` set, in registry order.
 *
 * The room's own route slug is its key prefix, which is the whole derivation:
 * `room:blueprint` owns `blueprint:fly`, `room:chess` owns `chess:puzzle`.
 * Both /pulse and /playground need this and both had written their own —
 * /pulse off the registry, /playground as a two-entry map keyed by route onto
 * the registry's PROSE group strings ("In the Chess Room" for a room labelled
 * "The Board"). That second one had two live failure modes: a counter wired
 * into a third room left /playground's footnote asserting only two rooms count
 * anything, and renaming a group label would have made the lookup return
 * nothing while the map stayed truthy, rendering "0 things done inside"
 * forever. One derivation, no list to forget.
 */
export function eventsInsideRoom(slug: string): PulseEvent[] {
  return (Object.keys(PULSE_EVENTS) as PulseEvent[]).filter((event) => event.startsWith(`${slug}:`));
}

/** Total across a set of keys. */
export function sumEvents(counts: PulseCounts, events: PulseEvent[]): number {
  return events.reduce((total, event) => total + reading(counts, event), 0);
}

/**
 * The headline total on /pulse — every REGISTERED key, and nothing else.
 *
 * Scoped to the registry for the same reason touchedCount is, plus one that is
 * specific to this number: every other figure on /pulse — groupPulse, the
 * ranked strip, the top five — iterates the registry, so a raw
 * `Object.values(counts)` sum here would count keys none of them draw a row
 * for and put the <h1> ahead of the rows directly beneath it, on a page whose
 * whole argument is that its numbers are checkable. `room:weeb` was that key:
 * bumped by RoomGrid and World.tsx, absent from the registry, and four ahead
 * in the headline. It is registered now, so it is in both halves — but the
 * document is shared and long-lived, so a key from an older registry or a
 * stranger's console can still appear in it, and the invariant has to hold
 * without depending on the registry being complete. Each key is read once, so
 * nothing can be counted twice. Going through sumEvents also means the
 * world-writable document cannot render the headline as "NaN interactions".
 */
export function totalInteractions(counts: PulseCounts): number {
  return sumEvents(counts, Object.keys(PULSE_EVENTS) as PulseEvent[]);
}

/**
 * The keys tied at the highest count, and that count.
 *
 * Returns the whole tied set rather than a winner, because at the counts this
 * site actually sees ("6" is a busy room) a two-way tie is the common case and
 * silently picking the first key in registry order would invent a ranking out
 * of declaration order. A caller with `events.length > 1` is supposed to say
 * "tied", not pick.
 *
 * `count === 0` means nothing in the set has ever fired; `events` is then the
 * whole set and means nothing.
 */
export function topEvents(counts: PulseCounts, events: PulseEvent[]): { events: PulseEvent[]; count: number } {
  const count = events.reduce((max, event) => Math.max(max, reading(counts, event)), 0);
  return { events: events.filter((event) => reading(counts, event) === count), count };
}
