# cv-siddharth

<p align="center">
  <img src="./public/assets/readme/hero.gif" width="100%" alt="cv-siddharth, an interactive résumé with an AI assistant">
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0b0f0d">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-blue?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white">
  <a href="https://vercel.com/sid-pandalais-projects/cv-siddharth"><img alt="Deploy" src="https://img.shields.io/badge/deployed%20on-Vercel-black?logo=vercel"></a>
</p>

**Live: [cv-siddharth.vercel.app](https://cv-siddharth.vercel.app/)** (the Vercel project
itself is now named **siddharth-pandalai**, reachable at
[siddharth-pandalai.vercel.app](https://siddharth-pandalai.vercel.app/) too; the original
domain stays a live alias so every existing link keeps working)

Interactive CV for **Siddharth Pandalai**, Senior Android Engineer. A portfolio
that demonstrates the work instead of listing it: case studies with real
production metrics, four Kotlin Multiplatform builds running as WebAssembly in
the page, a print-perfect [résumé view](https://cv-siddharth.vercel.app/resume)
(A4, PDF via the print dialog), and an AI assistant ("Panda") that answers
questions about his experience in the third person.

Inspired by [santifer/cv-santiago](https://github.com/santifer/cv-santiago),
rebuilt and simplified: the entire CV fits in an LLM's context, so there is no
RAG pipeline. Knowledge lives in a single generated system prompt
([api/_lib/system-prompt.ts](api/_lib/system-prompt.ts)).

<p align="center">
  <b><a href="#stack">Stack</a></b>&nbsp;&nbsp;·&nbsp;&nbsp;<b><a href="#quick-start">Quick start</a></b>&nbsp;&nbsp;·&nbsp;&nbsp;<b><a href="#the-surfaces">The surfaces</a></b>&nbsp;&nbsp;·&nbsp;&nbsp;<b><a href="#one-registry">One registry</a></b>&nbsp;&nbsp;·&nbsp;&nbsp;<b><a href="#deploy">Deploy</a></b>&nbsp;&nbsp;·&nbsp;&nbsp;<b><a href="#structure">Structure</a></b>&nbsp;&nbsp;·&nbsp;&nbsp;<b><a href="#generators">Generators</a></b>&nbsp;&nbsp;·&nbsp;&nbsp;<b><a href="#gates">Gates</a></b>
</p>

## Stack

React 19 · TypeScript 7 · Vite 8 · TanStack Start · Tailwind v4 · Vercel ·
**provider-agnostic chat backend**. Four providers sit behind one SSE format, so
the widget never knows which answered: **Google Gemini**, **Cerebras**,
**Groq** and **Anthropic Claude**. Whichever keys are configured are tried in
order, with fallback on failure; model names are overridable per provider
(`GROQ_MODEL`, `GEMINI_MODEL`, `CEREBRAS_MODEL`, `ANTHROPIC_MODEL`).

The order is chosen per request by prompt size, not fixed. `providerOrderFor()`
sends anything above `GROQ_TPM_HEADROOM` (7,000 tokens) to the roomier
providers first. The generated system prompt is ~26k chars ≈ 6.6k tokens
on its own, so in practice **every chat request leads with Gemini** and Groq
is the fast path for the short non-chat modes only. This is measured, not
assumed. `chat-handler.test.ts` carries a tripwire that fails if the prompt
grows past the headroom, and it is currently past it. If Groq-first matters,
the fix is a smaller prompt, not a reordered list.

**TypeScript 7.0.2 compatibility note:** The repo runs TypeScript 7.0.2 for compilation (`npx tsc --version` confirms it). Because `typescript-eslint` doesn't support TS 7's compiler API yet (support lands in 7.1), `package.json` uses Microsoft's documented side-by-side pattern: `@typescript/native` (real TS 7.0.2) + `@typescript/typescript6` (TS 6.0-API shim for lint). If lint ever fails with "typescript-eslint does not support TS 7.0" after an `npm install`, check `npx tsc --version` first. If it is not 7.0.2, run `npm install` again to resolve the `tsc` binary race.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # add a chat key to enable Panda
npm run dev
```

Open http://localhost:5173. The site works without a key; the chat widget
shows a contact fallback until one of `GROQ_API_KEY` / `GEMINI_API_KEY` /
`CEREBRAS_API_KEY` / `ANTHROPIC_API_KEY` is set. In dev, a Vite middleware
([vite.config.ts](vite.config.ts)) serves `/api/chat` with the same handler
Vercel runs in production, so no `vercel dev` is needed.

## The surfaces

The site is not a page with a few easter eggs; it is **twenty-two destinations**,
each its own route. The homepage renders every one of them as a tile in the
device frame it is best seen in, and the same grid is reachable from anywhere
via the **Surfaces** launcher in the nav. ⌘K searches by name; the launcher
shows what exists, and you cannot search for a room you do not know about.

Some routes are **rooms**: they join a shared next-room pager (`/chess`,
`/lab`, `/blueprint`, `/compose`, `/forge`, `/map`, `/terminal`, `/weeb`, and
the drivable `/playground` world), so moving between them never bounces
through the homepage. Every route also carries the **rail**, a live trace
pinned to the left edge (`AnomalyRail`): a repeating baseline scale with each
facet plotted on it at its real chronological position, expanding into a
full instrument view on drag or the `\` key. `docs/route-systemisation.md` is
the mechanically-checked table of which route is which (room or page, fast,
deep or wandering reading path, reachable from the facet registry or the
sitemap or both), and `routeSystemisation.test.ts` fails the build if a route
falls through it unregistered.

<p align="center">
  <img src="./public/assets/readme/wall.webp" width="100%" alt="The homepage surface wall: every route as a tile in its own device frame, grouped under Proof, Things that run, Corpus and Writing">
  <br/>
  <sub><i>One group of four. Each poster is the route captured at that device's own viewport, not a desktop screenshot cropped to shape.</i></sub>
</p>

| | | |
|---|---|---|
| [`/hire`](https://cv-siddharth.vercel.app/hire) | the 90-second version | numbers, résumé, contact. For someone who will not explore |
| [`/resume`](https://cv-siddharth.vercel.app/resume) | print · pdf | A4 `@page`, no chrome, straight to PDF from the browser |
| [`/shipped`](https://cv-siddharth.vercel.app/shipped) | store · verified | every Android app that reached Play from work he touched, each checked against its live listing |
| [`/lab`](https://cv-siddharth.vercel.app/lab) | canvas · physics | **11 experiments** that prove the numbers: GPS filtering, crash triage, recomposition and module graphs, running in your browser |
| [`/pulse`](https://cv-siddharth.vercel.app/pulse) | telemetry · live | a live count of what visitors actually touch across the site |
| [`/compose`](https://cv-siddharth.vercel.app/compose) | live editor · AI | write Jetpack Compose, watch it recompose in a phone frame |
| [`/ops`](https://cv-siddharth.vercel.app/ops) | control loop · live | every workflow, every generated dataset against its own SLA, what is published and signed, and a ledger of the failures a green check did not catch |
| [`/blueprint`](https://cv-siddharth.vercel.app/blueprint) | 3D · WebGL | the portfolio as an infinite canvas: a three.js fly-through, an ASCII render of the same scene, and a sketchable tldraw whiteboard |
| [`/map`](https://cv-siddharth.vercel.app/map) | 3D · graph | the projects and the ideas connecting them, as an orbitable constellation |
| [`/forge`](https://cv-siddharth.vercel.app/forge) | canvas · interactive | a few thousand particles spring-tied to a letter, parting around the cursor |
| [`/terminal`](https://cv-siddharth.vercel.app/terminal) | text · easter egg | a faux shell you can type in: `ls`, `open doori`, `ask <q>`, `chess clock`. Backtick summons it from any route |
| [`/playground`](https://cv-siddharth.vercel.app/playground) | 3d world · drivable | every room as a building on one street, drivable in 3D; north is 2017, south is now, and a West District turns his employers and case studies into towers |
| [`/chess`](https://cv-siddharth.vercel.app/chess) | 3d · engine | seven years across lichess and chess.com, mined: the rating arc in 3D, a shifting repertoire, a bot that plays like him |
| [`/weeb`](https://cv-siddharth.vercel.app/weeb) | corpus · data | a hand-kept anime list read as evidence, a status column with no word for quitting |
| [`/ink`](https://cv-siddharth.vercel.app/ink) | archive · world | the writing years, before the code |
| [`/excelsior`](https://cv-siddharth.vercel.app/excelsior) | 396 pages | three editions of MANIT's institute magazine, page-turnable in full |
| [`/loopdown`](https://cv-siddharth.vercel.app/loopdown) | field notes | what broke in production, what the fix was, and the numbers on either side |
| [`/anthology`](https://cv-siddharth.vercel.app/anthology) | fiction · starmap | The Morkinstar Journals, forty-eight short stories across four seasons, a navigable starmap and a lore page |
| [`/canon`](https://cv-siddharth.vercel.app/canon) | lore · reference | the rules the Morkinstar Journals are written against: seven laws, the count, the fourteen, and what the rendering can and cannot do |
| [`/making`](https://cv-siddharth.vercel.app/making) | process · receipts | the craft record for the anthology: cross-lab ownership audits, what they killed, two portrait passes, and what the whole thing cost |
| [`/lanes`](https://cv-siddharth.vercel.app/lanes) | corpus · timeline | work, open source, writing and chess, month by month since 2019, on one shared axis |
| [`/time-machine`](https://cv-siddharth.vercel.app/time-machine) | corpus · git history | this repo's own commit history, walked back month by month |

`/terminal`'s own `help` isn't the whole command list by design: nine
commands mark themselves `hidden` and skip it, so they stay things to find
rather than things to read off a screen.

Plus, on the scroll itself:

- **The multiplatform section**. The four Kotlin Multiplatform builds that ship
  a web target, compiled to Wasm and served from this domain, re-framed live
  across the real Android window size classes (compact / medium / expanded).
  One iframe, so changing the form factor re-lays-out the running app instead
  of reloading it. Nothing boots until you click it.
- **Fit check**. Paste a job description and the assistant scores the fit
  honestly, gaps included. Same analyzer as `/jd` in the chat console.
- **Compare viewers**. On project pages, drag to compare two treatments of the
  same screen (light/dark, before/after) where genuine variants exist.
- **Per-project share cards**. Each `/project/<slug>` is server-rendered with
  its own OG/Twitter meta and a branded 1200×630 card (`/p/<slug>/og.png`).
- **Live Signal**. Spotify now-playing and recent GitHub activity, one polling
  hook feeding a footer chip, terminal commands (`spotify`/`np`, `activity`/`gh`)
  and a card on the Blueprint canvas. GitHub works keyless; Spotify needs
  `npm run spotify:auth` once. No keys, no crash, and every surface says
  "not connected".
- **`/read/<slug>`**. The magazine prose as selectable, searchable text rather
  than photographs of paper, each piece linked to the scanned page it ran on.
- **The Canon and The Making**. The anthology's reference shelf: the lore
  rules `/canon` gates behind a spoiler divider, and `/making`'s own record
  of building it, for a reader who wants the machinery, not just the story.
- **EB Profiles**. One card per Editorial Board year, a teammate's
  in-character answer about him, each linking through to the scanned
  magazine page it came from. The same grid renders on the homepage and in
  full on `/ink`, from one component (`BoardProfilesGrid`).
- **A cross-site play layer**. A guest wall anyone can sign, per-piece margin
  notes on `/ink` and every `/read/<slug>`, and reaction rows, all shared
  documents backed by `playhtml`, not a per-visitor toy. `VITE_GUEST_WALL=off`
  removes the wall on the next deploy; nothing here calls a server of his.

## One registry

[`src/data/surfaces.ts`](src/data/surfaces.ts) is the single source for every
route on the site. It feeds the homepage wall, the launcher, the command
palette, the per-route `<head>`, the terminal's `go`/`ls`/`sitemap`, the
sitemap generator, the legacy-hash redirects and the assistant's prompt.

This was four registries and two hardcoded JSX lists. Every one of them
drifted. Nine finished routes were unreachable from the homepage, the palette
reached eleven of sixteen, and the legacy-hash map knew about nine. Adding a
surface now means one entry, and `surfaces.test.ts` derives the route list from
`src/routes/*.tsx` **on disk** and fails the build if a route has no surface, a
surface has no route, a declared poster is missing, an icon is absent or a
`railId` dangles.

## Deploy

Single target: Vercel hosts the TanStack Start server and the chat function
together.

```bash
npx vercel
```

Set at least one chat key in the Vercel project's environment variables.
`api/chat.ts` runs on the Edge runtime and streams SSE straight through to the
widget, with no separate chat host.

That endpoint spends the owner's API key, so it defends itself
([api/\_lib/chat-handler.ts](api/_lib/chat-handler.ts)): an **origin allowlist**
(the live site, this deployment's own Vercel hostnames so previews work,
localhost, plus anything in `ALLOWED_ORIGIN`. A request with no `Origin` header
is refused), a **per-IP rate limit** (`CHAT_RATE_PER_MIN`, default 10;
`CHAT_RATE_PER_HOUR`, default 60 → `429` + `Retry-After`), and **payload caps**
(≤60 messages, ≤64 KB body, ≤2000 chars per user turn, history trimmed before
it reaches a provider). The rate limiter is per-isolate and
therefore best-effort. See the comment above it for what a durable version
would take. `vercel.json` pins the SSR function to `bom1` (Mumbai)
and sets long-lived immutable caching for the WASM lab bundles; TanStack
Start's own router handles all page routing, so there's no rewrite rule to
maintain.

Four more endpoints carry a live credential of their own (`/api/ops`,
`/api/pipeline`, `/api/github-activity`, `/api/spotify` spend the owner's
`GITHUB_TOKEN` or a Spotify OAuth exchange) and share the same origin
allowlist and a per-IP sliding-window rate limit through one extracted module,
[api/\_lib/guard.ts](api/_lib/guard.ts): `guarded()` wraps a GET handler with
both in one import instead of a sixth hand-rolled copy. Unlike chat's POST, a
request with no `Origin` header is let through here: these are same-origin
`fetch()` calls a browser doesn't reliably attach one to, and refusing them
would 403 the site's own widgets.

Real-user monitoring is opt-in and off by default: set `VITE_SENTRY_DSN` and
[src/lib/monitoring.ts](src/lib/monitoring.ts) wires Sentry (Core Web Vitals
plus error tracking, 20% trace sample, `sendDefaultPii: false`) once, client
side, after hydration. Leave it unset and the module makes no network call
and loads no dependency code at all. `@vercel/analytics` (`<Analytics />` in
`__root.tsx`) is unconditional and needs no key.

## Structure

<details>
<summary><b>The map</b>: where the registries, the API and the generated data live</summary>
<br/>

```
api/
├── chat.ts                  # Vercel Edge entry
└── _lib/
    ├── chat-handler.ts      # Web-standard handler (shared dev/prod), 4 providers
    ├── system-prompt.ts     # GENERATED — Panda persona + CV knowledge
    └── jd-prompt.ts         # GENERATED — the fit-check analyzer
src/
├── App.tsx                  # The homepage sections, in scroll order
├── routes/                  # One file per route — the router derives from disk
├── data/
│   ├── surfaces.ts          # THE registry: every route, its tile, its device
│   ├── profile.ts           # CV content (single source of truth)
│   ├── labs.ts              # the 11 Lab Bench experiments
│   └── *.ts                 # GENERATED: chess, weeb, store, writing, galleries…
├── lib/navigation.ts        # section ids + hash classification
├── Launcher.tsx             # the wall, from anywhere
├── SurfaceWall.tsx          # the homepage grid
└── index.css                # Tailwind v4 theme tokens
e2e/                         # Playwright: a11y, nav, offline, visitors, smoke
scripts/                     # the generators + the capture/sentinel tooling
```

</details>

The five case-study projects this site embeds live and links to were renamed
2026-09-05, published `applicationId`s and package names kept so existing
installs are never orphaned: [Doori](https://github.com/darkpandawarrior/Doori)
(formerly Mileway), [Gaddi](https://github.com/darkpandawarrior/Gaddi)
(formerly Kursi), [PaymentsLab-KMP](https://github.com/darkpandawarrior/PaymentsLab-KMP)
(formerly PaymentsLab), [Candidai](https://github.com/darkpandawarrior/Candidai)
(formerly HireSignal) and [Stutter](https://github.com/darkpandawarrior/Stutter)
(formerly DEADLOCK). `vercel.json`'s redirects keep every old `/project/<old-slug>`
and `/p/<old-slug>` link resolving to the current one.

This consolidation itself landed as one merge train: roughly a dozen feature
lanes (the system graph, the rooms and rail, the labs and chess room, the
compose playground, the corridor world, the new surfaces, mobile performance,
the asset offload) each ran in its own git worktree and PR, stacked and
merged bottom-up onto `integration/site-stack`, which landed on `main` as one
PR once every lane's own gate was green.

## Generators

<details>
<summary><b>Nothing is hand-mirrored</b>: content and assets generate from <code>profile.ts</code>, the registry and the source repos</summary>
<br/>

Twenty-eight `gen:` scripts over thirty-three generator files. The ones you
will actually reach for:

```bash
npm run refresh           # media sync + every generator (stats, galleries, og, prompt…)
npm run gen:system-prompt # rebuild Panda's prompt after editing profile.ts
npm run gen:og            # branded per-project OG cards (/p/<slug>/og.png)
npm run capture:site      # screenshot every route (feeds the sentinel)
```

`gen:og` rasterizes at author time and commits its output, so the Vercel
build needs no browser and no image toolchain.

Every generator is ONE typed node in
[scripts/generators.mjs](scripts/generators.mjs): its real inputs, its
outputs and which pipelines include it. `package.json`'s prebuild chain,
`refresh.mjs`'s step list and `check-generated.mjs`'s deterministic set all
derive from this one file now, in a topological order over declared
input/output edges, instead of three hand-kept lists that used to disagree
(and once let a dead generator sit fifth in a 15-link `&&` chain, silencing
the thirteen after it for eight days). `generators.test.mjs` fails the build
if a script has no node, a node names a script that doesn't exist, or a
generated file isn't a declared output.

Five more generator files exist with no `npm run` script, deliberately: each
needs something a build machine doesn't have. `check-generated.mjs`'s header
carries the same reasoning; this is that reasoning where a README reader can
find it.

- `gen-excelsior.mjs`. Manual and occasional: renders the source magazine
  PDFs, which live on MANIT's CDN and are not in this repo, and needs
  `poppler` installed locally. Output is committed; the build never touches
  a PDF.
- `gen-excelsior-text.mjs`. OCRs the rendered pages into a static per-edition
  text manifest (`public/excelsior/text/<year>.json`) so the in-reader search
  has something to search. Needs `tesseract` installed locally; best-effort
  on scanned magazine columns, not a transcript.
- `gen-store-archive.mjs`. Queries the Internet Archive for delisted Play
  listings. A floor, not a count, since the Archive only has what it happened
  to crawl. `npm run gen:store` merges its output.
- `gen-store-flavours.mjs`. Refuses to run without `SHELF_RIDER_REPO` and
  `SHELF_DRIVER_REPO` pointing at two private checkouts, so it cannot run on
  a CI box at all.
- `gen-store-siblings.mjs`. Walks each shelf client's Play developer page
  live, looking for a merchant-side sibling app the rider/driver data misses.
  Writes a gitignored cache; `npm run gen:store` merges it.

</details>

## Gates

The recurring failure in this repo has been a hand-kept list quietly falling
behind the thing it mirrors, with every test green. The gates exist for that
specific shape:

```bash
npm test          # 1287 unit tests across 116 files (vitest)
npm run test:e2e  # 274 Playwright tests across 17 files, every registry route
npm run lint
npm run sentinel  # screenshots: blank, duplicate, uncaptured, orphaned, stale
```

Those two counts are not typed here by hand. `scripts/gen-repo-stats.mjs`
counts the suite with `vitest list`, writes `src/data/repoStats.ts` in the
daily refresh (it reads sibling repos, so it never runs in the hermetic
build stage) and the homepage renders the committed result, so the figure on
the site is generator output, refreshed on a schedule rather than every deploy.
`readme.test.ts` then asserts this file agrees with it. The site once claimed
619 tests in 46 files while the suite had grown to 812 in 73, which is the
whole reason that generator exists.

CI runs five workflows. `ci.yml` is the gate: `tsc -b`, lint, the unit tests
and `npm run check:budget` on every push. The budget check
([budgets.json](budgets.json), `scripts/check-budget.mjs`) fails when the
homepage's eager JS graph (everything Vite's manifest marks as a static
import from the route, not a lazy chunk) or any named chunk grows past
today's measured byte ceiling, a ratchet rather than a target: it cannot go green
on its own, and a deliberate increase needs a reviewed edit to `budgets.json`,
never a silent one. `lighthouse.yml` builds, runs the full Playwright suite, then
Lighthouse CI over 23 URLs, one run each, asserting accessibility at 1.00 and
SEO at 0.95 as errors, cumulative layout shift, total byte weight and script
size also as errors (all three are properties of the bytes and the layout, so
they measure the same on a CI runner as on a laptop), and LCP, first
contentful paint and total blocking time as warnings until a runner-measured
calibration promotes them too. Three more run on a schedule, not a push:
`refresh-twin.yml` rebuilds the embedded Compose twin daily,
`refresh-media.yml` pulls project media and stats from the app repos daily,
and `screenshot-sentinel.yml` runs the capture sentinel weekly and on any PR
that touches a capture.

Run `npx tsc -b`, not `npx tsc --noEmit`. They are different programs over
different configs, and `--noEmit` misses errors the build fails on.

- `surfaces.test.ts`. The route list on disk against the registry.
- `navigation.spec.ts`. Reads the section ids out of the **rendered** homepage
  and asserts `SECTION_ID_LIST` matches, order included, then proves the command
  palette can reach every route.
- `a11y.spec.ts`. Axe over every route, at desktop **and** 390px, with
  `best-practice` and the experimental `label-content-name-mismatch` rule
  enabled. Lighthouse scores the live site 1.00 on accessibility.
- `beforeTheCode.test.ts`. Every magazine citation points at a scan that exists
  and a `/read` piece that still exists.
- `claim-audit` (in the private harness). Mechanically re-checks every claim
  this site makes about his work before anything outward-facing ships.

## Rendering and vitals

Twenty-five of the twenty-seven route files server-render. Two stay client-only:
`/ops` and `/pulse`. `/ops` is client-only because every age on its board is
computed at load and a server render would ship a timestamp already wrong by
the time it is read; `/pulse`'s numbers come off a websocket, so there is
nothing meaningful to render on the server.

`/playground` used to be the seventh. Lighthouse did not score it slow, it
scored it `NO_FCP`, meaning the page painted no content whatsoever: a phone saw
a blank screen until the client bundle and three.js had both arrived. One
import caused it. The room grid reads the interaction counter from a module
that loads `@playhtml/react`, which reads `document` when it is imported, and
that killed the route's SSR in the loader before render began. The counter now
reaches components through a context whose default is a working no-op, which is
the truth on the server anyway, and the route serves its room grid and a baked
terrain plate as real HTML.

Six things hold the numbers up, and each is enforced rather than remembered:

- **Content-hashed assets are immutable.** Everything under `/assets` is
  `max-age=31536000, immutable`. It was `max-age=0, must-revalidate`, so every
  returning visitor paid a revalidation round trip for every file.
- **HTML is cached at the edge** with `s-maxage` and `stale-while-revalidate`,
  which is safe here because two fetches of the same page differ by eight
  characters of router timestamp and nothing else.
- **The LCP element must not animate its opacity.** Chrome does not count a
  transparent element as painted, so an entrance fade adds its own duration to
  the measured LCP. `.rise-in-lcp` in `src/index.css` is the translate-only
  keyframe for anything that could be the largest paint.
- **`content-visibility: auto` on four below-the-fold sections**, every
  `contain-intrinsic-size` measured against the deployed page rather than
  guessed, because a wrong one buys paint time by trading away layout
  stability. Cumulative layout shift measures 0.0086 at `/ops`, the worst URL
  in the fleet, and 0.058 or under everywhere else; `lighthouserc.json` errors
  above 0.25, a ceiling with real headroom rather than the measured figure
  itself.
- **SSR import protection fails the build, not the browser.** TanStack
  Start's own `importProtection` denies `leaflet`, `tldraw`,
  `@playhtml/react`, `playhtml`, `three` and `@react-three/*` from the SSR
  bundle at build time, naming the file and the specifier instead of shipping
  a `ReferenceError: document is not defined` (this repo's own history: both
  libraries have done exactly that in production before). A `lazy()` import
  alone does not keep a module out of the SSR compile; every SSR-reachable
  client-only render site (a WebGL scene, a tldraw board, a `playhtml` room)
  renders through `<ClientOnly>`, which Start's compiler recognises and
  strips from the server build.
- **Below-the-fold homepage sections hydrate late, on purpose.** The nine
  sections under the hero (case studies, projects, experience, skills,
  circuit, doorways, contact, the multiplatform frame switcher) mount inside
  `<Hydrate when={visible()}>`, so their client JS stops competing with the
  hero for the main thread until they are near the viewport. Measured
  (`npx lighthouse --preset=perf --form-factor=mobile`, before → after):
  `/` performance 63 → 66, LCP 6.44s → 5.56s, TBT 19ms → 29ms; `/project/doori`
  performance 60 → 65, LCP 8.55s → 6.08s. Short of an 80/2.5s aspirational
  bar, said plainly rather than rounded up; `lighthouserc.json`'s own header
  is where that's written down, and only `/`'s total-blocking-time (still a
  6-15x margin against the 300ms budget) was promoted to an error gate on
  the strength of it.

Heavy static assets live on GitHub Pages, not Vercel: the five bundled WASM
apps, Excelsior's 396 magazine scans, the project screenshot galleries,
showcase films and OG cards moved out of `public/` into a top-level `heavy/`
directory Vite never copies, served from
`https://darkpandawarrior.github.io/cv` through one
[`heavy()`](src/lib/assetBase.ts) helper. Vercel's free tier caps deployment
storage at 10 GB and this site redeploys on every merge to main; moving
~251 MB off it dropped `dist/client` to about 25 MB.
[`distSize.test.ts`](src/data/distSize.test.ts) gates it going forward: no
file over 2 MB outside the hashed `assets/` bundles, the whole directory
under 60 MB. `scripts/publish-heavy-assets.mjs` rsyncs `heavy/` into the
sibling Pages checkout (a no-op if it isn't checked out);
`VITE_HEAVY_ASSET_BASE=/` in `.env.local` points local dev back at `heavy/`
directly.

Generators refuse to make things worse. A fetch that succeeds and returns
nothing is not treated as truth: `gen-chess-stats.mjs`, `gen-timeline.mjs` and
`gen-repo-stats.mjs` each compare against what is already committed and decline
to write a smaller number, because an empty success once deleted three real
chess ratings. `scripts/lib/net.mjs` gives every fetch a timeout and bounded
retries, since a stalled socket never rejects and hung the build for ten
minutes.

## Updating content

Edit [src/data/profile.ts](src/data/profile.ts), then regenerate:

```bash
npm run gen:system-prompt
```

**Do not hand-edit `api/_lib/system-prompt.ts` or `api/_lib/jd-prompt.ts`**,
both are generated from `profile.ts` and say so in their first line. Editing
them directly gets silently overwritten on the next build, and the page and
Panda drift apart. The generator is what keeps them in sync.

Adding a route? One entry in [src/data/surfaces.ts](src/data/surfaces.ts) and
one file in `src/routes/`. The wall, the launcher, the palette, the terminal,
the sitemap, the `<head>` and the assistant all pick it up; the gates fail the
build if you do only half of it.
