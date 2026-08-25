// Hand-maintained metadata around the auto-generated writing registry:
// series accents, cross-links back into the portfolio, and the blogs the
// writing lives on. Shared by the in-flow Writing section and the full
// Loopdown hub so the two surfaces never drift.
import { writing } from "./writing.ts";

export const LOOPDOWN_REPO = "https://github.com/darkpandawarrior/the-loopdown";

/** The original blog — where the archive pieces were first published. */
export const BOOKS_BEFORE_BROS = {
  name: "Books Before Bros",
  url: "https://booksbeforebros.wordpress.com/",
  blurb: "The original blog. Essays, campus lore and short fiction from before the code.",
};

/**
 * Deliberate accents, pinned to a series id because they mirror the branded
 * post cards the generator already publishes for those five. Everything else
 * gets a hue from PALETTE below, so a series can never arrive uncoloured.
 *
 * This map is an OVERRIDE list, not the registry. Do not add an entry here
 * just to give a new series a colour, it already has one.
 */
export const SERIES_COLOR: Record<string, string> = {
  "sensors-who-lie": "#8f74ff",
  "the-coroutine-court": "#4ec9b0",
  "the-night-shift": "#f0883e",
  "ghosts-in-the-recomposition": "#db61ff",
  "one-brain-two-bodies": "#38bdf8",
};

export const PLATFORMS: { key: "devto" | "linkedin" | "medium" | "hashnode"; label: string }[] = [
  { key: "devto", label: "dev.to" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "medium", label: "Medium" },
  { key: "hashnode", label: "Hashnode" },
];

/**
 * The colour for a series nothing knows about. Deliberately a neutral grey and
 * not one of the accents above: the previous fallback was sensors-who-lie's
 * own violet, so an unrecognised series rendered as a convincing-looking chip
 * that happened to be lying about which series it belonged to. Grey is the
 * only value that reads as "no accent" rather than as "that accent".
 */
const NEUTRAL = "#8a8f98";

/**
 * Hues for series with no pinned accent. None of these appears in
 * SERIES_COLOR, which is what makes an auto-assigned series unable to collide
 * with a deliberate one.
 */
const PALETTE = ["#e5c07b", "#7ee787", "#ff7b72", "#79c0ff", "#f778ba", "#a5d6ff"];

/**
 * Auto accents, assigned by position among the series that have NO pinned
 * colour rather than by position in writing.series.
 *
 * The distinction is the whole point. Indexing over the full registry looks
 * simpler and is the bug: the registry arrives sorted by id, so one new
 * series sorting early ("atomic-something") shifts every index after it and
 * silently repaints every other series. Indexing over the unpinned subset
 * means adding a series can at worst reshuffle the auto hues, which is
 * cosmetic, and can never hand two series the same colour, which is not.
 */
const auto = new Map(
  writing.series
    .map((s) => s.id)
    .filter((id) => !SERIES_COLOR[id])
    .map((id, i) => [id, PALETTE[i % PALETTE.length]] as const),
);

export const accentOf = (id?: string) => (id && (SERIES_COLOR[id] || auto.get(id))) || NEUTRAL;

/**
 * Each series is field notes from a real build, so link the reader straight to
 * it. Genuinely hand-kept: a missing entry only costs a back-link, it cannot
 * make two series look alike the way a missing accent could.
 *
 * The build each series belongs to is not guesswork. The-loopdown registry
 * publishes a `project` on every lesson, and connections.test.ts fails with
 * that value named when a series here has no home, so the answer is always in
 * the failure message rather than in somebody's memory.
 */
export const SERIES_PROJECT: Record<string, { label: string; href: string }> = {
  "sensors-who-lie": { label: "Built in: Mileway's location engine", href: "#project/mileway" },
  "the-coroutine-court": { label: "From: the -80% crashes work", href: "#work" },
  "the-night-shift": { label: "From: the 50%→95% GPS work", href: "#work" },
  "ghosts-in-the-recomposition": { label: "From: the ~87% Compose migration", href: "#work" },
  // Upstream files this series' only lesson under PaymentsLab, not Mileway.
  // It read "Mileway across 5 platforms" here for months because nothing
  // checked the two against each other.
  "one-brain-two-bodies": { label: "Built in: PaymentsLab's expect/actual split", href: "#project/paymentslab" },
  "chain-of-custody": { label: "Built in: Mileway's trip data model", href: "#project/mileway" },
  "crossing-the-schema": { label: "Built in: Mileway's Room migrations", href: "#project/mileway" },
  "notes-from-the-loop": { label: "Built in: The Loopdown itself", href: "#project/the-loopdown" },
};

export const titleize = (id?: string) =>
  (id || "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
