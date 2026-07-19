# The Living Portfolio — level-100 direction (v2, corrected)

**Hard pivot from v1.** v1 gated everything behind a boot screen + "launch an app" — it *threw away* the
wealth of real content. Killed. This direction is **content-forward and alive**: flood the visitor with
the goods, beautifully composed, and fold every wild idea in as an *enhancement to the content* — never a
gate. Every part of the existing site is elevated (not replaced by an empty desktop).

## The thesis
> Lead with substance, make it breathe. A visitor should be *drowning in proof* within five seconds —
> real apps running, real platforms morphing, real metrics ticking — all woven into content that leads.

## Non-negotiables (apply at EVERY level)

1. **Content-forward, never gated.** All the rich info (projects, multiplatform reality, career, metrics,
   story) is immediately present and immersive. No "click to launch to see anything." Substance first.
2. **Every part elevated ("changes by 5 degrees").** Hero, metrics, case studies, projects, experience,
   skills, contact, the chat — each re-conceived denser + more alive, off the uniform bordered-card stack.
   Nothing left flat.
3. **Fully responsive at every level.** Mobile-first. Every component, section, interactive element, 3D
   layer, and live embed adapts flawlessly across **mobile → tablet → desktop → ultrawide, every aspect
   ratio**. The 3D and live-app embeds *degrade gracefully* on small screens (static art / device-framed
   captures), never break, never overflow. Verified at 375 / 768 / 1024 / 1440 / 1920+.
4. **Multiplatform made visual, per project.** The "one codebase, N surfaces" thesis shown, not told:
   a device-wall / morph showcase per project (Android · iOS · Wear · watch · Desktop · Web) with the
   right device frames; the **live web build embedded inline** inside the case study (Kursi playable;
   Mileway live from `darkpandawarrior.github.io/mileway`; PaymentsLab rich now, live when a web target
   lands). Interactive target-switch / responsive-morph.
5. **Wild ideas folded IN as enhancements** (see the brainstorm — fold the approved ones): tool-use AI
   copilot (⌘K, can navigate/surface/pull-metrics), live telemetry layer (career-as-htop, self-updating
   GitHub stream), 3D ambient + navigable knowledge graph, shader hero, git-history time machine, "view
   real source", live self-perf HUD, unlock modes — each attached to content, none gating it.
6. **Evolved visual system, content-first.** Break the mono-green ceiling (control-room palette: space-ink
   ground, green primary signal, a second depth accent, glow/glass/elevation) — but the design serves the
   content's density and legibility, never decoration for its own sake.
7. **Per-project themes realigned.** Extend the data-driven `project.theme` → CSS-var system so each
   project reskins its whole immersive section into one coherent-but-distinct world.

## Technical foundation (already committed, `7183c96`)
React 19 + Vite 7 + Tailwind v4 (in-CSS `@theme`) · `three`+`@react-three/fiber` v9+`drei` lazy-loaded
per the Mermaid code-split pattern (out of the main entry) · `gen-system-prompt.mjs` single-sources the
chat prompt from `profile.ts` · control-room tokens added · module-count drift reconciled. The existing
content-forward homepage + `ProjectDetail` + streaming multi-provider chat are the base we ELEVATE.

## Build order (each section browser-verified at 375/768/1024/1440/1920 on `feat/level-100-revamp`; main untouched)
1. **Design system + responsive scaffolding** — control-room palette applied, fluid type/space scale,
   the ambient lazy-3D layer (with reduced-motion + mobile fallback), motion + audio primitives.
2. **Hero elevated** — content-forward + a signature interactive/3D moment, responsive.
3. **Every homepage section elevated** — metrics (alive), case studies, projects grid, experience, skills,
   contact — off the card-stack, denser + alive.
4. **Project pages, deep** — each project an immersive case study: multiplatform device-wall + inline live
   web build + interactive diagrams + animated metrics + realigned per-project theme. Fully responsive.
5. **AI copilot revamp** — ⌘K + tool-use (open/navigate/metrics), suggestions, persistence, richer render.
6. **Telemetry + knowledge graph** — live system-monitor layer + navigable 3D graph, folded into content.
7. **Content to 100 + polish** — every project/info to full depth, drift gone, perf/a11y/responsive final,
   deploy-ready (owner pushes).

## Definition of done (per section)
`npm run build` + `tsc --noEmit` + `lint` green · **browser-verified at 375/768/1024/1440/1920** · reduced-
motion + keyboard paths work · content leads, nothing gated · main untouched, owner controls deploy.
