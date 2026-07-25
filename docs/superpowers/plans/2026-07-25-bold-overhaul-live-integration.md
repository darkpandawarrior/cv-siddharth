# Bold overhaul + live-integration — phased implementation plan

> **For agentic workers:** this is a PHASED plan across 5 workstreams. A fresh session should expand each phase into bite-sized TDD tasks via `superpowers:writing-plans`, then execute with `superpowers:subagent-driven-development` + per-task review (implementer → adversarial review → fix loop) and a final whole-branch review — exactly the playbook that made the TanStack Start migration solid (it caught ~10 real bugs). Design is `docs/superpowers/specs/2026-07-25-bold-overhaul-live-integration-design.md`.

**Goal:** Elevate the migrated TanStack Start site from polished to signature — router-native internal navigation, a bold-but-tasteful motion/visual overhaul, modern-site capability completeness, live integration of every showable project, and measured perf work.

**Base:** branch `worktree-tanstack-start-migration` at/after the migration (HEAD `1205bf9`+). `main` untouched; owner controls deploy.

## Global constraints (bind every phase)
- React + TanStack Start stays; no runtime rewrite.
- Every animation has a `prefers-reduced-motion: reduce` off-switch; no motion that regresses LCP/CLS; WCAG AA contrast on all text.
- No auto-triggered production deploys — owner triggers all deploys.
- Content-forward, never gated (`SIDOS-VISION.md`).
- Keep the green gate: `tsc -b` + `lint` + Vitest + Playwright + LHCI budget green after every phase.
- Browser-verify at 375/768/1024/1440/1920.
- Exact-pin any new dependency (repo convention).

---

## Phase A — Router-native internal navigation (do FIRST; unblocks clean nav)

**Why first:** everything else navigates; get it correct before layering motion/features on top.

- **A1.** Extract a shared `scrollToSection(id: string)` + `navigateToSection(id)` helper (new `src/lib/navigation.ts` or similar) that both `HashCompat` (`__root.tsx`) and all internal nav import — ONE implementation of "on home → smooth-scroll; off home → navigate to `/` then bounded-poll scroll" (reuse the existing `scrollSectionIntoView` poll). Unit-test the on-home vs off-home branch.
- **A2.** Convert route-target links (`#resume`, `#project/<slug>`, `#terminal`, `#lab`, `#blueprint`, `#compose`, `#map`, `#forge`, `#playground`, `#loopdown`) to `<Link to=...>` / `useNavigate()` across `SiteFooter.tsx`, `CommandPalette.tsx`, `ProjectDetail.tsx`, `Terminal.tsx` (`exit`/`sudo hire`), `Playground.tsx`/`RoomFrame`, `LabBench.tsx`, `WritingView.tsx`, `ResumeView.tsx`, `BlueprintRoom.tsx`, `ComposePlayground.tsx`, `StoryMap.tsx`, `FieldNotes.tsx`, `WritingSection.tsx`, `labs/*.tsx`. (~26 `<a href>` + the `goHash`/`go` handlers among the 74 sites.)
- **A3.** Convert home-section links (`#top/#work/#projects/#experience/#skills/#contact/#source/#writing`) to the `scrollToSection`/`navigateToSection` helper.
- **A4.** Convert module-level `openChat`/`openLab`/backtick-terminal-summon to router `navigate` instead of `window.location.hash`.
- **A5.** Slim `HashCompat` to ONLY the initial-load external-inbound redirect (`#route`, `#project/`, `?project=`); remove the internal-nav `hashchange` path once nothing internal sets the hash. Keep external legacy links working (Playwright: hit `/#project/mileway` and `/?project=kursi`, assert redirect to `/project/mileway`).
- **A6.** Playwright: footer + command-palette + an in-app back-link from a NON-home route each reach the right target with no `/#...` bounce.
- **Acceptance:** `grep -rn 'location.hash *=\|href="#' src/ --include=*.tsx` (minus `__root.tsx` external handling + genuine on-page anchors) is empty; no `/#...` bounce in the URL on any internal click.

## Phase C-foundation — a11y, SEO, robustness (correctness before flourish)

*(Runs before B so the bold layer is built on an accessible, crawlable, robust base.)*
- **C1.** Designed 404: `src/routes/$.tsx` catch-all in the control-room aesthetic + route-level error boundaries with on-brand fallback; on-brand Suspense fallbacks for heavy routes.
- **C2.** a11y AA pass: skip-to-content link; accent-matched `:focus-visible` rings site-wide; heading order per route; `aria-label` on all icon-only buttons (nav chat/search, palette, lab controls); TalkBack/VoiceOver spot-check; keyboard-only operability of command palette, labs, chat. Add axe checks to Playwright.
- **C3.** SEO/structured data: port per-project `SoftwareSourceCode` JSON-LD onto `/project/$slug` head() (the F2 follow-up); add `BreadcrumbList` JSON-LD to project pages; re-verify sitemap/robots/canonical/OG.
- **C4.** RSS/Atom: `scripts/gen-feed.mjs` from `writing.ts`, wired into the generator pipeline (`prebuild`/`refresh`), linked from `<head>` + the Loopdown.
- **C5.** PWA: manifest polish + service worker (Vite PWA plugin, exact-pinned) — precache shell + fonts, runtime-cache images, network-first for WASM apps and `/api/chat`; installable; offline shell. Verify no SSR/hydration conflict with TanStack Start.
- **C6.** Share/print: Web Share API native sheet for `/project/$slug` where available (extend `ShareProject`); print styles for project case studies (résumé print exists).

## Phase B — Bold visual + motion overhaul (the headline)

- **B1.** Motion tokens in `@theme` (easings `--ease-out-expo/-spring/-quart`, durations `--dur-fast/base/slow`); replace ad-hoc timing values. Extend the `prefers-reduced-motion` CSS guard to any new keyframes.
- **B2.** Shared-element (View Transitions) morphs: `view-transition-name` on card→detail hero image, nav wordmark, résumé button. Verify smooth in Chromium/Safari 18+, graceful no-op elsewhere, off under reduced-motion.
- **B3.** Scroll-reveal cohesion: standardize `Reveal.tsx` across all home sections with consistent stagger + new easing; ensure `AnimatedMetric` count-up fires once on reveal.
- **B4.** Micro-interactions: magnetic/tilt on primary CTAs + project cards (`TiltCard`/`TiltPhone`), refined `CursorAura`, nav hover glow, accent focus rings. Consistent, not noisy.
- **B5.** Hero elevation: fix particle-sphere/headline composition at ALL breakpoints; more expressive cursor reactivity. **DONE** (commit `5d32509`): mobile `<1024px` sphere-over-headline overlap fixed (retuned particle band + text-shadow scrim, shimmer excluded), cursor amplitude tuned.
  - **WebGPU 3D upgrade — DEFERRED (decision recorded 2026-07-25):** the `ParticleHeroScene` → Three `WebGPURenderer` / R3F v10 migration was NOT done and is deferred. Reasons: (1) R3F v10 was ~alpha/95%-complete at the migration's writing and its exact stability needs re-verifying on npm before adopting (`@react-three/fiber` stays `^9.6.1`, `three` `^0.185.1`); (2) it's a visual/GPU change that genuinely needs pixel-and-motion verification the constrained execution environment couldn't provide — shipping an unverifiable renderer swap would be reckless. Revisit as its own focused pass when R3F v10 is confirmed stable AND with real visual verification. (Same "documented why-not" treatment as D1's HireSignal playbook.)
- **B6.** Per-section polish pass (Metrics, CaseStudies, Projects grid, Experience/TimelineSpine, Skills, Writing, Contact) — elevation, rhythm, the control-room telemetry motif, off the uniform card-stack per `SIDOS-VISION.md`.
- **B7.** Responsive + reduced-motion + keyboard verification at all 5 breakpoints; screenshots for owner review.

## Phase D — Live-project integration

- **D1.** HireSignal live — **READY PLAYBOOK (probed 2026-07-25, build not run here — bleeding-edge alpha toolchain makes a first build long + uncertain; run it where the KMP toolchain is warm, e.g. the owner's machine or a fresh session with time budget):**
  - Repo `~/Repos/Android/HireSignal`; the wasmJs client is the **`:webApp`** module (`webApp/build.gradle.kts`: `wasmJs { browser(); binaries.executable() }`). Toolchain: Kotlin `2.4.20-Beta1`, AGP `9.4.0-alpha04`, Gradle `9.6.1` (wrapper present), JDK 25 available (verify AGP-9-alpha accepts JDK 25; fall back to JDK 21 if it rejects it).
  - Build: `cd ~/Repos/Android/HireSignal && ./gradlew :webApp:wasmJsBrowserDistribution` (the executable `browser()` target's distribution task; confirm the exact name via `./gradlew :webApp:tasks --all | grep -i distribution` — it's the one producing the runnable browser bundle, not `wasmJsJar`).
  - Output lands at `webApp/build/dist/wasmJs/productionExecutable/` (Kotlin/Wasm convention). Copy it to `cv-siddharth`'s `public/hiresignal-app/` (mirror how kursi/mileway/paymentslab-app dirs are structured — an `index.html` + the `.wasm`/`.js`/resources).
  - Wire-up in cv-siddharth: add `liveUrl: "/hiresignal-app/index.html"` to the HireSignal record in `src/data/profile.ts` (only AFTER the dir exists, or the intersection-gated embed 404s), add a `{ "source": "/hiresignal-app/(.*)\\.wasm", "headers": [Cache-Control immutable] }` block to `vercel.json` (matching the other three), and the `ProjectDetail` live-preview will pick it up (it's data-driven off `liveUrl`).
  - Measure the added weight (~16-18MB like the others) and keep it intersection-gated; if it pushes the Vercel Hobby bandwidth picture, it's the candidate for a separate deploy (D3) or the Cloudflare escape hatch (D4).
- **D2.** Verify every project is reachable + live-or-device-framed from projects grid + command palette + footer + 3D storyboard; fix any DeviceWall/embed broken post-migration.
- **D3.** Backend-deploy playbook (owner-run, documented, NOT auto-triggered): per-project steps to deploy a live backend (HireSignal Spring server, PaymentsLab live gateways) to Vercel/Fly/Render, and the code to embed/link it once the owner supplies a URL.
- **D4.** Bandwidth guardrail: with 3-4 bundled WASM apps (~50-70MB), confirm lazy-loading holds; document the Cloudflare-portability escape hatch (Nitro preset swap) if the Hobby 100GB/mo cap nears.

## Phase E — Perf / infra (measured LAST, against the finished site)

- **E1.** LCP defer — **DONE** (commit `60db79f`): 3D hero mount gated behind `load` + `requestIdleCallback` so the headline paints first; the FCP→LCP contention gap collapsed 2105ms → 723ms (the real three.js-competition fix). **LCP budget kept `warn`, NOT flipped to `error` — decision recorded 2026-07-25:** the residual ~5s LHCI number is a *measurement artifact*, not a real regression — `npm run serve` (`vite preview`) serves the SSR HTML with `content-encoding: identity` (uncompressed), inflating throttled LCP; the unthrottled control LCP is **253ms** and production (Vercel Brotli) is unaffected. Flipping to `error` would hard-fail CI on this preview-only artifact, so `warn` is the honest state. **Unlock path (future):** add a gzip/brotli middleware to the `vite preview` server (a `configurePreviewServer` plugin), re-measure realistic LCP, THEN flip to `error` at a real threshold. Until then, JS-bloat regressions are still caught by the `resource-summary:script:size` error budget below.
- **E2.** LHCI URLs — **DONE** (commits `60db79f` + this): both `/lab` and `/blueprint` are in the LHCI URL set. **Caveat (recorded):** the 1.6MB tldraw chunk is **interaction-lazy** (loads only when the user interacts with the Blueprint canvas), so NO url-only Lighthouse run loads it — `/blueprint`'s initial-load JS is ~477KB. The `script:size` error budget (1.8MB) therefore guards *initial-load* JS on the heaviest routes, which is the meaningful guard for a url-only tool; truly measuring the tldraw chunk would need interaction-driven profiling, out of LHCI's model.
- **E3.** Caching: confirm Vite-fingerprinted assets serve `immutable`; confirm Brotli on WASM post-deploy (owner-verify).
- **E4.** Monitoring: keep Speed Insights; optionally add Vercel Web Analytics + Sentry error tracking (owner opt-in).
- **E5.** Final whole-branch review (5-lens adversarial, as the migration did) + green gate, then hand to owner for merge/deploy.

## Self-review notes
- Every phase is independently shippable + reviewable; A unblocks the rest; E measures last.
- No placeholders: the two "verify the exact X at execution time" items (R3F v10 npm status, HireSignal Gradle task name) are genuine execution-time checks, not missing content.
- Owner-decision items (separate deploys, analytics opt-in) are flagged, not assumed.
