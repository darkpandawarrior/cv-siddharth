# Perf budgets: the owner-run checks

> **Sections 1 and 2 below describe the pre-`9246c74` deployment**, when the
> five WASM apps shipped inside `dist/client` from `public/<slug>-app/` and
> counted against Vercel's own bandwidth cap. They now live in the top-level
> `heavy/` directory (never copied into `dist/client`) and are served from
> `https://darkpandawarrior.github.io/cv` instead — see `src/lib/assetBase.ts`
> and `docs/deploy-playbook.md`'s "Frontend WASM embeds" section for the
> current path, and `scripts/check-budget.mjs` / `budgets.json`'s
> `totalDeploySizeBytes` (60 MB ceiling, ~23 MB measured) for the number that
> replaced the Vercel-bandwidth math below. `vercel.json` no longer carries a
> per-app `Cache-Control` block for these paths — GitHub Pages has no
> equivalent (no custom response headers on the free tier) — so section 1's
> Brotli/immutable-cache check no longer applies to production traffic;
> `scripts/check-cdn-encoding.mjs` is unrun on this origin and its own header
> would need updating before anyone runs it again. Left as a historical record
> rather than rewritten in place, since the actual bandwidth math (GitHub
> Pages' own limits, not Vercel's) hasn't been measured yet.
>
> **2026-09-08:** `heavy/kursi-app`, `heavy/mileway-app` and `heavy/deadlock-app`
> were renamed to `gaddi-app`, `doori-app` and `stutter-app`
> (`scripts/check-cdn-encoding.mjs`'s `APPS` list and `src/lib/assetBase.ts`'s
> `WASM_APP_PATH` already reflect this). The tables and command output below
> quote the old names because they are a record of a run against the old
> folders — re-run `scripts/check-cdn-encoding.mjs` and `du -sk heavy/*-app`
> after the next deploy for numbers under the new names.

Two of the perf claims in `lighthouserc.json` and `vercel.json` are properties
of the deployed edge, not the codebase — nothing in CI can assert them, because
CI never talks to production. This file is where their results get written
down instead of just asserted. Re-run both after any deploy that touches
`vercel.json`'s headers or adds a sixth bundled WASM app.

## 1. Brotli on the five bundled WASM apps

`vercel.json` gives all five embedded WASM apps (`kursi-app` = Gaddi,
`paymentslab-app`, `mileway-app` = Doori, `portfolio-app`, `deadlock-app` =
Stutter) `Cache-Control: public, max-age=31536000, immutable`. Immutable
caching only pays off if the bytes it's caching are actually small — an
immutably-cached uncompressed multi-megabyte `.wasm` file is still a
multi-megabyte download on the first visit, just a slow one that then never
re-checks.

`scripts/check-cdn-encoding.mjs` confirms `Content-Encoding: br` on a live
request against each app's actual (content-hashed) `.wasm` file:

```
node scripts/check-cdn-encoding.mjs
```

**Result, run 2026-09-07 against `https://cv-siddharth.vercel.app`:**

```
OK                             kursi-app        status=200 content-encoding=br cache-control="public, max-age=31536000, immutable"
OK                             paymentslab-app  status=200 content-encoding=br cache-control="public, max-age=31536000, immutable"
OK                             mileway-app      status=200 content-encoding=br cache-control="public, max-age=31536000, immutable"
STALE (hash not deployed yet)  portfolio-app    status=404 content-encoding=br cache-control="public, max-age=31536000, immutable"
OK                             deadlock-app     status=200 content-encoding=br cache-control="public, max-age=0, must-revalidate, s-maxage=31536000"
check-cdn-encoding: every reachable WASM file served Brotli-encoded.
```

Four of five resolved and came back Brotli-encoded. `portfolio-app` 404'd
because this branch's local build hash isn't the one currently live on
production — expected for a branch ahead of `main`, not a Brotli defect (the
script tells the two apart and only fails the ones that are actually
reachable and NOT `br`). Re-run after the next deploy to confirm all five,
`portfolio-app` included.

`deadlock-app`'s `index.wasm`/`index.pck` deliberately carry
`s-maxage=31536000` without the literal `immutable` keyword — see
`vercel.json`'s own entries for those two paths; that's an existing,
intentional exception (a revalidatable long cache, not a missed immutable
tag), not something this check treats as a failure.

## 2. Fleet-wide monthly bandwidth vs. the Hobby 100GB/mo cap

The per-URL Lighthouse budgets (`total-byte-weight`, `resource-summary:script`)
already gate a single page load. They say nothing about the aggregate: five
WASM apps embedded live, all on one Hobby-tier Vercel project sharing one
100GB/mo bandwidth allowance.

**Measured, 2026-09-07** (`du -sk public/<app>`, on-disk — a same-order proxy
for wire bytes; none of these five carry the duplicate-asset bloat that made
Stutter's own naive export 310MB before it was trimmed, so on-disk is a fair,
slightly conservative stand-in for what actually crosses the wire):

| App | Project | On-disk | Documented wire cost |
|---|---|---:|---|
| `mileway-app` | Doori | 12.3 MB | — |
| `paymentslab-app` | PaymentsLab-KMP | 12.9 MB | — |
| `kursi-app` | Gaddi | 14.8 MB | — |
| `portfolio-app` | Portfolio Twin (CMP) | 15.8 MB | 14.7 MB (profile.ts metric) |
| `deadlock-app` | Stutter | 64.8 MB | ~36 MB over the wire, biggest file 38 MB (profile.ts comment) |

Worst realistic single-visit cost (one visitor opening the heaviest app,
Stutter) is ~36MB. At 100GB/mo (102,400 MB) that alone allows roughly **2,800
full Stutter loads a month** before the cap binds — and a visitor loading
Stutter is already the worst case; the other four are each under half that
cost. `@vercel/analytics` is now wired up (`<Analytics />` in `__root.tsx`),
but a fresh mount has zero history — there's no real per-app view count to
multiply against this yet, only what it collects from here on. This
portfolio's total traffic is recruiter/interview-driven, not a consumer
product's: realistically dozens to low hundreds of visits a day fleet-wide,
and only a fraction of those ever scroll to a project's live embed rather
than looking at the screenshots above it.

**Decision:** keep all five apps on the one deploy for now. The margin above
is wide enough (thousands of full-Stutter loads before the cap binds, against
a plausible traffic ceiling of maybe a few hundred WASM-embed opens a month)
that splitting Stutter into its own Vercel project would be solving a problem
that isn't measured to exist. Revisit this once `@vercel/analytics` has
enough history to check it against: if combined WASM-embed bandwidth trends
toward ~20GB/mo (a fifth of the cap — leaving
headroom for the rest of the site plus growth), move `deadlock-app` (Stutter),
the heaviest single app at roughly half the fleet's combined bytes, to its own
Vercel project first — it's already the one deployment target vercel.json
gives bespoke cache-control treatment to, so it's the natural first split.

## 3. LCP gate: still `warn`, on purpose, not touched here

`lighthouserc.json`'s own header already documents why
`largest-contentful-paint` stays `warn` at 3500ms instead of `error` at 2500ms:
every number on file came off a developer laptop (benchmarkIndex ~4000)
against a 2-core GitHub Actions runner, where LCP will measure materially
worse. Promoting it needs one calibration run **on the runner itself** — a
number from this machine would just be a second developer-laptop reading, not
the calibration the file is waiting on, and flipping the gate without it risks
exactly the failure the header warns about: "an error there would be red on
the first CI run." Left as `warn`; see `## Deliberately not fixed / not
verified` in this lane's PR for the reasoning in full.
