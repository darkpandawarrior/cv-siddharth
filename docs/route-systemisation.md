# Route systemisation

Lane AD (`plan-task9-19routes`, site-overhaul plan.md:601-620). Step 1 — the `$.tsx` 404 with
on-brand chrome, `notFoundComponent` and a full SEO head — was already built and is excluded from
the pass below, same as the brief scopes it. What follows is the route-by-route audit the plan
promised and never delivered: every other route file, which reading path it serves, its room
chrome, its pager membership, and whether it's reachable from the facet registry or the sitemap.

The table is prose, and prose drifts. `src/routes/routeSystemisation.test.ts` is the mechanical
version of its own invariant: it walks `src/routes`, and fails if a route is reachable from
neither `facets.ts` nor the sitemap generator's list (`surfaces.ts` + `projects`) and isn't named
in [Exceptions](#exceptions) below with a reason. Add a route, and either register it somewhere or
come back here — there's no third option the gate lets through silently.

## Reading path, defined

Three depths, one page (site-overhaul-design.md §3.1): **Fast** (recruiter, ~90s), **Deep**
(engineer evaluating him as a peer, ~10 min), **Wandering** (anyone curious, unbounded). Home's own
Fast/Deep sections live on `/` and are registry-driven (`facets.ts`'s `homeFastPath`/`homeDeepPath`
— see `docs/superpowers/specs/2026-08-05-site-overhaul-design.md` §3.3-3.4); the classification
below is for the other 25 route files, which the design doc doesn't itemise. The rule actually
applied, so a reader can check it rather than trust it:

- **Fast** — built for the 90-second visitor and named as such in its own `surfaces.ts` blurb:
  `/`, `/hire` ("90 seconds"), `/resume` ("no chrome, no nav, printed to PDF").
- **Deep** — the mechanism/evidence content: `surfaces.ts`'s `group: "proof"` entries, minus the
  two just promoted to Fast and minus `/lab` (see override below), plus `/project/$slug` — a case
  study detail is exactly the "how the sensor problem was actually solved" example §3.1 gives for
  Deep, even though `project.$slug.tsx` has no `surfaces.ts` entry of its own (dynamic routes
  aren't registered per-route; see [Exceptions](#exceptions)).
- **Wandering** — everything else. This matches §3.1's own explicit list verbatim: "Labs,
  terminal, chess, the archive, the magazines, the fiction" is `/lab`, `/terminal`, `/chess`,
  `/ink`, `/excelsior`, `/anthology` + `/canon` + `/read/$slug`. `/lab`'s `surfaces.ts` group is
  `"proof"`, which would otherwise put it in Deep — the design doc names it under Wandering by
  word, so the doc wins over the group label. Every other `runs`/`corpus`/`writing`-group surface
  (`/compose`, `/blueprint`, `/map`, `/forge`, `/weeb`, `/playground`, `/lanes`, `/time-machine`,
  `/loopdown`, `/pulse`) follows the same "unbounded curiosity" shape: none of them is a load-bearing
  claim about the engineering the way `/shipped` or `/ops` is, each is open-ended the way §3.1's
  "unbounded" column describes.

## The table

"Room chrome" and "Pager" both come straight from `surfaces.ts`'s own `kind` field (`"room"` joins
the `RoomFrame` next-room pager in `roomSurfaces`' declared order; `"page"` is an ordinary scroll
route with the site footer) — not a fact I'm asserting, a fact I'm reading off the registry.

| Route | Reading path | Room chrome | Pager | Facet registry | Sitemap |
|---|---|---|---|---|---|
| `/` (`index.tsx`) | Fast + Deep (both live here) | page (footer, not a room) | — | `work`, `experience`, `board` all anchor here | yes (literal `"/"`) |
| `/$` (`$.tsx`) | N/A — 404, not a destination | page | — | no | no — see [Exceptions](#exceptions) |
| `/anthology` | Wandering (fiction) | page | — | no | yes |
| `/blueprint` | Wandering | room | yes | no | yes |
| `/canon` | Wandering (fiction) | page | — | no | yes |
| `/chess` | Wandering (explicit, §3.1) | room | yes | `chess` | yes |
| `/compose` | Wandering | room | yes | no | yes |
| `/excelsior` | Wandering (magazines, §3.1) | page | — | `excelsior` | yes |
| `/forge` | Wandering | room | yes (off wall, still paged) | no | yes |
| `/hire` | Fast | page | — | no | yes |
| `/ink` | Wandering (archive, §3.1) | page | — | `board` used to point here; now anchors `/` instead (so-p1-soul-surfaced) | yes |
| `/lab` | Wandering (explicit, §3.1 — overrides its own `proof` group) | room | yes | `lab` | yes |
| `/lanes` | Wandering | page | — | no | yes |
| `/loopdown` | Wandering | page | — | `loopdown` | yes |
| `/making` | Deep | page | — | no | yes |
| `/map` | Wandering | room | yes | no | yes |
| `/ops` | Deep | page | — | no | yes |
| `/playground` | Wandering | page | — | no | yes |
| `/project/$slug` | Deep | page | — | no | yes (per-project, from `projects`) |
| `/pulse` | Wandering | page | — | no | yes |
| `/read/$slug` | Wandering (fiction, §3.1) | page | — | no | no — see [Exceptions](#exceptions) |
| `/resume` | Fast | page | — | no | yes |
| `/shipped` | Deep | page | — | no | yes |
| `/terminal` | Wandering | room | yes (off wall, still paged) | no | yes |
| `/time-machine` | Wandering | page | — | no | yes |
| `/weeb` | Wandering | room | yes (off wall, still paged) | `weeb` | yes |

## Exceptions

Two routes are neither in the facet registry nor the sitemap generator's list, on purpose:

- `$.tsx` — the 404 catch-all. It has its own on-brand chrome, `notFoundComponent` and SEO head
  (plan-task9-19routes step 1, already shipped), but a catch-all is not a destination — the whole
  point is that nothing links to it. Indexing or facet-registering a 404 page would be the bug.
- `read.$slug.tsx` — individual archive pieces aren't sitemapped or given rail facets today.
  `/excelsior` (the scanned magazine) and `/anthology`/`/canon` (the season structure) are the
  indexed entry points into this material; every `/read/$slug` piece is reached by a link from one
  of those, never cold. That's a real, undecided gap — N pieces with no per-URL SEO entry, not a
  design choice this lane is making — flagged here rather than silently passed by a test that only
  checks routes, not link-reachability from other pages.

`project.$slug.tsx` is **not** an exception, even though it has no literal entry in either
registry: the sitemap generator builds one URL per entry in `projects` (`scripts/gen-sitemap.mjs`),
so the route pattern itself is covered — `src/routes/routeSystemisation.test.ts` checks this by
prefix (`/project/`) rather than by exact match, which is what a parameterised route needs.
