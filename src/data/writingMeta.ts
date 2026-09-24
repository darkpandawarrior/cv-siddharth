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
  "sensors-who-lie": { label: "Built in: Doori's location engine", href: "#project/doori" },
  "the-coroutine-court": { label: "From: the -85% crashes work", href: "#work" },
  "the-night-shift": { label: "From: the 50%→95% GPS work", href: "#work" },
  "ghosts-in-the-recomposition": { label: "From: the ~87% Compose migration", href: "#work" },
  // Upstream files this series' only lesson under PaymentsLab-KMP, not Doori.
  // It read "Doori across 5 platforms" here for months because nothing
  // checked the two against each other.
  "one-brain-two-bodies": { label: "Built in: PaymentsLab-KMP's expect/actual split", href: "#project/paymentslab-kmp" },
  "chain-of-custody": { label: "Built in: Doori's trip data model", href: "#project/doori" },
  "crossing-the-schema": { label: "Built in: Doori's Room migrations", href: "#project/doori" },
  "notes-from-the-loop": { label: "Built in: The Loopdown itself", href: "#project/the-loopdown" },
};

/**
 * The Loopdown's recurring cast, re-exported so any surface that needs
 * per-lesson continuity (appearance counts, who's introduced vs still
 * waiting in the wings) reads it from here rather than reaching into the
 * generated writing.ts directly.
 */
export const cast = writing.cast;

/**
 * writing.lessons[].project name -> the registry project slug it names.
 *
 * Hand-kept rather than derived from profile/projects.ts: that file already
 * imports THIS one (for cast/titleize), so importing `projects` back here
 * would be a cycle. Keyed by the exact `name` each Project carries, since
 * that is what the-loopdown registry's `project` field actually publishes,
 * not a slug. connections.test.ts checks this map against the registry
 * project names, so a rename or a missed entry fails loudly instead of a
 * project's lessons quietly not showing up on its own page.
 *
 * Not every lesson.project value belongs here — "Dice" (the employer, not a
 * portfolio project) and "AgentHarness" (private infra with no public page)
 * are real, current values with no registry slug, and that is correct: a
 * lesson can document work with nowhere on this site to link back to.
 */
export const PROJECT_SLUG_BY_NAME: Record<string, string> = {
  Doori: "doori",
  Gaddi: "gaddi",
  "PaymentsLab-KMP": "paymentslab-kmp",
  Candidai: "candidai",
  "Portfolio Twin": "portfolio",
  STUTTER: "stutter",
  "SINC-P": "sinc-p",
  "The KMP toolkit family": "kmp-family",
  "The Loopdown": "the-loopdown",
};

export type LessonNote = { slug: string; title: string; href: string; live: boolean };

/**
 * The individual lessons that document a build, keyed by the project's own
 * slug — a finer grain than fieldNotesFor's series-level chips above. A
 * series groups several lessons under one accent; this is the per-lesson row
 * ProjectDetail renders underneath that chip, so "field notes from this
 * build" resolves to the actual posts, not just the series they belong to.
 */
export function lessonsFor(slug: string): LessonNote[] {
  return writing.lessons
    .filter((l) => l.project && PROJECT_SLUG_BY_NAME[l.project] === slug)
    .map((l) => ({
      slug: l.slug,
      title: l.title,
      href: l.links?.devto || l.links?.hashnode || l.links?.medium || l.links?.linkedin || "",
      live: Boolean(l.links?.devto || l.links?.hashnode || l.links?.medium || l.links?.linkedin),
    }));
}

export const titleize = (id?: string) =>
  (id || "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
