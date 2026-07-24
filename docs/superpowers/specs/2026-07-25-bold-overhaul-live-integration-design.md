# Bold overhaul + live-project integration — design spec

Date: 2026-07-25
Status: approved direction, ready for implementation plan
Owner decisions locked (this session):
- **Live integration:** bundle-static + separate-deploy ONLY backend-needing projects. Owner triggers any separate deploys.
- **Design latitude:** bold — elevate ambitiously with designer judgment, show screenshots to react to.
- **Execution:** run as a focused effort with a spec + phased plan + per-change review (same playbook as the TanStack Start migration).

## Context

The site (`cv-siddharth`) just completed a full migration to **TanStack Start** (React 19.2 + React Compiler, TypeScript 7, Vite 8), on branch `worktree-tanstack-start-migration` (29+ commits, `main` untouched, all gates green). This spec is the NEXT effort: a bold UI/UX + animation overhaul, "everything a site can do" capability completeness, proper internal-navigation architecture, and live integration of every showable project — layered on top of the migrated codebase.

The design is already a sophisticated **control-room system** (`src/index.css` `@theme`): Android-green (`#3ddc84`) + cyan (`#5ee6ff`) accents, space-ink grounds (`--color-void` `#05070a`), glass/elevation tokens, a fluid type/space scale, `::view-transition` support, `prefers-reduced-motion` guards, and a keyframe library (hero-shimmer, cta-breathe, circuit-run, cell-flash). So "bold" means **elevation of a strong base**, not rescue. Do not flatten or replace what already works; raise its ceiling.

## The five workstreams

### A. Router-native internal navigation (architecture correctness)

**Problem:** 74 internal hash-nav call sites across 17 files (`CommandPalette.tsx`, `SiteFooter.tsx`, `App.tsx`, `ProjectDetail.tsx`, `Terminal.tsx`, `Playground.tsx`, `LabBench.tsx`, `WritingView.tsx`, `WritingSection.tsx`, `ResumeView.tsx`, `BlueprintRoom.tsx`, `ComposePlayground.tsx`, `StoryMap.tsx`, `FieldNotes.tsx`, `labs/*.tsx`) still navigate via `#hash` + `window.location.hash`. Post-migration these reach the real routes ONLY by bouncing through the `HashCompat` shim in `__root.tsx` — a compat layer meant for *external* legacy links (LinkedIn Featured, old shared URLs), now load-bearing for *primary* internal navigation. Every internal click incurs a hash-then-redirect bounce, and any hash the shim doesn't recognize silently strands the user (already hit twice: F1, and the `source`/`writing` omission fixed this session at commit `1205bf9`).

**Goal:** internal navigation uses the router directly; `HashCompat` reverts to *only* handling genuinely-external legacy inbound links.

**Approach:**
- **Route targets** (`#resume`, `#project/<slug>`, `#terminal`, `#lab`, `#blueprint`, `#compose`, `#map`, `#forge`, `#playground`, `#loopdown`) → real router navigation: `<Link to="/resume">`, `<Link to="/project/$slug" params={{slug}}>`, `useNavigate()` in handlers. ~26 `<a href="#route">` sites + the CommandPalette `goHash` route entries + `openLab`-style handlers.
- **Home-section targets** (`#top`, `#work`, `#projects`, `#experience`, `#skills`, `#contact`, `#source`, `#writing`) → a shared `scrollToSection(id)` helper: if on `/`, smooth-scroll natively; if on a non-home route, `navigate({ to: "/", hash: id })` and scroll after mount (reuse the bounded-poll pattern already in `__root.tsx`'s `scrollSectionIntoView`). Extract that helper so HashCompat and the internal nav share ONE implementation.
- **Backtick terminal summon** (`HomePage` effect) and `openLab`/`openChat` module functions → router `navigate`, not `location.hash`.
- After conversion, `HashCompat` keeps ONLY: the initial-load redirect for external `#route`/`#project/`/`?project=` inbound links (so old shared/LinkedIn links still work). Its `hashchange` listener for internal nav can be removed once nothing internal sets the hash.

**Acceptance:** `grep -rn 'location.hash *=\|href="#' src/ --include=*.tsx` (excluding `__root.tsx`'s external-inbound handling) returns only genuine on-page anchor uses; every nav surface (footer, command palette, in-app back-links, terminal `exit`/`sudo hire`, project cross-links, lab cross-links) reaches its target with no `/#...` bounce in the URL bar; Playwright nav tests cover footer + command-palette + a couple of in-app back-links from a non-home route.

### B. Bold visual + motion overhaul (the "wow", elevated tastefully)

**Goal:** raise the site from "polished" to "signature" — a coherent motion language and a few genuinely memorable moments, without hurting legibility, performance, or reduced-motion users.

**Motion system (define once, apply everywhere):**
- Add motion tokens to `@theme`: a small easing set (`--ease-out-expo`, `--ease-spring`, `--ease-out-quart`) and duration scale (`--dur-fast/base/slow`). Replace ad-hoc `ease`/`0.18s` values so motion is consistent.
- **Shared-element transitions:** now that `defaultViewTransition: true` is on (migration), add `view-transition-name` to the elements that persist across routes — the project card → project hero image (card-to-detail morph), the nav wordmark, the résumé button. This is the single highest-impact "cutting-edge" moment; Chrome/Edge/Safari 18+ support it, others no-op gracefully.
- **Scroll-reveal cohesion:** `Reveal.tsx` exists; standardize its use across ALL home sections with a consistent stagger + the new easing, and a reduced-motion no-op. Metrics count-up (`AnimatedMetric.tsx`) already exists — ensure it fires on reveal, once.
- **Micro-interactions:** magnetic/tilt on primary CTAs and project cards (`TiltCard.tsx`/`TiltPhone.tsx` exist — apply consistently), refined `CursorAura` presence, nav link underline/glow on hover, focus-visible rings that match the accent system (a11y + aesthetic).

**Signature moments (pick and polish, don't overload):**
- **Hero:** the particle sphere (`ParticleHeroScene`) currently overlaps the headline at some widths (observed). Fix the composition so text and sphere coexist at every breakpoint (the migration already has a "sphere fits dynamically" fix — verify + extend), and make the sphere react to the cursor more expressively (already interactive per git log). Consider a WebGPU renderer path (Three r171+ `WebGPURenderer`, auto-fallback to WebGL2) as the deferred 3D-upgrade this migration explicitly postponed — this is where it lands.
- **Section transitions:** the `Circuit` divider already animates; extend the "control-room telemetry" motif tastefully (a live-feeling accent) without noise.
- **Case-study + project cards:** hover elevation + the card→detail shared-element morph (above).

**Guardrails (non-negotiable):** every animation has a `prefers-reduced-motion: reduce` off-switch (the CSS guard block exists — extend it to any new keyframes); no motion that hurts LCP or CLS; no autoplay that fights the content; maintain WCAG AA contrast on all text over animated backgrounds.

**Responsive:** verify + refine at 375 / 768 / 1024 / 1440 / 1920. The `SIDOS-VISION.md` doc already mandates this; hold to it. 3D/canvas degrade to static art on small/low-power devices.

### C. Capability completeness ("everything a site can do")

Audit against a modern-site checklist; implement what's missing, verify what exists:
- **Command palette (⌘K):** already rich (`CommandPalette.tsx`) — after Workstream A, ensure every route + project + action is reachable and fuzzy-searchable; add recent/frequent, and keyboard-only operability.
- **Keyboard + a11y (WCAG AA):** full keyboard nav, visible focus rings (accent-matched), skip-to-content link, correct heading order per route, `aria-label`s on icon buttons, `alt` on all imagery (Picture already carries it), TalkBack/VoiceOver spot-check, reduced-motion honored. This is both correctness and craft.
- **SEO/structured data:** port the per-project `SoftwareSourceCode` JSON-LD (retired with the `/p/` stubs) onto `/project/$slug` head() — the noted follow-up from F2. Verify sitemap (now `/project/<slug>`), robots, canonical, per-page OG (done in migration), and add `BreadcrumbList` JSON-LD for project pages.
- **PWA / offline:** add a web app manifest polish + a service worker (Workbox or a hand-rolled minimal SW via Vite PWA plugin) so the shell + last-viewed content works offline and the site is installable. Precache the static shell + fonts; runtime-cache images; leave the WASM apps network-first.
- **RSS/Atom for writing:** generate a feed from `writing.ts` (a `gen-feed.mjs` in the existing generator pipeline) so the Loopdown is subscribable.
- **Share + print:** the résumé print path exists; ensure Web Share API on mobile for project pages (ShareProject exists — extend to native share sheet where available), and print styles for project case studies.
- **Robustness:** route-level error boundaries + a designed 404 route (`src/routes/$.tsx` catch-all) matching the control-room aesthetic; graceful loading states (Suspense fallbacks already exist for heavy routes — make them on-brand); confirm the chat's provider-fallback + offline messaging is graceful.
- **Analytics:** Vercel Speed Insights is wired; add Vercel Web Analytics (privacy-friendly, one component) for real traffic insight if the owner wants it (opt-in).

### D. Live-project integration (bundle-static; owner triggers backend deploys)

**Locked approach:** bundle self-contained web builds into `public/<slug>-app/` and embed via the existing intersection-observer-gated live-preview (Kursi, Mileway, PaymentsLab already do this). Separate Vercel deployments ONLY for a project that needs its own live backend — documented as an owner-run playbook, not auto-triggered.

**Tasks:**
- **HireSignal live:** `Repos/Android/HireSignal` targets Web (wasmJs). Build its `wasmJsBrowserDistribution` (verify the exact Gradle task), copy the output to `public/hiresignal-app/`, add `liveUrl: "/hiresignal-app/index.html"` to its `profile.ts` record + a WASM immutable-cache header block in `vercel.json` (matching kursi/mileway/paymentslab), and wire the ProjectDetail live-preview. Note bundle-size impact (WASM builds are ~16-18MB; keep intersection-gated + confirm it fits the Vercel Hobby bandwidth picture, else this is a candidate for a separate deploy).
- **Backend-needing projects (playbook, owner-run):** HireSignal's Spring Boot server + PaymentsLab's live gateways, if a truly-live (not mock) demo is wanted, get their own Vercel/Fly/Render deployment. Deliverable here is a **documented, repeatable deploy playbook** per project + the code to embed/link it once the owner provides the URL — NOT auto-triggered deploys.
- **Completeness of linking:** every project reachable from the projects grid, command palette, footer, and the 3D storyboard; every "shown live where possible" surface actually wired; Android-only surfaces use the existing DeviceWall device-framed captures/videos (already built) — verify none are broken post-migration.
- **Bandwidth guardrail:** with 3-4 bundled WASM apps (~50-70MB total), confirm lazy-loading holds and consider moving the heaviest to a separate deploy if the Hobby 100GB/mo cap gets close (the Cloudflare-portability note from the migration's Nitro layer still applies as the escape hatch).

### E. Infra / perf / architecture / optimization

- **LCP:** LHCI showed ~4-6.6s LCP under mobile throttling, driven by the 3D hero (set to `warn` in the migration). This is the real perf work: defer/lazy the 3D hero so the LCP element (headline) paints immediately, hydrate the sphere after; consider a static poster for the hero that swaps to the live sphere on idle. Target LCP < 2.5s on the SSR routes, then flip the LHCI budget back to `error`.
- **Bundle:** the tldraw `SketchBoard` chunk (~1.6MB raw, `/blueprint` only, lazy) — re-audit after any tldraw upgrade; keep the LHCI `script:size` budget honest (add `/lab` or `/blueprint` to the LHCI URL set so the budget is actually exercised).
- **Caching/headers:** WASM immutable caching exists; add long-lived immutable caching for fingerprinted assets (Vite already fingerprints; confirm Vercel serves them `immutable`), and confirm Brotli on WASM post-deploy (owner-verify item from migration).
- **Monitoring:** Speed Insights wired; optionally add real-user Core Web Vitals reporting + error tracking (Sentry, opt-in).
- **CI:** the migration added Vitest + Playwright + LHCI; extend Playwright to cover the new nav + a couple of interaction flows; keep the green gate.

## Non-goals / explicit deferrals

- No rewrite off React/TanStack Start (just migrated; it's the base).
- No auto-triggered production deploys — owner controls all deploys (as in the migration).
- No new backend beyond the existing Edge chat function unless a project's live demo genuinely needs one (Workstream D playbook).
- Don't gate content behind the fancy stuff — `SIDOS-VISION.md`'s "content-forward, never gated" principle holds.

## Definition of done (per workstream)

`npm run build` + `tsc -b` + `lint` + Vitest + Playwright + LHCI budget all green · browser-verified at 375/768/1024/1440/1920 · reduced-motion + keyboard paths work · every internal nav is router-native (no `/#...` bounce) · every showable project is embedded live or device-framed · WCAG AA on all text · `main` untouched, owner controls deploy.

## Sequencing recommendation

A (nav correctness — unblocks clean navigation for everything else) → C-a11y/SEO/robustness (correctness foundation) → B (bold visual/motion, the headline) → D (live integration) → E (perf/LCP, measured last against the finished site). Each workstream is independently shippable and reviewable; a fresh session should turn this spec into a bite-sized plan via `superpowers:writing-plans` and execute with `subagent-driven-development` + per-task review, exactly as the migration did.
