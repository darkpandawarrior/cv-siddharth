# TanStack Start migration — design spec

Date: 2026-07-24
Status: approved, ready for implementation plan

## Problem

The site runs on a Vite 7 SPA with hand-rolled hash routing (`useHashRoute()` in
`App.tsx`). That was the right call at the time, but it caps the site in ways
that now matter:

- Every route (`#/projects/mileway`, `#/resume`, `#/lab-bench`) is client-only —
  no HTML content until the JS bundle executes, no per-route `<title>`/OG tags,
  invisible to any crawler that doesn't execute JS. A shared link to a specific
  project always previews as the homepage.
- `TypeScript 5.9`, `Vite 7`, plain React 19 without the compiler — all solid,
  none of it bleeding-edge anymore now that TypeScript 7.0 (native Go compiler,
  GA July 8 2026) and React Compiler 1.0 (stable since Oct 2025) exist.
- Zero tests in the repo. Fine for incremental feature work; not fine for a
  full framework migration.
- Deploy is split across GitHub Pages (static, primary "Live" link in the
  README) and Vercel (dynamic, hosts the chat function) — an artifact of Pages
  not supporting serverless functions. Once routing needs real SSR, this split
  stops making sense.
- Images are 190 PNGs / 4 WebP (~20MB), fonts load from the Google Fonts CDN
  despite preconnect — both easy wins that were just never revisited.

## Goals

- Real per-route URLs with server-rendered first paint for
  content/SEO-relevant pages (home, resume, project case studies).
- Keep every existing interactive surface (3D scenes, tldraw canvas, Compose
  Playground, Lab Bench and its labs, WASM app embeds) working exactly as
  today — this migration rewrites the *shell*, not the components.
- Push the toolchain to what's actually current as of July 2026: TypeScript
  7.0, React Compiler 1.0, Three.js WebGPURenderer, Vite 8.
- Single deploy target (Vercel), single canonical URL, GitHub Pages retired.
- A regression net (minimal tests) given the size of the change.
- Ship the two concrete, already-identified asset wins (images, fonts) as
  part of the same pass, since they touch the same build pipeline.

## Non-goals

- No UI-runtime change — React stays. (Considered Qwik/SolidStart; rejected:
  R3F and tldraw have no non-React bindings, so leaving React means rewriting
  the 3D scenes and either dropping or awkwardly islanding the tldraw canvas.
  Also rejected Next.js/RSC-first: this site is majority client-interactive —
  labs, playgrounds, 3D — and RSC's server-first model fights that shape more
  than it helps it.)
- No content/feature changes. The in-flight Lab Bench work (`src/labs/*`,
  `LabBench.tsx`) is assumed merged before this starts — it lands first, in
  another session.
- No analytics/observability build-out beyond Vercel Speed Insights, no
  accessibility audit, no full test-coverage push. Real follow-ons, kept out
  of this spec's scope deliberately.
- No custom domain / alternate hosting provider work now — deferred until
  there's a domain to point.

## Architecture

### Framework

Replace the Vite SPA shell with **TanStack Start**
(`@tanstack/react-start`, built on TanStack Router + Nitro). Vite-native
under the hood (now Vite 8 — `@vitejs/plugin-react` v6 moved off Babel onto
oxc for the JSX transform/Fast Refresh). React stays at 19.2.

Every existing component carries over as-is: Blueprint3D, ComposePlayground,
Terminal, SketchBoard (tldraw), StoryMap, the Lab Bench and its labs, the
particle hero. The migration touches routing, the render shell, build config,
and the chat backend's host — not component internals.

### Routing

`useHashRoute()` (`App.tsx:126`) → TanStack Router's file-based, fully-typed
routing under `src/routes/`. Every project, the resume view, and top-level
sections get a real URL and their own `<title>`/OG meta, generated per-route.
This is what fixes the share-preview/SEO gap.

### Rendering strategy — SSR opt-in per route

TanStack Start makes SSR additive (opt in per route) rather than assumed
(Next.js's RSC-first model, rejected above for exactly this reason):

- **SSR'd:** home/hero, resume view, project case-study pages — content that
  benefits from server-rendered first paint and needs to be crawlable/shareable.
- **Client-only, unchanged loading pattern:** Lab Bench + labs, Compose
  Playground, Blueprint3D, SketchBoard, particle hero — already fully
  interactive/canvas-driven; SSR would add cost with no benefit. Still
  `lazy()` + `Suspense`, same as today.

### 3D / graphics

Migrate R3F scenes to **Three.js WebGPURenderer** (stable since r171,
auto-fallback to WebGL2 for unsupported browsers). R3F v10 added first-class
WebGPU + TSL support and was ~95% complete as of Feb 2026 — **verify its
exact release status on npm at implementation time**; fall back to the `gl`
prop factory pattern on R3F v9 if v10 isn't fully stable when this is built.

### AI chat backend

`api/_lib/chat-handler.ts` is already a pure web-standard
`Request → Promise<Response>` function with zero framework coupling — ports
directly into a TanStack Start server route. Multi-provider streaming logic
(Groq/Gemini/Anthropic) is unchanged, just re-hosted. **Keep it on the Edge
runtime explicitly** (not Node serverless) — Vercel Hobby's Node serverless
functions cap at 10s per invocation, which a longer streamed LLM response can
exceed; Edge functions don't share that cap.

### Build tooling

- **TypeScript 7.0** (GA, native Go compiler) — same syntax as 5.9, 8–12x
  faster `tsc`/editor checking.
- **React Compiler 1.0** via the `reactCompilerPreset` helper (requires
  `@rolldown/plugin-babel` + `babel-plugin-react-compiler` + `@babel/core` —
  the old `react({ babel: {...} })` pattern no longer works on
  `@vitejs/plugin-react` v6). Removes the need for manual `useMemo`/
  `useCallback` audits.
- Tailwind v4 stays as-is — already current, no change needed.

### Hosting — Vercel, chosen deliberately

Compared against Cloudflare Pages/Workers on this project's actual profile
(heavy static WASM/video assets, streaming SSE chat, personal/non-commercial
traffic):

| | Vercel Hobby (free) | Cloudflare Pages/Workers (free) |
|---|---|---|
| Bandwidth | 100GB/mo | Unlimited (static assets) |
| Runtime | Node.js (broad npm compat) | `workerd`/V8 isolates (narrower compat) |
| TanStack Start setup | Zero-config, auto-detected | Manual: `@cloudflare/vite-plugin` + `wrangler` |
| Function limits | 100 fn-hours/mo, 10s/invocation (Node) | 100k req/day, 10ms CPU/req |
| Personal-use terms | Explicitly allowed | Allowed |

Vercel wins for now: zero-config TanStack Start support, Node runtime
compatibility with the heavy deps already in use (three.js, tldraw, sharp),
and it's already the canonical URL (`cv-siddharth.vercel.app`, hardcoded into
`index.html`'s OG/canonical tags today). Cloudflare's unlimited static-asset
bandwidth is the real advantage if traffic ever meaningfully grows past the
100GB/mo Vercel cap (plausible given the WASM embeds are 16–18MB each) —
**this is not a one-way door**: TanStack Start's Nitro layer produces a
portable server bundle, so moving to Cloudflare later is a preset swap
(`nitro-cloudflare` vs `nitro-vercel`), not a rewrite. Keep server code
Nitro-portable — avoid anything Vercel-proprietary beyond what Nitro already
abstracts.

**Deploy config, done properly this time:**
- Retire `.github/workflows/deploy-pages.yml` entirely.
- Update `index.html`'s canonical/OG URLs and `README.md`'s "Live" link —
  both already point at `cv-siddharth.vercel.app`, so this is mostly
  confirming, not changing.
- Carry over `vercel.json`'s WASM immutable-cache headers; confirm Vercel is
  serving them Brotli-compressed post-migration (should be automatic, verify
  rather than assume).
- Pick the Vercel function region deliberately at setup time rather than
  accepting the default, given the audience is recruiters/interviewers
  (verify current region options and any Hobby-plan restrictions then).

## Performance & asset optimization

Grounded in actual numbers checked in this repo, not estimates:

- **Images:** 190 PNGs / 4 WebP in `public/`, ~20MB raw. Add
  `scripts/gen-images.mjs` (sharp) to the existing generator pipeline
  (`npm run refresh` / `prebuild`, same pattern as `gen-galleries.mjs` /
  `gen-og.mjs`) — converts to AVIF with WebP fallback at build time. No
  runtime image-CDN dependency.
- **Fonts:** currently Google Fonts CDN (`index.html:40-45`) despite
  preconnect — still an extra external round-trip. Self-host via
  `@fontsource` for the 4 families in use (Space Grotesk, Inter, Rozha One,
  JetBrains Mono), preload only the critical weight, `font-display: swap`.
- **Video:** already good — `ShowcaseFilm.tsx` uses `IntersectionObserver` +
  `preload="metadata"`. No change.
- **WASM embeds:** already intersection-observer-gated in `ProjectDetail.tsx`.
  No change; just confirm Brotli serving post-migration (see Hosting above).
- **Bundle audit:** `SketchBoard` is the largest JS chunk today (1.6MB,
  tldraw-driven). Investigate tldraw's tree-shaking/sub-feature options at
  implementation time — not committing to a specific size reduction without
  having looked at what's actually pulling that weight in.
- **Continuous benchmarking, not a one-off measurement:** add **Lighthouse
  CI** (`@lhci/cli`) as a GitHub Actions step with a performance budget (fails
  the build on LCP/bundle-size regression), plus **Vercel Speed Insights**
  (`@vercel/speed-insights`, one-line official package) for real-user Core
  Web Vitals field data post-deploy.

## Testing

Nothing exists today; adding a minimal regression net sized to the migration,
not a full suite:

- **Vitest** for non-trivial pure logic: the chat-handler's provider
  normalization, `composeInterpreter.ts`, `blueprintPersistence.ts`.
- **Playwright smoke test:** one test hitting each top-level route (home,
  resume, a project detail, a lab) asserting it renders with no console
  errors — catches exactly the class of thing a framework migration breaks.

## Sequencing

1. In-flight Lab Bench work merges first (separate session, per owner).
2. Framework/routing/build-tooling swap as one pass — touches every route by
   nature, done together.
3. WebGPU 3D upgrade as a second, separable pass — lower risk to sequence
   after the shell is stable.
4. Hosting consolidation (retire GH Pages) lands with step 2, since the new
   shell needs a real server either way.
5. Asset optimization (images/fonts) and the testing net can land alongside
   step 2 — same build pipeline, low coupling to the routing work itself.

## Definition of done

`npm run build` + `tsc --noEmit` + `lint` + the new Vitest/Playwright suites
green · every route SSR/CSR classification matches the plan above ·
Lighthouse CI budget passing · GitHub Pages workflow removed · README/canonical
URLs confirmed · owner controls final deploy.
