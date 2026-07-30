import type { Corpus, RepertoireSlice } from "../lib/useCorpus.ts";

/**
 * Pure shaping for the repertoire scene. No three.js, no React — the room
 * imports it for the written table and the scene imports it for the geometry,
 * so both draw the same numbers from one derivation instead of two.
 *
 * The corpus keys the black repertoire by **year, then platform**, and a year
 * only carries the platforms actually played. That nesting is the honest one:
 * the Scandinavian's abandonment (lichess) and its return (chess.com) are two
 * within-platform observations either side of the January 2023 handoff, and
 * nothing here may flatten them into a single series.
 */

export type PlatformKey = "lichess" | "chesscom";

export const PLATFORMS: readonly PlatformKey[] = ["lichess", "chesscom"];

export interface RepSlice extends RepertoireSlice {
  key: PlatformKey;
}

export interface RepYear {
  year: string;
  /** Only the platforms actually played that year, in a stable order. */
  platforms: RepSlice[];
}

/** Flattens `repertoireByPlatform` into a year-ordered list. */
export function repertoireYears(byPlatform: Corpus["repertoireByPlatform"]): RepYear[] {
  return Object.keys(byPlatform)
    .sort()
    .map((year) => ({
      year,
      platforms: PLATFORMS.flatMap((key) => {
        const slice = byPlatform[year][key];
        return slice ? [{ key, ...slice }] : [];
      }),
    }));
}

/** One opening's share in one platform-year. `share` is null when the slice is
 *  too thin to quote a percentage — that stays null all the way to the screen. */
export interface SharePoint {
  year: string;
  key: PlatformKey;
  count: number;
  share: number | null;
  thin: boolean;
  blackGames: number;
}

/** The full within-platform history of one opening, ordered by year. */
export function shareSeries(years: RepYear[], name: string): SharePoint[] {
  return years.flatMap((y) =>
    y.platforms.map((p) => {
      const found = p.openings.find((o) => o.name === name);
      return {
        year: y.year,
        key: p.key,
        count: found?.count ?? 0,
        share: p.thin ? null : (found?.share ?? 0),
        thin: p.thin,
        blackGames: p.blackGames,
      };
    }),
  );
}

/**
 * The lines whose share moved the most, summed **within each platform** and
 * then added — never across the handoff, which would manufacture a swing out
 * of the platform change itself.
 *
 * A line missing from a platform-year is a genuine zero, not missing data: the
 * generator tracks the union of every platform-year's top five, so absence
 * means no games. Thin platform-years are dropped rather than quoted.
 */
export function focusLines(years: RepYear[], count = 2): string[] {
  const swing = new Map<string, number>();
  for (const key of PLATFORMS) {
    const slices = years.flatMap((y) => y.platforms.filter((p) => p.key === key && !p.thin));
    if (slices.length < 2) continue;
    const names = new Set(slices.flatMap((s) => s.openings.map((o) => o.name)));
    for (const name of names) {
      const shares = slices.map((s) => s.openings.find((o) => o.name === name)?.share ?? 0);
      swing.set(name, (swing.get(name) ?? 0) + (Math.max(...shares) - Math.min(...shares)));
    }
  }
  return [...swing.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([name]) => name);
}

/** `0.4107` → `41.1%`; a thin slice has no percentage to render. */
export function pct(share: number | null): string {
  return share === null ? "thin" : `${(share * 100).toFixed(1)}%`;
}
