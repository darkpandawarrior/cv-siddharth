// Hand-maintained metadata around the auto-generated writing registry:
// series accents, cross-links back into the portfolio, and the blogs the
// writing lives on. Shared by the in-flow Writing section and the full
// Loopdown hub so the two surfaces never drift.

export const LOOPDOWN_REPO = "https://github.com/darkpandawarrior/the-loopdown";

/** The original blog — where the archive pieces were first published. */
export const BOOKS_BEFORE_BROS = {
  name: "Books Before Bros",
  url: "https://booksbeforebros.wordpress.com/",
  blurb: "The original blog. Essays, campus lore and short fiction from before the code.",
};

// series accent colors mirror the generated post cards
export const SERIES_COLOR: Record<string, string> = {
  "sensors-who-lie": "#7c5cff",
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

export const accentOf = (id?: string) => (id && SERIES_COLOR[id]) || "#7c5cff";

// Each series is field notes from a real build — link the reader straight to it.
export const SERIES_PROJECT: Record<string, { label: string; href: string }> = {
  "sensors-who-lie": { label: "Built in: Mileway's location engine", href: "#project/mileway" },
  "the-coroutine-court": { label: "From: the -80% crashes work", href: "#work" },
  "the-night-shift": { label: "From: the 50%→95% GPS work", href: "#work" },
  "ghosts-in-the-recomposition": { label: "From: the 92% Compose migration", href: "#work" },
  "one-brain-two-bodies": { label: "Built in: Mileway across 5 platforms", href: "#project/mileway" },
};

export const titleize = (id?: string) =>
  (id || "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
