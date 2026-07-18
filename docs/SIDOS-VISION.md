# SID//OS — the portfolio that boots

The north star for the level-100 rebuild. Every wave holds this concept. This is not "a portfolio with
3D on it" — it's **a live multiplatform operating system**, because Siddharth is a platform engineer, so
the portfolio should *be* a platform. Almost no one attempts this because almost no one has shipped
multiple KMP apps that run on the web. He has.

## The one-line thesis
> Most engineer portfolios are a résumé with a dark theme. This one **boots** — into a living workspace
> where you don't read about the apps, you **run** them.

## The five pillars (every part serves one of these)

1. **It boots.** A real init/boot sequence (kernel log, mounting projects, starting services) resolves
   into a living workspace — not a scroll page. Skippable, reduced-motion-aware.
2. **The apps are LIVE, not screenshots.** Each project is a draggable "app window" that **iframes its
   real deployed KMP web build**:
   - Kursi → its wasm web build (playable in-page).
   - Mileway → `darkpandawarrior.github.io/mileway`.
   - PaymentsLab → rich presentation now; goes live once a web target is added ("enhanced and bettered").
   Windows: open/close/minimize/drag/focus, a taskbar, a device-frame chrome, lazy-mounted (the heavy
   wasm only loads when a window opens).
3. **"Sid" is the OS copilot, not a chat bubble.** A ⌘K command palette + tool-using AI that can
   **navigate, open projects, run demos, pull live metrics, and answer as Siddharth**. The AI *is* the
   interface. Tools: `openProject`, `showScreenshots`, `navigateTo`, `getMetrics`, `runDemo`.
4. **Live telemetry.** The real numbers (50k MAU · 22k DAU · 92% Compose · 80% crash-reduction · GPS
   50→95%) render as a running **system monitor** — live gauges, process list, sparklines — a career as
   a running OS.
5. **Infinite inner detail.** A traversable **3D knowledge graph** of the work (projects ↔ shared
   toolkit ↔ skills), live architecture diagrams, a real terminal, hover-reveals, easter eggs. Depth on
   depth, many moving parts, consolidated into one environment.

## Visual language (evolve, don't discard)
Keep the Android-green signature but break the mono-green ceiling: a **control-room palette** — deep
space-ink ground, green as the primary signal, a second accent for depth, neon/glow gradients, real
elevation and glass surfaces. Space Grotesk display / Inter body stay; add a mono face for the
terminal/telemetry. Motion everywhere but perf-disciplined (rAF-to-DOM + lazy WebGL).

## Technical architecture
- **Stack:** keep React 19 + Vite 7 + Tailwind v4 (in-CSS `@theme`). Add `three` + `@react-three/fiber`
  (v9, React-19 compatible) + `@react-three/drei`, **lazy-loaded per the existing Mermaid code-split
  pattern** — never in the main entry (bundle discipline: first paint stays fast).
- **Live apps:** `<AppWindow>` component iframes a deployed web-build URL; window manager holds
  open/z-index/position state; lazy mount. Config per project in `profile.ts` (`webBuildUrl`).
- **AI tool-use:** extend `api/_lib/chat-handler.ts` — the model returns tool calls (open project, fetch
  metrics, navigate); the frontend executes them against the window manager / router. Streaming stays.
- **Content = one source of truth:** generate the chat system prompt *from* `profile.ts` at build
  (`scripts/gen-system-prompt.mjs`) — kill the manual-mirror hazard; reconcile the module-count drift.
- **Perf/a11y:** WebGL + wasm lazy-loaded, `prefers-reduced-motion` fallbacks for every scene, keyboard
  operable (windows, palette, graph), responsive (windows tile/stack on mobile). Bundle budget enforced.

## Build waves (each verified in a real browser on `feat/level-100-revamp`, main untouched)
1. **Foundation** — 3D stack (spike + code-split), control-room design system, window-manager + `<AppWindow>` shell, content single-sourcing.
2. **Boot + workspace hero** — the boot sequence → the living desktop.
3. **Live app windows** — Kursi + Mileway iframed and framed; taskbar; lazy mount.
4. **AI copilot** — ⌘K palette + tool-use (open/navigate/metrics) + streaming + persistence + suggestions.
5. **Telemetry + knowledge graph** — live system-monitor HUD + the 3D project/skill graph.
6. **Content to 100** — every project + all info to full depth, drift reconciled, deep inner detail everywhere.
7. **Polish** — perf, a11y, responsive, build-green, deploy-ready (owner pushes).

## Definition of done per wave
`npm run build` (tsc + vite) green · `npx tsc --noEmit` clean · reduced-motion + keyboard paths work ·
browser-verified screenshot reviewed · main untouched (feature branch), owner controls the deploy.
