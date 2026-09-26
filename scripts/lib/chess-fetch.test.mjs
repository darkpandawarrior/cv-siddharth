import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// scripts/lib/chess-fetch.mjs resolves its cache directory relative to its
// OWN file location (`../../.chess-cache`), not to an env var, so this test
// exercises it against the repo's real .chess-cache/ rather than a sandbox —
// same posture as scripts/lib/store-cache.test.mjs, which reads real cache
// state. Every case below cleans up the exact cache files it writes.
import { monthKey, monthsBetween, fetchLichessMonthly, fetchChessComMonthly, readCache, writeCache } from "./chess-fetch.mjs";

const root = join(new URL("../../", import.meta.url).pathname);
const lichessCacheDir = join(root, ".chess-cache", "lichess");
const chesscomCacheDir = join(root, ".chess-cache", "chesscom");

function cleanupCache(dir, keys) {
  for (const key of keys) {
    const f = join(dir, key.endsWith(".ndjson") || key.endsWith(".json") ? key : `${key}`);
    if (existsSync(f)) rmSync(f);
  }
}

describe("monthKey / monthsBetween", () => {
  it("formats a zero-padded YYYY-MM", () => {
    expect(monthKey(2026, 0)).toBe("2026-01");
    expect(monthKey(2026, 8)).toBe("2026-09");
  });

  it("lists every month inclusive, across a year boundary", () => {
    const months = monthsBetween(Date.UTC(2025, 11, 15), Date.UTC(2026, 1, 3));
    expect(months.map((m) => m.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("returns exactly one month when from and to are the same month", () => {
    const months = monthsBetween(Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 24));
    expect(months.map((m) => m.key)).toEqual(["2026-09"]);
  });
});

describe("fetchLichessMonthly: resilience — one closed month keeps its cache, not the whole corpus", () => {
  const NOW = new Date(Date.UTC(2026, 8, 24)); // 2026-09-24, matches "today" for this lane
  const SINCE = Date.UTC(2026, 6, 1); // 2026-07 .. 2026-09, three months

  // Same ambient-cache hazard as the chess.com block below: clear the exact
  // fixture months before every test rather than assume the repo's real
  // .chess-cache/lichess/ has nothing cached for them.
  beforeEach(() => {
    mkdirSync(lichessCacheDir, { recursive: true });
    cleanupCache(lichessCacheDir, ["2026-07.ndjson", "2026-08.ndjson", "2026-09.ndjson"]);
  });
  afterEach(() => {
    cleanupCache(lichessCacheDir, ["2026-07.ndjson", "2026-08.ndjson", "2026-09.ndjson"]);
  });

  it("keeps a cached closed month's games when its refetch 500s, and does not mark it unresolved", async () => {
    // 2026-07 is closed and already cached; 2026-08 is closed with no cache;
    // 2026-09 is the current month (always refetched regardless of cache).
    writeFileSync(join(lichessCacheDir, "2026-07.ndjson"), `${JSON.stringify({ id: "cached-jul" })}\n`);

    const fetchMonth = async (_user, y, m) => {
      const key = monthKey(y, m);
      if (key === "2026-08") throw new Error("500 lichess 2026-08"); // the transient failure
      return `${JSON.stringify({ id: `live-${key}` })}\n`;
    };

    const { games, unresolved } = await fetchLichessMonthly("darkpandawarrior", { now: NOW, sinceMs: SINCE, fetchMonth });

    // 2026-07 never called fetchMonth (closed + cached); its cached game is
    // still in the corpus. 2026-08's 500 left it with NO cache, so the run
    // completes without it rather than throwing, and it is the one reported.
    const ids = games.map((g) => g.id).sort();
    expect(ids).toEqual(["cached-jul", "live-2026-09"]);
    expect(unresolved).toEqual([{ month: "2026-08", error: "500 lichess 2026-08" }]);
    // The corpus is not discarded: two of three months resolved, and both are present.
    expect(games.length).toBe(2);
  });

  it("falls back to a stale cache for the CURRENT month when its refetch fails, and reports nothing unresolved", async () => {
    writeFileSync(join(lichessCacheDir, "2026-09.ndjson"), `${JSON.stringify({ id: "stale-sep" })}\n`);
    const fetchMonth = async (_user, y, m) => {
      throw new Error(`500 lichess ${monthKey(y, m)}`);
    };
    const { games, unresolved } = await fetchLichessMonthly("darkpandawarrior", {
      now: new Date(Date.UTC(2026, 8, 24)),
      sinceMs: Date.UTC(2026, 8, 1),
      fetchMonth,
    });
    expect(games.map((g) => g.id)).toEqual(["stale-sep"]);
    expect(unresolved).toEqual([]);
  });

  it("never refetches a closed month that is already cached", async () => {
    writeFileSync(join(lichessCacheDir, "2026-07.ndjson"), `${JSON.stringify({ id: "jul" })}\n`);
    let calls = 0;
    const fetchMonth = async (_u, y, m) => {
      calls++;
      return `${JSON.stringify({ id: monthKey(y, m) })}\n`;
    };
    await fetchLichessMonthly("darkpandawarrior", { now: NOW, sinceMs: Date.UTC(2026, 6, 1), fetchMonth });
    // Only 2026-08 (closed, uncached) and 2026-09 (current, always refetched)
    // should have called the fetcher — not 2026-07.
    expect(calls).toBe(2);
  });
});

describe("fetchChessComMonthly: one archive's 500 keeps the rest of the corpus", () => {
  // The repo's real .chess-cache/chesscom/ carries genuine per-month archives
  // from actual generator runs, including for months this suite happens to
  // use as fixtures — a real cached 2026-09.json is exactly what let an
  // earlier version of this test silently read live chess.com games instead
  // of exercising its own failure path. Both directions matter: clear
  // ambient state before writing the fixture, and never leave the fixture (or
  // a hole where a real cache used to be) behind after.
  let realBackup = null;
  beforeEach(() => {
    mkdirSync(chesscomCacheDir, { recursive: true });
    const f = join(chesscomCacheDir, "2026-09.json");
    realBackup = existsSync(f) ? readFileSync(f, "utf8") : null;
    cleanupCache(chesscomCacheDir, ["2026-08.json", "2026-09.json"]);
  });
  afterEach(() => {
    cleanupCache(chesscomCacheDir, ["2026-08.json", "2026-09.json"]);
    if (realBackup !== null) writeFileSync(join(chesscomCacheDir, "2026-09.json"), realBackup);
  });

  it("uses the cached archive when a closed month's refetch fails, and reports only the truly gapped month", async () => {
    writeFileSync(join(chesscomCacheDir, "2026-08.json"), JSON.stringify({ games: [{ id: "cached-aug" }] }));
    const fetchArchiveList = async () => ({
      archives: [
        "https://api.chess.com/pub/player/x/games/2026/08",
        "https://api.chess.com/pub/player/x/games/2026/09",
      ],
    });
    const fetchArchive = async (url) => {
      if (url.endsWith("/09")) throw new Error("500 chess.com 2026-09"); // no cache for this one
      throw new Error("unexpected call for a cached closed month");
    };
    const { games, unresolved } = await fetchChessComMonthly("darkpandawarrior", {
      now: new Date(Date.UTC(2026, 6, 1)), // neither archive is "current", both are closed
      fetchArchiveList,
      fetchArchive,
    });
    expect(games.map((g) => g.id)).toEqual(["cached-aug"]);
    expect(unresolved).toEqual([{ month: "2026-09", error: "500 chess.com 2026-09" }]);
  });
});

describe("readCache / writeCache: the whole-corpus cache gen-chess-deep.mjs still reads", () => {
  it("round-trips through .chess-cache/<name>.json", () => {
    writeCache("__chess-fetch-test", { hello: "world" });
    expect(readCache("__chess-fetch-test")).toEqual({ hello: "world" });
    rmSync(join(root, ".chess-cache", "__chess-fetch-test.json"));
  });

  it("returns null for a cache file that was never written", () => {
    expect(readCache("__never-written-chess-fetch-test")).toBeNull();
  });
});
