import { useEffect, useState } from "react";

/**
 * The `/chess` room's data loader.
 *
 * `public/chess/corpus.json` is 254 KB of generated data — the full rating
 * series, the 64-square terminal-position matrix, the opening tree and the quiz
 * positions. It is never imported statically: a static import would bundle it
 * into whatever chunk touched it, and only this one room needs it. So it is
 * fetched at runtime, by this hook, from the room that renders it.
 *
 * Unlike `useLiveSignal` this fetches once and stops. The corpus is committed
 * build output, not a live feed — polling it every 20s would re-download a
 * quarter-megabyte to learn nothing.
 */

/** One platform+format rating series (e.g. lichess blitz). `t` is a ms epoch. */
export interface ArcSeries {
  platform: string;
  format: string;
  points: { t: number; r: number }[];
}

/** An opening as played, aggregated across the whole corpus. */
export interface Opening {
  name: string;
  side: "white" | "black";
  /** games played */
  n: number;
  /** games won */
  w: number;
  winRate: number;
}

/** One year+platform slice of the black repertoire. `share` is null when the
 *  sample is too thin to quote a percentage. */
export interface RepertoireSlice {
  blackGames: number;
  thin: boolean;
  openings: { name: string; count: number; share: number | null }[];
}

/** A guess-the-move position: the FEN, and how the real game went. */
export interface ChessPosition {
  fen: string;
  result: "win" | "loss";
  speed: string;
  /** ISO date the game was played. */
  at: string;
  myRating: number;
}

/** The shape of `public/chess/corpus.json`, as written by
 *  `scripts/gen-chess-stats.mjs`. Keys mirror the real file exactly. */
export interface Corpus {
  generatedAt: string;
  arc: ArcSeries[];
  /** Terminal-square counts, index 0–63 = a1–h8. */
  graveyard: { losses: number[]; wins: number[] };
  hours: {
    chess: { hour: number; n: number; winRate: number }[];
    commits: { hour: number; n: number }[];
    commitSample: { n: number; total: number; from: string };
  };
  /** Keyed by year, then by platform ("lichess" | "chesscom") — a year only
   *  carries the platforms actually played that year. */
  repertoireByPlatform: Record<string, Partial<Record<"lichess" | "chesscom", RepertoireSlice>>>;
  openings: Opening[];
  positions: ChessPosition[];
}

const CORPUS_URL = "/chess/corpus.json";

/**
 * Fetches and parses the corpus, or throws. Extracted from the hook so it is
 * testable with a plain function call — same reasoning as `fetchLiveSignal`.
 */
export async function fetchCorpus(fetchImpl: typeof fetch = fetch): Promise<Corpus> {
  const res = await fetchImpl(CORPUS_URL);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as Corpus;
}

/** Fetches the corpus once on mount. `error` is the honest third state — the
 *  room must say the data didn't load rather than render an empty board. */
export function useCorpus(): { corpus: Corpus | null; error: boolean } {
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetchCorpus()
      .then((c) => {
        if (live) setCorpus(c);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return { corpus, error };
}
