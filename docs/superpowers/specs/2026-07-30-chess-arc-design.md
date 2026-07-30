# The Chess Arc — lichess + chess.com integration — design spec

Date: 2026-07-30
Status: awaiting owner review

## Context

Chess joins writing as a first-class personal-interest section. The owner has played
since age 7–8, holds accounts on both lichess (`darkpandawarrior`) and chess.com
(`darkpandawarrior`), and wanted maximum depth: real data integration, derived
inferences, interactive play, and 3D — explicitly *not* a stats badge.

Owner decisions locked this session:
- **Thesis leads.** The section opens on the clock finding (below), not on ratings.
- **One pass.** Everything lands together on one branch, reviewed as a whole.
- **Calibrated past-self bots** for the engine, not a generic one.
- **Writing cross-link** is in scope.

## Evidence base

Every number below was fetched from the live APIs on 2026-07-30 and is reproducible
by the generator. The full corpus (18,731 games) was downloaded and analysed
offline before any design decision was made. This matters: the section's entire
point of view is derived from the data, so the data had to come first.

**Corpus:** 18,731 games, 2019-02-09 → 2026-07-30.
lichess 14,119 · chess.com 4,612.

> **Every figure in this section is a 2026-07-30 snapshot, not a constant.** The owner
> is still playing — the corpus was 18,734 within an hour of first generation. The
> generated `src/data/chess.ts` is the authoritative value at any moment, and **no UI
> may hardcode any of these numbers**. They appear here to fix the design's shape and
> to let a reviewer sanity-check the derivations, nothing more.

**Activity by year — the shape that matters:**

| year | lichess | chess.com |
|---|---|---|
| 2019 | 2,480 | — |
| 2020 | 3,262 | — |
| 2021 | 4,672 | 19 |
| 2022 | 3,365 | — |
| 2023 | 337 | 2,017 |
| 2024 | — | 1,043 |
| 2025 | 3 | 590 |
| 2026 | — | 943 |

This is a **handoff in January 2023**, not two parallel streams. Months in which
both platforms saw ≥10 games: **five** (2021-01, then 2023-01 through 2023-04).
The chess.com account opened 2021-01-22 but saw only 19 games across January and
February 2021 — a false start — before being abandoned until January 2023.
lichess's rating history carries points as late as 2025-01-16 only because of
**three games** played that month.

**Longest silence in the whole 7.5-year corpus: 13 days** (2026-05-20 → 2026-06-02).

### The clock finding (the thesis)

- **50.3% of all losses ended on time.** 33.5% of wins came on the opponent's clock.
  ~42% of decided games were settled by a clock, not a board.
- Clock traces from **3,072 blitz games** with per-move `[%clk]` annotations, mean
  clock remaining as a fraction of starting time, bucketed by game progress:

  | progress | wins | losses | gap |
  |---|---|---|---|
  | 0–10% | 99.0% | 98.7% | +0.3 |
  | 10–20% | 95.0% | 93.3% | +1.7 |
  | 20–30% | 89.0% | 85.7% | +3.3 |
  | 30–40% | 81.9% | 76.8% | +5.1 |
  | 40–50% | 74.3% | 67.7% | +6.6 |
  | 50–60% | 66.9% | 59.2% | +7.7 |
  | 60–70% | 58.6% | 50.2% | +8.4 |
  | 70–80% | 50.6% | 42.1% | +8.5 |
  | 80–90% | 43.8% | 35.6% | +8.1 |
  | 90–100% | 36.9% | 28.7% | +8.2 |

  The divergence opens at 20–30% of the game and saturates by 70–80%. Losses are
  decided in the early middlegame by time spent, not by a late blunder.

### Supporting findings

- **2,262 distinct days played across a 2,729-day span (82.9%)**, longest
  consecutive-day streak **298 days**. The span is endpoint-inclusive, which is the
  correct denominator for "what fraction of days in the window did he play"; an
  earlier revision of this line said 2,728 from an exclusive count. The percentage is
  82.9% either way, and the UI must render the generated value rather than a literal.
- **Repertoire arc as Black — real, but confounded and must be stated carefully.**
  Measured as share-of-games-as-Black *within each platform separately*, which is the
  only way to separate a repertoire change from a platform change:

  | year | lichess Scandinavian % | chess.com Scandinavian % |
  |---|---|---|
  | 2019 | **41.1%** of 1,215 | — |
  | 2020 | 16.0% of 1,629 | — |
  | 2021 | 0.2% of 2,332 | (n=9, thin) |
  | 2022 | 0.2% of 1,676 | — |
  | 2023 | (n=168, thin) | **27.5%** of 1,007 |
  | 2024 | — | 26.6% of 518 |
  | 2025 | — | 22.7% of 295 |
  | 2026 | — | **39.2%** of 474 |

  The **abandonment is clean and within-platform**: 41.1% → 0.2% on lichess, replaced
  by the Modern Defense (59% of Black games in 2021). The **re-adoption is also
  within-platform**: 27.5% → 39.2% and rising on chess.com. But the two halves sit on
  opposite sides of the 2023 handoff, so "he returned to his first opening" cannot be
  cleanly separated from "he started fresh on a new site." Copy must present these as
  two within-platform observations, not one continuous line. ECO coverage is **100% in
  every chess.com year**, so this is not a missing-data artifact — that was checked.

- **Opening names require canonicalisation before any cross-platform merge.** The same
  opening is spelled `Scandinavian Defense: Mieses-Kotroc Variation` on lichess (473
  games) and `Scandinavian Defense Mieses Kotrc Variation` via chess.com's ECO URL
  (426 games). Merging raw strings would split one repertoire line in two and render a
  false discontinuity at exactly the handoff the arc is about.
- **Tilt:** next-game win rate 50.3% after a win vs **47.0% after a loss** (n=8,285,
  same platform, <30 min gap).
- **Session decay:** game 1 of a sitting 48.5% → game 9 **34.8%**, game 11 32.3%.
  Small n in the tail (69 and 31); must be rendered with its n.
- **Biggest upset:** beat 1867 while rated 1078 (+789), 2019-03-07, lichess rapid.
- **Longest loss streak 14 > longest win streak 12.**
- **Colour is neutral:** White 49.0% / Black 48.4% win rate over ~9,365 games each.
- **763 hours** of lichess play time (`playTime.total`).
- Peaks: lichess blitz **1686**, lichess puzzles **1847** (3,515 solved),
  chess.com blitz 1425, chess.com rapid 1307.
- Highest-accuracy game on record (95.31%) **was a loss**.

### Derived from chess.com PGNs — filling the gaps the API doesn't publish

chess.com exposes no `playTime`, no move counts and no length statistics, but it ships
per-move clocks and full PGN headers, so all of it is computable. Verified 2026-07-30
over all 4,612 games.

**Time at the board.** Live-game wall clock from the PGN's `UTCDate`/`StartTime` →
`EndDate`/`EndTime` headers: **272.9 hours** across **4,312 live games, 0 skipped** for
missing or implausible headers. Blitz 229.4 h · bullet 28.7 h · rapid 14.8 h. Mean game
3.8 minutes. The 300 daily/correspondence games are **excluded** — they span real days,
not board time.

With lichess's 763.4 h, **combined verifiable board time is ~1,036 hours** (~43 days).
This removes the "lichess-only" caveat on the hours figure. It must still be labelled as
two measurements combined — lichess reports its own `playTime.total`, chess.com's half is
derived from PGN wall clock — not as one uniformly-measured metric.

**Win rate collapses with game length** — the thesis, confirmed independently of the
clock traces (live games, n=4,150 decided):

| moves | n | win rate | flag share of that bucket's losses |
|---|---|---|---|
| <20 | 640 | **58.8%** | 14.8% |
| 20–30 | 1,240 | 56.8% | 34.5% |
| 30–40 | 1,146 | 48.4% | 37.7% |
| 40–50 | 550 | 45.8% | 33.2% |
| 50–60 | 347 | 37.5% | 36.9% |
| 60+ | 227 | **27.3%** | 29.7% |

Monotonic, 31.5 points end to end. Short games are decided on the board; past move 20 the
flag share of losses more than doubles and stays there. Two independent measures — clock
traces and game length — agree, which is what makes the thesis worth leading with.

**Supporting derivations:**
- **Game length:** median **31** moves (mean 33.7, max 90). Wins median **29**, losses
  median **33** — he loses the longer games.
- **Material at termination** (both sides summed; a full board is 78 points): wins end
  with a median **39** points on the board, losses with **33**. He wins earlier and loses
  deeper into the endgame.
- **Checkmate:** delivered **662**, received **978**.
- **First move as White** — completes a repertoire picture that was Black-only:
  **1.d4 ×1,565**, 1.g3 ×277, 1.Nf3 ×136, 1.d3 ×112, **1.e4 only ×75**, 1.b3 ×50. A d4
  and system player who almost never enters mainline 1.e4 theory — which pairs with the
  Scandinavian as Black into one coherent stance: avoid the most-theorised lines on both
  sides of the board.
- **Clutch rate:** of 507 blitz games finished under 10% of the starting clock, he won
  **30.6%** — against a ~48% baseline.

**Scope caveat:** game length, material, first move and clutch rate are **chess.com-only**
(4,612 games), because the lichess export is fetched without moves or FENs. Every surface
using them must say so rather than implying the full 18.7k corpus.

### Data availability confirmed

- **4,612/4,612** chess.com games carry a final `fen` → terminal-position heatmap is
  data-backed.
- **4,600/4,612** carry per-move `[%clk]` → clock curves are data-backed.
- **GitHub commit search reports 1,557 matching commits back to 2019-07-04** with authored
  dates — but the API returns at most **1,000** of them, and rate-limits unauthenticated
  callers to 10 requests/minute. The overlay therefore rests on a capped 1,000-commit
  sample and must label itself as such. (Discovered during implementation: a 20-page
  loop 403s on page 11, and because that fetch preceded both writes it silently
  produced no output at all.) The overlay still spans the same 2019→2026 window as the
  chess corpus; it just does so on a sample rather than the full set.
- lichess `rating-history` returns full daily series per variant in **one request**.
- lichess `/api/puzzle/daily` is public: FEN, solution line, rating, themes.

## Architecture

### Why build-time, not an edge endpoint

The Live Signal pattern (`api/spotify.ts`) does not apply here, for two reasons:

1. **chess.com hard-403s any request without a descriptive User-Agent** (verified),
   and its Cloudflare layer is widely reported to block datacenter/serverless egress
   IPs regardless of headers. A Vercel Edge function in `bom1` is exactly the shape
   that gets blocked.
2. **The data is not live.** lichess activity ended 2025-01-16 — that half is a
   frozen archive that never needs refetching. chess.com's own endpoints "refresh at
   most once every 12 hours" by their documentation, so sub-daily polling buys
   nothing.

So this follows the `gen-project-stats.mjs` contract instead: a generator that runs
in CI, writes committed output, and on fetch failure **fails loudly but leaves the
last good file intact** (per commit `43bd80b`, which fixed exactly the opposite
behaviour). The section renders offline, forever, with no runtime API dependency.

### `scripts/gen-chess-stats.mjs`

Joins the existing daily `refresh-media.yml` run (06:17 UTC) and `npm run refresh`.

Sources, in order:
1. `GET lichess.org/api/user/darkpandawarrior` — counts, perfs, playTime.
2. `GET lichess.org/api/user/darkpandawarrior/rating-history` — full daily series.
3. `GET lichess.org/api/user/darkpandawarrior/perf/{blitz,bullet,rapid}` — peaks with
   dates and game IDs, best wins by opponent rating.
4. `GET api.chess.com/pub/player/darkpandawarrior/stats` — current/best per format.
5. `GET api.chess.com/pub/player/darkpandawarrior/games/archives` → walk all 45
   monthly archives serially (measured: **39s**, well inside a job that already
   apt-installs ffmpeg). Serial is required — chess.com documents unlimited serial
   rate but 429s on parallel.
6. `GET api.github.com/search/commits?q=author:darkpandawarrior` — paginated at 100,
   ~16 requests, authenticated with the `GITHUB_TOKEN` the workflow already has.
7. `GET lichess.org/api/puzzle/daily`.

All requests send a descriptive `User-Agent` with contact email — mandatory for
chess.com, courteous for lichess.

The **lichess game corpus is fetched once and cached**, not re-fetched daily: the
full NDJSON export of 14,119 games took **565s**, and the account has been inactive
since Jan 2025 so the result is immutable. Cache lands in a gitignored
`.chess-cache/` directory; CI restores it via `actions/cache` keyed on the lichess
`seenAt` value, and refetches only on a miss.
*(ponytail: no incremental sync, no ETag bookkeeping — the archive is frozen, so
"fetch once, cache forever" is the whole strategy.)*

PGN move parsing uses `chess.js`, not regex. A regex attempt during research
double-counted clock decimals as move numbers and produced a wrong game-length
figure; that class of bug is exactly what the library exists to prevent.

### Output split — two artefacts, deliberately

The full merged rating series is ~6,300 points and the derived per-game aggregates
are larger still. Shipping that in the home-page bundle would be a real regression
against the Lighthouse CI budget. So:

- **`src/data/chess.ts`** (committed, imported, small) — headline figures, the
  thesis numbers, the clock-decile table, repertoire-by-year, peaks, streaks,
  records, the daily puzzle, and a **weekly-downsampled arc (~400 points)** for the
  home section.
- **`public/chess/corpus.json`** (committed, fetched on demand) — full rating series
  per platform/variant, the 64-square terminal-position matrix, the opening tree,
  the hour-of-day histograms, and the position set for guess-the-move. Loaded only
  by the `/chess` room, never by the home page.

The raw 18,731-game corpus is **never committed** — only derived aggregates. Public
chess statistics on a public portfolio are the intended publication; the raw game
dump is bulk that belongs in the gitignored cache.

## Surfaces

### 1. Home section — `src/ChessSection.tsx`

Slots after `WritingSection` in the `HomePage` scroll, `id="chess"`. Mirrors
`WritingSection`'s construction exactly: `Reveal`, `TiltCard`, `card-elevated`,
`section-eyebrow`, and the same `section-y mx-auto max-w-5xl px-6` frame.

Opens on the thesis: the 42% clock figure and the divergence curve, stated as a
self-diagnosis. Then scale (18,731 games / 763 hours / 82.9% of days), the
`ChessArcScene` ribbon, the three-act repertoire arc, and deep links to both
profiles. Registered in `navigation.ts` and the command palette like every other
section.

### 2. `/chess` room — `src/routes/chess.tsx` + `src/ChessRoom.tsx`

Registered in **`siteRooms` in `profile.ts`**, which is the load-bearing move: that
one array already feeds `roomHead()` SEO, the Playground hub cards, and the AI
assistant's system prompt. Adding the room there gets all three for free and avoids
a fourth hand-maintained copy of the blurb — the drift failure `routeHead.ts`'s own
comments were written to prevent.

`ssr: false`, matching every other room route.

The room hosts the board, the three 3D scenes, guess-the-move, and the daily puzzle.

### 3. Lab bench — instruments 10 and 11

- **`src/labs/ChessSearchLab.tsx`** — the engine's search tree, rendered through
  `SearchTreeLab`'s existing renderer and `useCanvasLoop`, so chess alpha-beta and
  Kursi's ISMCTS read as one family of instrument rather than two unrelated toys.
- **`src/labs/ClockLab.tsx`** — scrub a real game and watch both clocks burn, with
  the win/loss divergence curve behind the trace.

### 4. Hand-maintained counts that must all move together

Adding one room and two instruments invalidates five separate hardcoded counts. This
is precisely the drift hazard `routeHead.ts`'s own comments were written about, so
they are enumerated here rather than discovered one stale string at a time:

| file | current copy | becomes |
|---|---|---|
| `src/App.tsx` (`PlaygroundTeaser`) | "Six interactive rooms" | Seven |
| `src/lib/routeHead.ts:44` | "Six interactive rooms … and **nine** running experiments" | Seven … eleven |
| `src/data/profile.ts:1351` (`siteRooms` `/lab` blurb) | "Nine experiments that prove the numbers" | Eleven |
| `src/LabBench.tsx:86` | "Nine instruments spanning…" | Eleven |
| `src/routes/lab.tsx:14` | tagline "nine instruments, running live" | eleven |

**Coordination note:** `src/data/profile.ts` has substantial uncommitted edits in the
working tree from separate in-flight work (a claims rewrite: commit-share ownership
figures, Play Store numbers, location-engine wording). The `siteRooms` additions here
touch that same file, so they must be applied on top of whatever lands from that work
— not from the version captured at spec time. Per the standing rule about concurrent
sessions sharing this worktree, this feature does not stage or commit any part of
that pending diff.

## The 3D scenes

Three scenes, each following the established `*Scene.tsx` wrapper +
`React.lazy` pattern (`Phone3DScene`, `FoundationGraphScene`, `SkillsOrbitScene`).
No new dependencies — `three`, `@react-three/fiber`, `drei` and `postprocessing`
are all already installed.

### `ChessArcScene` — twin ribbons

The rating arc as two ribbons on **separate Z-planes**: time on X, rating on Y,
platform on Z. This is the honest answer to a real problem: the lichess blitz peak
(1686) is ~260 points above the chess.com blitz peak (1425), because lichess's
rating pool sits higher for identical strength. Plotted on one shared Y-axis it
would read as a decline starting in 2021, and applying an invented offset to make
the line continuous would be fabricating a number.

Two ribbons never share an axis, so nothing is implied that the data doesn't
support. The visual's job is the **January 2023 handoff**: one ribbon ends, another
begins on a different Z-plane at a different scale, and the baton-pass is legible
without the geometry suggesting the numbers are continuous. Camera dollies along the
time axis. The five genuine both-active months (2021-01, 2023-01…04) are a detail, not
the story — do not build the composition around an overlap that is essentially a
seam.

### `GraveyardScene` — where the games die

64 extruded columns, one per square, heights from the aggregated terminal positions
of all 4,612 chess.com games. Toggle between wins and losses. Data-backed by the
confirmed 100% FEN coverage.

### `RepertoireTreeScene` — the three-act arc

The opening tree, borrowing `FoundationGraphScene`'s constellation vocabulary.
Branch thickness = frequency, colour = win rate, and a year scrubber that animates
Scandinavian → Modern → Scandinavian so the narrative plays rather than being
asserted in prose.

## The engine

`react-chessboard` **5.10.0** (MIT, peer-deps `react ^19` — exact match for the
installed 19.2.8) and `chess.js` **1.4.0** (BSD-2, zero dependencies). Both
permissive. lichess's own `chessground` and `lichess-pgn-viewer` are **GPL-3.0** and
would pull the whole site under copyleft — explicitly rejected for that reason.

Alpha-beta with iterative deepening, **in a Web Worker**. Non-negotiable: the repo
runs axe scans across its routes and Lighthouse CI with a budget, and a search on
the main thread would fail both. Worker also keeps the search-tree lab's
visualisation honest — it renders the real search, not a simulation of one.

**Two calibrated presets**, from the owner's actual ratings:
- **2019 Sid (1078)** — the rating he held during the +789 upset.
- **2026 Sid (1425)** — his chess.com blitz peak.

Calibration is search depth plus a move-selection noise term, tuned so each preset's
measured strength lands near its target. Both presets also model **his actual clock
behaviour**: fast through the opening, slow through moves ~10–25, then hurried —
the shape the 3,072-game clock analysis found. Losing to a bot that plays like him,
including the flaw, is the most honest thing the section can do.

`prefers-reduced-motion` is respected throughout, per the fix in commit `6a05604`
that caught the Blueprint 3D scene ignoring it.

## Cross-integration — `ChessVsCommits`

Hour-of-day histograms overlaid: the full game corpus against a capped 1,000-commit sample, same person,
same 2019→2026 window, two datasets already on this site and never before crossed.

The chess side is clean (peak play 19:00 IST at 1,341 games; a real late-night tail
of 957 games at midnight, 742 at 01:00, 492 at 02:00; win rate bottoming at 37.5% at
04:00).

**Caveat that must ship with the chart:** commit timestamps carry inconsistent
timezone offsets — 2019 commits show `+03:00`, which is not Pune. Commit hours are
normalised to IST and the chart says so. An hour-of-day claim built on unverified
offsets would be the kind of quietly-wrong number the claim-audit rule exists to
catch.

## Writing cross-link

The Loopdown personifies bugs as a recurring cast. The chess flaws get the same
treatment, each named from a measured number rather than invented for flavour:

- **The Flagfall** — 50.3% of losses, on time.
- **The Ninth Game** — 34.8% win rate at game 9 of a sitting.
- **The Returner** — the Scandinavian abandoned in 2020 and taken back up in 2023.

Added to `writing.ts` as a queued series entry, cross-linked from `ChessSection` and
back. `writingMeta.ts` gets an accent for the series.

## Claim-audit obligations

The owner's stated history was "lichess 2018–2020, then chess.com since." An earlier
revision of this spec claimed the APIs disproved that and that the accounts "ran in
parallel for four years." **That claim was wrong and is retracted here.** It rested on
rating-history points and account-creation dates rather than on game counts; the late
lichess points come from three games in January 2025, and the 2021 chess.com account
saw 19 games before being abandoned for two years.

The owner's account was right about the **shape** — it is a sequential handoff. Only
the dates need correcting:

| stated | actual |
|---|---|
| lichess from 2018 | lichess from **2019-02-06** (first game 2019-02-09) |
| handoff in 2020 | handoff in **January 2023** |
| chess.com since | correct, from **2023** — with a 19-game false start in Jan–Feb 2021 |

Consequences:
- Surfaces may describe this as a handoff, because it is one. They must not date it
  to 2020, and must not claim parallel streams.
- The retraction is itself a lesson worth encoding: rating-history density is not
  activity. Only game counts establish when someone was actually playing.
- These claims go into `claims.json` so the mechanical audit covers them, per the
  standing rule that claims about the owner's own record get checked, never recalled.
- Because every figure is generated from the APIs rather than typed by hand, the
  generator *is* the audit for this section. Hand-editing `chess.ts` would break
  that property and must not happen.

Two figures need explicit framing on the page:
- **Accuracy covers 351 of 4,612 chess.com games (7.6%)** — only games where
  analysis was run. Labelled as a subset, never as "my accuracy."
- **Session-decay tail has small n** (69 games at position 9, 31 at position 11).
  Rendered with its n visible.
- lichess ratings show `prov: true` on every format despite thousands of games,
  because rating deviation grew during inactivity. Presented as "last rating," not
  "current rating."

## Testing

Following the repo's established split:

- **Unit (`vitest`)** — the generator's derivation functions, extracted pure and
  tested against committed fixtures: clock-decile bucketing, tilt conditioning,
  session splitting, streak detection, repertoire-by-year rollup, terminal-position
  aggregation. These are the numbers the section asserts, so they are the ones that
  get tests. Engine move generation is `chess.js`'s job, not ours; what gets tested
  is that each preset's search returns a legal move within its depth budget.
- **E2E (`playwright`)** — `/chess` renders with the committed data and no network;
  axe scan added to the existing route sweep. Per commit `587d426`, the scan must run
  after animations settle, not mid-animation.
- **Offline build** — `npm run build` must succeed with no network, from committed
  data only. This is the property that makes the whole design safe.

## Performance budget

- Home section imports `chess.ts` only (small, weekly-downsampled). `corpus.json` is
  fetched exclusively by the room.
- All three scenes are `React.lazy`, mounted only in the room, and honour
  `prefers-reduced-motion`.
- Engine is worker-only; no chess library is loaded on the home page.
- Lighthouse CI must stay green on `/` — if the arc ribbon costs measurably on the
  home route, it degrades to a 2D SVG there and the 3D version lives only in the
  room. *(ponytail: measure before optimising, but the fallback path is decided now
  so the decision isn't made under pressure later.)*

## Explicitly not built

- **Live "currently playing"** — chess.com's `/games/to-move` covers only daily
  games and refreshes at most every 12 hours; it would be a dead pixel almost always.
- **Stockfish WASM** — GPL-3.0, and megabytes of payload to grade positions nobody
  asked to have graded.
- **Chess × Spotify** — Spotify's recently-played window is 50 tracks, so there is no
  history to align against a 7-year chess corpus.
