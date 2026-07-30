/* ── Two past selves ─────────────────────────────────────────────────────
 * Both presets are the owner's own ratings, not invented difficulty tiers.
 * Strength is search depth plus a move-selection noise term; the clock model
 * below is the same shape his 3,072-game clock analysis found, so the bot
 * shares the flaw as well as the rating.
 *
 * `rating` is the historical rating each preset is *named after* — it is not
 * a measured Elo for this engine, which has never played a rated pool. What
 * is measured: sid2026 beat sid2019 10-0 with 2 unfinished over 12 self-play
 * games at 130 plies, colours alternated, and led on material in both
 * unfinished ones. So the ordering is real and the knob does something; the
 * absolute numbers are labels, and any UI copy should present them that way.
 */

export type PresetId = "sid2019" | "sid2026";

export type Preset = {
  id: PresetId;
  label: string;
  rating: number;
  depth: number;
  noise: number;
  blurb: string;
};

export const PRESETS: Record<PresetId, Preset> = {
  sid2019: {
    id: "sid2019",
    label: "2019 Sid",
    rating: 1078,
    depth: 2,
    noise: 0.62,
    blurb:
      "The rating he actually held the day he beat an 1867 — a +789 upset. Sees one move ahead and one reply, and picks the second-best move often enough that beating it feels like beating a person.",
  },
  sid2026: {
    id: "sid2026",
    label: "2026 Sid",
    rating: 1425,
    depth: 4,
    noise: 0.16,
    blurb:
      "His chess.com blitz peak. Searches a full move deeper and second-guesses itself far less — but it still burns its clock through the middlegame and hurries the finish, because that is what the data says he does.",
  },
};

/* Clock shape, from the measured curve. Mean clock remaining as a fraction
 * of the starting time diverges between wins and losses starting at 20-30%
 * of the game and saturates at +8.5 points by 70-80% — i.e. the time goes in
 * the early middlegame, not on a late blunder. Median game is 31 moves, so
 * 20-80% progress is roughly moves 6-25 and the peak spend sits mid-teens.
 */
const PEAK_MOVE = 17;
const SPREAD = 11;
/** Past the median game length he is short of time and moves fast. */
const HURRY_FROM = 30;
const HURRY_SCALE = 18;
/** Never let the budget fall below a usable slice — a zero budget would abort
 * the search before its first iteration finished and return a random move. */
const FLOOR_MS = 120;

/** Milliseconds the bot is allowed to think on `moveNumber`. Fast through the
 * opening, slowest through moves ~10-25, hurried after that. `search` treats
 * this as a hard ceiling on iterative deepening, so a hurried bot really does
 * play shallower — the flaw is reproduced, not just described. */
export function clockBudget(preset: Preset, moveNumber: number): number {
  const n = Math.max(1, moveNumber);
  const base = 320 * preset.depth;
  const bell = Math.exp(-((n - PEAK_MOVE) ** 2) / (2 * SPREAD ** 2));
  const hurry = 1 / (1 + Math.max(0, n - HURRY_FROM) / HURRY_SCALE);
  return Math.max(FLOOR_MS, Math.round(base * (0.35 + 0.9 * bell) * hurry));
}
