/**
 * Per-item reaction counts — one shared tally per (surface, item), so /chess,
 * /weeb and /anthology can each count reactions on their own entries without
 * colliding. Pure module, no playhtml import — same reason visitors.ts is
 * pure: the arithmetic and the reading of a world-writable document need to
 * be testable without a socket. The hook that actually reads/writes the
 * shared document lives in `ReactionRow.tsx`, its only consumer; importing
 * `@playhtml/react` from here would drag `document` into every test that
 * imports these pure functions, which is exactly what visitors.ts/pulse.ts's
 * split avoids.
 */

/* The closed set of reactions any item can carry. A registry rather than
 * free-form strings for the same reason PULSE_EVENTS is: a typo becomes a
 * type error instead of a count that quietly goes nowhere. */
export const REACTIONS = {
  fire: { emoji: "🔥", label: "Fire" },
  laugh: { emoji: "😂", label: "Funny" },
  mind: { emoji: "🤯", label: "Mind blown" },
} as const;

export type ReactionKey = keyof typeof REACTIONS;
export const REACTION_KEYS = Object.keys(REACTIONS) as ReactionKey[];

/* The closed set of surfaces that can carry reactions — also a registry, so a
 * typo'd surface name can't silently open a fourth, uncounted bucket. */
export const REACTION_SURFACES = ["chess", "weeb", "anthology"] as const;
export type ReactionSurface = (typeof REACTION_SURFACES)[number];

export type ReactionCounts = Partial<Record<ReactionKey, number>>;
/** The whole shared document: every item's counts, keyed by `itemKey`. */
export type ReactionState = Record<string, ReactionCounts>;

/* World-writable, so a count can be anything a stranger typed into the room —
 * NaN, negative, or a number nobody's finger produced. Capped rather than
 * trusted, same reasoning as visitors.ts's safeCount. */
export const MAX_REACTION_COUNT = 999_999;

function safeCount(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(MAX_REACTION_COUNT, Math.floor(n)) : 0;
}

/** The shared document's key for one item — exported so the hook and the
 *  pure functions agree on it without either re-deriving it. */
export function itemKey(surface: ReactionSurface, itemId: string): string {
  return `${surface}:${itemId}`;
}

/** This item's counts, sanitized — never NaN, negative or absurd, whatever a
 *  stranger wrote into the shared document. */
export function countsFor(state: ReactionState, surface: ReactionSurface, itemId: string): ReactionCounts {
  const raw = state?.[itemKey(surface, itemId)] ?? {};
  const out: ReactionCounts = {};
  for (const key of REACTION_KEYS) {
    const n = safeCount(raw[key]);
    if (n > 0) out[key] = n;
  }
  return out;
}

/** Pure increment — the state after one visitor reacts, capped so a flood
 *  can't push a single count past `MAX_REACTION_COUNT`. Everything else in
 *  the document passes through untouched. */
export function incrementReaction(
  state: ReactionState,
  surface: ReactionSurface,
  itemId: string,
  reaction: ReactionKey,
): ReactionState {
  const key = itemKey(surface, itemId);
  const current = countsFor(state, surface, itemId);
  return {
    ...state,
    [key]: { ...current, [reaction]: Math.min(MAX_REACTION_COUNT, (current[reaction] ?? 0) + 1) },
  };
}

/** Total reactions on one item, across every kind — the number shown when a
 *  surface wants one figure rather than a breakdown. */
export function totalReactions(counts: ReactionCounts): number {
  return Object.values(counts).reduce((sum: number, n) => sum + (n ?? 0), 0);
}
