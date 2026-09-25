import { weebTitles } from "./data/weebTitles.ts";

/**
 * Mine-vs-crowd, by genre — the corpus's fourth finding, split out of
 * WeebRoom because it is heavier than a paragraph and nobody scrolling past
 * the first three findings needs it paid for up front. Mounted lazily on
 * /weeb (see routes/weeb.tsx), same pattern as ResourceDirectory.
 *
 * Every point is one title with BOTH a crowd score and a score of his,
 * plotted crowd (AniList, 0-100) against his own (1-5, ×20 to share the
 * axis). Genre is a fill colour and a legend row, nothing else — this is
 * Weeb, which gets no manufactured edge to any project (REC-5), so the only
 * links here are to AniList itself.
 */

const PALETTE = [
  "#f0a35f", "#7bc4ff", "#a97bff", "#6fd6a0", "#ff8fa3", "#ffd166", "#5fd0d0", "#c9c9c9",
];

/** Each title counts once, under its first listed genre — a scatter reads as
 *  noise the moment one point tries to be five colours at once. */
function primaryGenre(genres: readonly string[]): string {
  return genres[0] ?? "Unlabelled";
}

const genreOrder = [...new Set(weebTitles.map((t) => primaryGenre(t.genres)))]
  .sort((a, b) => weebTitles.filter((t) => primaryGenre(t.genres) === b).length -
    weebTitles.filter((t) => primaryGenre(t.genres) === a).length)
  .slice(0, PALETTE.length);

const colorOf = (genre: string) => {
  const i = genreOrder.indexOf(genre);
  return i === -1 ? "#71717a" : PALETTE[i];
};

export function WeebGenres() {
  const points = weebTitles.map((t) => ({
    ...t,
    genre: primaryGenre(t.genres),
    x: t.crowd,
    y: t.mine * 20,
  }));

  return (
    <section id="weeb-genres" className="mt-16 border-t border-line pt-10">
      <p className="kicker-accent">Finding 04</p>
      <h2 className="font-display mt-2 text-h2 font-bold tracking-tight">
        Mine vs. the crowd, by genre
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
        {points.length} titles carry both a score of mine and AniList&rsquo;s crowd average. Each
        point is one title, coloured by its primary genre — the axes share one scale (0&ndash;100)
        so a point above the diagonal is one he rated above the crowd.
      </p>

      <svg
        role="img"
        aria-label={`Scatter of ${points.length} anime titles, his score against AniList's crowd average, coloured by genre`}
        viewBox="0 0 400 260"
        className="mt-6 h-auto w-full max-w-xl"
      >
        <line x1="20" y1="20" x2="20" y2="230" stroke="currentColor" className="text-line" strokeWidth="1" />
        <line x1="20" y1="230" x2="390" y2="230" stroke="currentColor" className="text-line" strokeWidth="1" />
        {/* the diagonal: crowd == mine */}
        <line x1="20" y1="230" x2="390" y2="20" stroke="currentColor" className="text-line" strokeWidth="1" strokeDasharray="3 3" />
        {points.map((p) => (
          <circle
            key={p.name}
            data-genre={p.genre}
            cx={20 + (p.x / 100) * 370}
            cy={230 - (p.y / 100) * 210}
            r="3.5"
            fill={colorOf(p.genre)}
            opacity="0.85"
          >
            <title>
              {p.name} ({p.year ?? "n/a"}) — {p.genre}: his {p.mine}/5, crowd {p.crowd}
            </title>
          </circle>
        ))}
      </svg>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {genreOrder.map((g) => (
          <li key={g} className="flex items-center gap-1.5 font-mono text-xs text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorOf(g) }} />
            {g}
          </li>
        ))}
      </ul>
    </section>
  );
}
