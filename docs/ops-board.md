# /ops, a control loop rendered as a page

Status: live at `/ops` since 2026-08-28, reshaped 2026-09-01. This document
describes the board that exists; where it once described a plan, the plan has
been replaced by what was actually built.

## Why this exists

Every other surface on this site argues that the work was good. This one argues
that the work is *still true*, and shows the machinery that would notice if it
stopped being. That is the claim a Lead role is actually screening for, and it
is the one thing a portfolio almost never demonstrates.

It is also not hypothetical. In August 2026 this repo ran a daily refresh that
exited 1 for eight consecutive days while its own test suite stayed green, a
5,150-line generated file sat 21 days old and completely invisible to the
freshness alarm, and a chess dataset reached 29 days stale with 16 more days of
legal silence still to run. None of that was a broken generator. It was a
pipeline that failed quietly.

## The grammar

Coherence comes from a grammar, not a palette. Every element on the board is a
row with the same four fields, and nothing ever gets a fifth:

```
LED   SUBJECT                          STATE       VERIFIED
 *    refresh-media.yml                OK          2h ago
 *    store.ts                         DEGRADED    21d ago
 *    kmp-toolkit -> Mileway           OK          4h ago
```

If a concept cannot express itself in those four fields, it does not belong
here. That single rule is what keeps this one console instead of five widgets.

## Three states, and why amber is the whole idea

| State | Meaning |
|---|---|
| **OK** | The check ran and passed. |
| **DEGRADED** | The check is passing, and the thing underneath it is aging toward its SLA. |
| **BROKEN** | The check failed, or the SLA is blown. |

Green-or-red is what GitHub already gives you, and what every status page shows.
DEGRADED is the entire intellectual content of this board: passing, succeeding
daily, and quietly wrong. Put the legend at the top and define DEGRADED in one
line of prose. That definition is the thing worth screenshotting.

## Layout

One full-width console, not two columns. Two columns were specified and were
wrong: the two systems do not read as a parallel when each is half as wide as
the rows inside it, and a block heading became a card header instead of a rule
line. What shipped is a single table with rules through it, top to bottom:

1. **Banner**, sticky. The verdict sentence, then the five loop stations, then
   the escalation rail.
2. **The escalation rail**, inside the banner, holding the ACTUAL non-OK rows —
   not a summary of them. They stay in their own blocks below too, and those
   blocks' censuses still count them.
3. **The runway** — one lane per thing watched on a clock, drawn as the share
   of its OWN declared deadline already spent, with the two-thirds DEGRADED
   boundary drawn as a line.
4. **The census bar** — three segments, severity rank, across every row.
5. **Eight blocks**: control tower, published and signed, freshness perimeter,
   live surfaces, vendored drift, fleet heartbeat, leverage, incident ledger.
   The four long ones fold their rows behind a `<details>`, and a block opens
   itself when it holds a BROKEN row.

Row counts today: 5 tower + 4 published + 6 perimeter + 5 surfaces + 8 drift +
89 fleet + 17 leverage + 11 ledger = **145** — of which the 5 tower and 4
published rows arrive from `/api/ops`, so a visitor offline or on a cold
function sees **136** and every count on the page says 136 with it.

Five blocks carry a figure drawn from their own data and three deliberately do
not. The three are named, with the reason, where they are: the tower has no
declared failure-rate threshold to draw against, the published chain is three
apps and an index, and vendored drift carries two distinct values.

## The loop, which is the actual argument

The five blocks are one system because each is a station in a closed loop, and
the layout is ordered so reading top to bottom traverses it:

**Detect** (perimeter, heartbeat) -> **Announce** (control tower LEDs) ->
**Escalate** (auto-filed issue) -> **Repair** (the fixing commit) ->
**Record** (ledger, with days to resolution).

Those five words sit across the banner with the current count under each, on a
connected track rather than in a wrapped row — five stations wired left to
right, so the shape says "loop" before the words do:

```
DETECT 136 · ANNOUNCE 018 · ESCALATE 000 · REPAIR 000 · RECORD 011
```

DETECT reads **136** from committed data alone — which is what a visitor sees on
`vite preview`, on a cold Vercel function, or during an outage — and **145** once
`/api/ops` answers and adds the five workflow rows and the four published ones.
The census under the block says "across 136 rows" in the same two states. Every
other count here is committed data and does not move. Counts are the real ones
as of 2026-09-01, zero-padded to three digits so the
track cannot reflow when one of them changes. ESCALATE's digit is the same
`brokenCount` the census and the rail draw in `--color-danger`, so it is drawn
in `--color-danger` here too; ANNOUNCE's is `escalated.length`, which is amber
because the rail it summarises is amber. Neither station invents a state: the
colour comes from the same `STATE_COLOR` map every row on the board uses.

## Motion rule

The board used to hold everything still except one red dot. That worked because
145 near-identical rows had nothing else worth animating, and stillness made the
one alarm unmissable by contrast. The summary layer above those rows is now a
set of instruments, and they are allowed to arrive.

Two kinds of motion, and there is no third.

**Arrival.** An animation may run **once**, and only to deliver a value that is
genuinely arriving — a bar's real height, a counter's real number, an edge that
really exists. It must run to a final state that is correct, and it must be able
to skip straight to that state with nothing lost, because that is precisely what
reduced motion does to it. Every animated value renders **final** and JavaScript
only ever un-does that, and only when the visitor has not asked for less motion.
A reduced-motion visitor gets the finished instrument, and gets it without a
second CSS rule taking the blank state back: JavaScript can read the media query
and simply not arm, which is the whole reason the blank state lives there rather
than in the stylesheet.

It is **not** an axe argument, and this paragraph used to claim it was. Measured
against the real harness — `e2e/a11y.spec.ts` freezes CSS animation and never
scrolls — the arming runs on mount, the IntersectionObserver never fires, and axe
scans twelve zero-height bars and seventeen undrawn edges: the identical outcome
to parking them blank in CSS. That is harmless here for a different reason.
Each figure's GRAPHIC LAYER is `aria-hidden` — the twelve cadence halves and the
web's `<svg>`, not the `<figure>` itself, which has to stay exposed or it would
take the caption and every number down with it — and every value those graphics
encode is real text beside them, so the arming state is invisible to axe either
way. The same gap means a
`window.print()` before the reader has scrolled prints two empty plots; accepted,
because every number is still in the caption and the labels. (`/ops` is not
server-rendered — `vite preview` ships a 3.8 kB shell for it against 27 kB for
`/` — so the crawler argument buys nothing here either.)

**Alarm.** An animation may loop **forever** only while the thing it shows has
not stopped being true: a row that is still BROKEN, and the clock counting how
long it has stayed that way. Nothing else loops — not a scan line, not a sweep,
not a countdown to a refresh that does not happen.

"Ambient" is not a third category. A shape that moves forever and encodes
nothing is a screensaver with a job title.

BROKEN is never carried by motion alone, and never by colour alone. Every BROKEN
mark also has a permanent shape — the row's wash, the LED's outline, the
ESCALATE station's ring — so it reads identically in a screenshot, under reduced
motion, and to a reader who cannot separate red from amber.

The grammar layer never joins in. 145 rows staggering into place is 145
animations and a keyboard user waiting on them. Motion belongs to the summary
layer and stops there.

`src/data/ops.test.ts` enforces all of it. The old test counted keyframes, which
stopped being the right question the moment more than one was allowed. It is now
stricter, not looser: every keyframe in the slice must be used, every animated
selector must reappear in the `prefers-reduced-motion` block, no substitute may
be a bare `animation: none`, no rule may park an instrument at a blank base
state, `infinite` belongs to `ops-pulse` alone, `--color-danger` animates in no
other keyframe, every `ops-pulse` call site is gated on BROKEN, and no rule
reaching `.ops-row` may carry a transition or an animation. **Adding an
animation without a fallback fails the build.**

Four of those clauses were real rules with holes under them, and each was found
by writing the violation and watching the suite stay green:

- **Selector matching is a set, not a substring.** `reduced.includes(sel)` let
  any animation on a figure ROOT through, because `.ops-trace` is a substring of
  the guarded `.ops-trace__node`, `.ops-cadence` of `.ops-cadence__bar`, and
  `.ops-web` of `.ops-web__svg` — the three likeliest places to add motion next
  were the three exempt from the rule.
- **A comma list is read whole.** Every selector was reduced to its last line,
  so `.ops-verdict,`/`.ops-trace__node { … }` checked only the second one. A
  comment asserted the single-line convention that made the shortcut safe;
  nothing enforced it.
- **Forever has two spellings.** Only the `animation:` shorthand was scanned, so
  `animation-iteration-count: infinite` looped on past the one rule reserved for
  BROKEN. The shorthand is also split on commas now, so a composited rule is
  judged on the part that actually loops rather than on whichever name came
  first.
- **`transform: scale(0)` is a blank base state.** The check knew `opacity: 0`
  and `stroke-dashoffset`, the two mechanisms already in the file, and not the
  third — which is precisely how the cadence bars are armed. Selectors gated on
  a `data-` attribute are exempt, because that is the arming rather than the
  base state, and an armed blank must still name itself in the reduced-motion
  block.

### What actually moves, today

| Element | Trigger | Loops |
|---|---|---|
| Loop-trace node dots and wires | mount, 90ms stagger | no |
| Loop-trace counters | mount, 900ms count-up | no |
| Shipping-cadence bars | first scroll into view | no |
| Dependency-web edges | first scroll into view | no |
| The LED, and the ESCALATE node | a row is BROKEN **right now** | **yes** |
| The rail's elapsed clock | a row is BROKEN **right now** | it is a clock |

On an all-clear day — which is today — the page holds no red row and no red
count above zero, and nothing loops at all. Red is still on the page: the word
`BROKEN` where the intro defines it, and the eight census zeros that say how
many broken rows each block has, which is the number being zero rather than the
severity being present. That is the correct rendering of "nothing is wrong".

### The measured cost

Every figure on this page sits on a height the layout reserves before its data
arrives, and the two added on 2026-09-01 sit on committed synchronous data, so
they are the right size at first paint. Re-measured after the reshape:

| | /ops |
|---|---|
| cumulative-layout-shift | **0.0086** (mobile preset; error gate is 0.25) |
| accessibility | **1.00** (mobile preset) |
| animated elements, total | 5 nodes + 4 wires + 12 bars + 17 edges = **38**, fixed, independent of the 145 rows |
| animated properties | `transform`, `opacity`, `stroke-dashoffset` only — no `width`/`height`/`top`/`left`, so nothing here touches layout |

`lighthouserc.json` recorded 0.162 for this route on 2026-08-29, before the
runway and control-tower reservations existed. That entry is annotated rather
than overwritten: the other 22 URLs in the gate were not re-run, so the
site-wide maximum is no longer a number anyone has checked.

One caveat that is NOT a regression: at the DESKTOP preset — which the gate does
not run — `target-size` flags the runway's lane links at 23px. Not a rule
reaching `.ops-runway` appears in this change's stylesheet diff, so the finding
predates it; it is recorded here so the next person measuring does not read it
as new.

## Connectivity, mechanically enforced

Every row's SUBJECT links to the thing (repo, `/project` page, Play listing,
generator source). Every row's VERIFIED links to the evidence (workflow run,
commit, issue). Two outbound links per row, all real.

Then ship a test that asserts every field `/ops` references still exists in its
source module and every link resolves, so the build breaks when the board starts
lying about itself. That is the healing pillar applied to the healing dashboard.

## Prerequisites, all landed 2026-08-28

1. **The `store.ts` blind spot, fixed at the regex rather than the list.** The
   scanner matched one stamp shape, so a file stamping itself differently was
   invisible. Widened to both shapes, then pinned in `MUST_BE_STAMPED`.
2. **`if: always()` on refresh-media.yml's commit step.** One dead generator was
   discarding the output of 26 working ones.
3. **Per-file SLAs** in `freshness.test.ts`, replacing one blanket 45 days.

Each was verified by breaking it first and watching it go red. A perimeter that
has never gone red is a green build that proves nothing, and enshrining that
inside a dashboard about exactly that defect would be embarrassing.

## Build order, as executed

1. **Control tower and perimeter.** One day. They turn today's real red into
   today's visible red, so the board is honest from its first commit.
2. **Incident ledger.** Backfill by hand with the incidents already documented in
   `freshness.test.ts` comments, so it opens with history instead of empty state.
3. **Leverage board.** One day, one API scan feeding three columns.
4. **Fleet heartbeat.** Multi-day, and rate-limit it hard. 89 sequential Play
   Store fetches on a daily cron is how you get an IP blocked and acquire a
   fourth silently-failing generator. Batch it, stagger it, and give the
   heartbeat its own row on the perimeter so it can report its own death.

## Explicitly not here

A transit map of the site's own routes (the technique carries the effect, not the
data, and `surfaces.ts` already feeds three navigations). A self-scored
capability matrix.

**Analog gauges for digital metrics — stands.** A dial per lane was proposed for
the runway and rejected: six dials have no shared baseline, and the shared
baseline is the entire argument that a 21-day file and a 45-day file at the same
mark are equally worried.

**A fleet constellation whose edges would have to be invented — stands, and the
leverage web satisfies it rather than contradicting it.** That web's 17 edges are
`repos` entries in `src/data/ops.ts`; every line is a string that exists in
committed data, and every line is the same thickness because there is no
per-edge module count to draw one from. The FLEET graph this line refuses — 89
apps with no relation between them recorded anywhere — is still refused.

**Provenance chips linking writing to the PRs it came from** are good and cheap,
and they belong on `/project` and lesson pages.
Nothing on `/ops` should be about writing.
