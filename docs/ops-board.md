# /ops, a control loop rendered as a page

Status: specified, not built. The three prerequisites below are done.

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

Two columns under one header, because there are two systems here and the
parallel is the argument.

**Left, the system that publishes this.** The pipeline control tower on top,
every workflow across both repos. Beneath it the freshness perimeter: every
generated file, its declared SLA, its age, sorted worst first. Same four fields,
so the two blocks read as one table with a rule between them.

**Right, the system I shipped.** Fleet heartbeat on top: 89 apps, how many were
confirmed listed on the last sweep, per-app last-verified. Beneath it the scale
numbers, then the leverage board: 22 convention plugins ranked by how many
modules apply them, with blast radius and SHA distance behind as columns.

**Full width across the bottom, the incident ledger.** Newest first. It is what
connects the two columns, because an incident is always about one row above it,
and every entry links back to that row.

## The loop, which is the actual argument

The five blocks are one system because each is a station in a closed loop, and
the layout is ordered so reading top to bottom traverses it:

**Detect** (perimeter, heartbeat) -> **Announce** (control tower LEDs) ->
**Escalate** (auto-filed issue) -> **Repair** (the fixing commit) ->
**Record** (ledger, with days to resolution).

Put those five words across the header with the current count under each:

```
DETECT 34 · ANNOUNCE 2 · ESCALATE 1 · REPAIR 0 · RECORD 11
```

That header says "control loop", not "dashboard", and it reads in four seconds.

## Motion rule

**Only BROKEN pulses. Nothing else on the page ever moves.** No settle
animations, no crawling edges, no needles sweeping up on load. One red dot
breathing in a field of two hundred still rows is striking. Six animated things
is a screensaver. Density does the rest: monospace, tight leading, a hairline
grid, roughly 200 rows visible at once. Dense and still reads as instrumentation.
Sparse and animated reads as a portfolio.

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

## Build order

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
data, and `surfaces.ts` already feeds three navigations). Analog gauges for
digital metrics. A self-scored capability matrix. A fleet constellation whose
edges would have to be invented. Provenance chips linking writing to the PRs it
came from are good and cheap, and they belong on `/project` and lesson pages.
Nothing on `/ops` should be about writing.
