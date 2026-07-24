# TanStack Start Migration Implementation Plan

&gt; **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite 7 SPA shell + hand-rolled hash router with TanStack Start (file-based, typed, per-route SSR opt-in) on Vite 8, push the toolchain to TypeScript 7.0 + React Compiler 1.0, self-host fonts + build-time AVIF images, add a Vitest/Playwright regression net + Lighthouse CI, and consolidate hosting on Vercel — with every existing interactive surface (3D scenes, tldraw, Compose Playground, the 9-instrument Lab Bench, WASM embeds) carried over unchanged.

**Architecture:** TanStack Start owns the render shell and routing; each current `if (hash === "#x")` branch in `src/App.tsx` becomes one file route under `src/routes/`. Home/resume/project-detail routes are server-rendered for crawlable first paint; every canvas/WebGL/tldraw route stays client-only (`ssr: false`, same `lazy()`+`Suspense` as today). The multi-provider chat handler (`api/_lib/chat-handler.ts`) is already a framework-free `Request → Promise<Response>` and stays a standalone Vercel Edge Function (see Global Constraints for why it is NOT folded into a Start server route).

**Tech Stack** (exact current published versions, looked up via `npm view` on 2026-07-24):
- typescript `7.0.2` (GA native Go compiler)
- @tanstack/react-start `1.168.32`, @tanstack/react-router `1.170.18` (router plugin ships transitively via start)
- react `19.2.8`, react-dom `19.2.8`
- vite `8.1.5`, @vitejs/plugin-react `6.0.4`
- @rolldown/plugin-babel `0.2.3`, babel-plugin-react-compiler `1.0.0`, @babel/core `8.0.1`
- @fontsource/space-grotesk `5.3.0`, @fontsource/inter `5.3.0`, @fontsource/rozha-one `5.3.0`, @fontsource/jetbrains-mono `5.3.0`
- sharp `0.35.3`
- vitest `4.1.10`, @playwright/test `1.61.1`
- @lhci/cli `0.15.1`, @vercel/speed-insights `2.0.0`

## Global Constraints
- React stays the UI runtime — no Qwik/Solid/RSC rewrite. Every component migrates as-is; this rewrites the shell, not component internals.
- **WebGPU / R3F v10 / Three.js WebGPURenderer are OUT OF SCOPE.** Migrate all existing R3F/Three scenes as-is on the repo's currently-pinned versions (`@react-three/fiber ^9.6.1`, `three ^0.185.1`). Do not bump them and do not add any WebGPU task.
- **Chat backend stays on the Edge runtime, never Node serverless** (Vercel Hobby Node functions cap at 10s/invocation; a streamed LLM response can exceed that). The approved spec's phrase "port into a Start server route" is deliberately superseded here by its own stronger, explicit Edge/10s constraint: on Vercel the reliable way to guarantee Edge + no 10s cap is a standalone `/api/chat.ts` Edge Function, which Vercel serves alongside the Start app (still one deploy target). The framework-free handler is reused verbatim; only its tests and dev-serving are touched. (Flagged reconciliation, not a silent drop — see Task 24 rollback note.)
- SSR is opt-in per route. SSR'd: `/` (home), `/resume`, `/project/$slug`. Everything else `ssr: false`.
- Single deploy target: Vercel. GitHub Pages retired. Canonical URL stays `https://cv-siddharth.vercel.app/` (already hardcoded).
- No content/feature changes. The Lab Bench work is already merged (commits `e4d9ece`, `a1de637`, `8dad01f`); working tree is clean. The 9 instruments (signal, crashes, recompose, theme, modules, gateways, search, fanout, replay) are tabs *inside* the single `/lab` route — not separate routes.
- `maplibre-gl` was replaced by Leaflet in the merge and is no longer imported; its Vite worker/optimizeDeps config is dead and gets dropped.
- Tailwind v4 (`@tailwindcss/vite ^4.1.18`) stays unchanged.
- `src/routeTree.gen.ts` is committed (not gitignored) so `tsc --noEmit` works standalone without a pre-generate step.
- **Dev vs. prod SSR (discovered during Task 7 execution):** `npm run dev` in this TanStack Start version does NOT server-render full document bodies — the raw dev response is the `<head>` + `<noscript>` shell + a client-entry script that hydrates in the browser. Real per-route SSR (body content in the raw HTTP response) is only produced by the **production build**. The build emits a self-listening Node server at `dist/server/server.js` that serves real SSR on **port 3000**. Therefore any task that must assert *server-rendered HTML* (Task 10) or measure *production performance* (Task 23), or wants a representative browser run (Task 22), MUST verify against `npm run build` + the production server (`npm run serve`, added in Task 9), NOT against `npm run dev`. Browser-based checks that assert on the post-hydration DOM (Playwright's `toContainText` after `networkidle`) work in either mode, but prod is more representative.

---

## File Structure

**New files**
- `src/router.tsx` — `createRouter()` factory + typed `Register` module augmentation.
- `src/router-instance.ts` — shared client router singleton (`export const router = createRouter()`), only added in Task 8 if Start doesn't already expose one; skip if the one-line `window.location.assign` fallback is used instead.
- `src/routes/__root.tsx` — HTML document shell: `<html>/<head>` w/ `<HeadContent/>`, `<body>`, global CSS + `@fontsource` imports, default head/OG/JSON-LD, hash→path compatibility shim, `<SpeedInsights/>`, `<Scripts/>`.
- `src/routes/index.tsx` — home scroll page (SSR). Body moved from `App.tsx`'s final `return`.
- `src/routes/resume.tsx` — `/resume` (SSR) → `ResumeView`.
- `src/routes/project.$slug.tsx` — `/project/$slug` (SSR) → `ProjectDetail`, per-project `head()`.
- `src/routes/loopdown.tsx`, `terminal.tsx`, `blueprint.tsx`, `compose.tsx`, `playground.tsx`, `lab.tsx`, `map.tsx`, `forge.tsx` — CSR routes (`ssr: false`), one per remaining hash branch.
- `src/routeTree.gen.ts` — auto-generated by the Start/router plugin (committed).
- `src/Picture.tsx` — `<picture>` helper: AVIF → WebP → original fallback.
- `scripts/gen-images.mjs` — sharp AVIF/WebP sibling generator (prebuild step).
- `api/_lib/chat-handler.test.ts` — Vitest: provider normalization.
- `src/composeInterpreter.test.ts` — Vitest: `parseCompose`.
- `src/blueprintPersistence.test.ts` — Vitest: `isBlueprintDb`.
- `vitest.config.ts` — node-env, no app plugins.
- `playwright.config.ts` + `e2e/smoke.spec.ts` — route smoke test.
- `lighthouserc.json` + `.github/workflows/lighthouse.yml` — perf budget CI.

**Modified files**
- `package.json` — deps/devDeps + `scripts` (`build`, `typecheck`, `test`, `test:e2e`, `gen:images`, prebuild/refresh).
- `vite.config.ts` — `tanstackStart()` + `viteReact()` + React Compiler via `@rolldown/plugin-babel`; drop `base`, dead maplibre worker/optimizeDeps, and custom `manualChunks`.
- `api/_lib/chat-handler.ts` — export `PROVIDERS`, `pickProvider`, `normalizeStream` for testing (add `export`, no logic change).
- `src/blueprintPersistence.ts` — extract inline DB-name predicate into exported `isBlueprintDb`.
- `src/ProjectDetail.tsx` — gallery + lightbox `<img>` → `<Picture>`.
- `src/App.tsx` — gutted: route branches move out; `CARD_MEDIA` `<img>` → `<Picture>`; `useHashRoute` deleted.
- `src/LabBench.tsx` — `openLab()` navigates via router instead of `window.location.hash`.
- `vercel.json` — drop SPA rewrite (Start owns routing); keep WASM immutable-cache headers; set region.
- `index.html` — deleted (Start owns the document; content moves to `__root.tsx`).
- `src/main.tsx` — deleted (Start provides client entry).
- `README.md` — Live link + badge → Vercel; deploy section rewritten single-target.
- `tsconfig.app.json` — add `"vitest/globals"` types note only if needed (kept minimal).

**Deleted files**
- `index.html`, `src/main.tsx`, `.github/workflows/deploy-pages.yml`.

---

## Tasks

### Group A — Toolchain baseline

#### Task 1 — Upgrade TypeScript to 7.0 and confirm the existing tree still type-checks
- [ ] Install: `npm install -D typescript@7.0.2`
- [ ] Run the current typecheck against the *pre-migration* code to prove TS7 is a drop-in: `npx tsc -b`
- [ ] Expected: exits 0, no errors (TS 7.0 is same syntax as 5.9, just the native compiler). If any new diagnostic appears, fix it in place before proceeding.
- [ ] Commit: `chore(ts): upgrade to TypeScript 7.0.2 (native compiler)`

#### Task 2 — Install React Compiler + Vite 8 + plugin-react v6 toolchain (no wiring yet)
- [ ] Install exact versions:
  `npm install react@19.2.8 react-dom@19.2.8`
  `npm install -D vite@8.1.5 @vitejs/plugin-react@6.0.4 @rolldown/plugin-babel@0.2.3 babel-plugin-react-compiler@1.0.0 @babel/core@8.0.1`
- [ ] Verify the plugin-react v6 React-Compiler wiring is present (this is the verified API): `node -e "const p=require('@vitejs/plugin-react'); if(typeof p.reactCompilerPreset!=='function') throw new Error('reactCompilerPreset missing'); console.log('ok')"`
- [ ] Expected: prints `ok`.
- [ ] Commit: `chore(build): add Vite 8, plugin-react v6, React Compiler 1.0 deps`

### Group B — TanStack Start scaffold

#### Task 3 — Install TanStack Start and rewrite `vite.config.ts` for Start + Vite 8 + React Compiler
- [ ] Install: `npm install @tanstack/react-start@1.168.32 @tanstack/react-router@1.170.18`
- [ ] Replace `vite.config.ts` entirely with (verified: `@rolldown/plugin-babel` default export is async `babel(opts): Promise<Plugin>`, `reactCompilerPreset()` returns a `RolldownBabelPreset` consumed by its `presets` array; `tanstackStart` is exported from `@tanstack/react-start/plugin/vite`):
  ```ts
  import { defineConfig } from "vite";
  import { tanstackStart } from "@tanstack/react-start/plugin/vite";
  import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
  import babel from "@rolldown/plugin-babel";
  import tailwindcss from "@tailwindcss/vite";

  // React Compiler 1.0 runs through the rolldown→babel bridge, since
  // @vitejs/plugin-react v6 moved its own JSX transform off Babel onto oxc.
  export default defineConfig(async () => ({
    server: { port: 5173 },
    plugins: [
      await babel({ presets: [reactCompilerPreset()] }),
      // Start bundles its own react plugin unless told a custom one is provided.
      tanstackStart({ customViteReactPlugin: true }),
      viteReact(),
      tailwindcss(),
    ],
  }));
  ```
  Dropped from the old config on purpose: `base` (GH Pages subpath — retired), `worker`/`optimizeDeps` (maplibre-gl removed in the Leaflet merge), `chatApiDevPlugin` (Start serves `/api/*` files natively — see Task 24), custom `manualChunks` (Start + rolldown handle vendor splitting; the hand-rolled `react-dom`/`scheduler` matcher is exactly what breaks under a new bundler — revisit only if Task 27 shows a regression).
- [ ] Remove the now-unused maplibre dep: `npm uninstall maplibre-gl`
- [ ] Commit: `build: TanStack Start Vite 8 config with React Compiler`

#### Task 4 — Add the router factory `src/router.tsx`
- [ ] Create `src/router.tsx`:
  ```ts
  import { createRouter as createTanStackRouter } from "@tanstack/react-router";
  import { routeTree } from "./routeTree.gen";

  export function createRouter() {
    return createTanStackRouter({
      routeTree,
      scrollRestoration: true,
      defaultPreload: "intent",
    });
  }

  declare module "@tanstack/react-router" {
    interface Register {
      router: ReturnType<typeof createRouter>;
    }
  }
  ```
- [ ] `src/routeTree.gen.ts` does not exist yet and this import will error until the plugin generates it in Task 5 — that is expected; do not hand-write it.
- [ ] Commit after Task 5 (needs the generated tree to type-check).

#### Task 5 — Create the root document `src/routes/__root.tsx` (head, JSON-LD, hash-compat shim, Speed Insights)
This moves all of `index.html`'s `<head>` into the root route and installs the back-compat redirect that lets every existing `#hash` and `?project=` link keep working without touching ~60 call sites.
- [ ] Install Speed Insights (used here): `npm install @vercel/speed-insights@2.0.0`
- [ ] Create `src/routes/__root.tsx`:
  ```tsx
  import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
  import { useEffect } from "react";
  import { SpeedInsights } from "@vercel/speed-insights/react";
  import "../index.css";
  import "@fontsource/space-grotesk/400.css";
  import "@fontsource/space-grotesk/500.css";
  import "@fontsource/space-grotesk/600.css";
  import "@fontsource/space-grotesk/700.css";
  import "@fontsource/inter/400.css";
  import "@fontsource/inter/500.css";
  import "@fontsource/inter/600.css";
  import "@fontsource/rozha-one/400.css";
  import "@fontsource/jetbrains-mono/400.css";
  import "@fontsource/jetbrains-mono/500.css";
  import "@fontsource/jetbrains-mono/600.css";

  const PERSON_LD = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Siddharth Pandalai",
    url: "https://cv-siddharth.vercel.app/",
    jobTitle: "Senior Android Engineer",
    worksFor: { "@type": "Organization", name: "Dice.tech" },
    email: "mailto:siddharthpandalai990@gmail.com",
    alumniOf: "NIT Bhopal",
    address: { "@type": "PostalAddress", addressLocality: "Pune", addressCountry: "IN" },
    knowsAbout: ["Android", "Kotlin", "Kotlin Multiplatform", "Jetpack Compose", "Location Engineering", "Sensor Fusion", "Mobile Security", "Structured Concurrency"],
    sameAs: [
      "https://github.com/darkpandawarrior",
      "https://linkedin.com/in/siddharth-pandalai-3712b215a",
      "https://dev.to/darkpandawarrior",
      "https://medium.com/@darkpandawarrior",
      "https://darkpandawarrior.hashnode.dev",
      "https://booksbeforebros.wordpress.com",
    ],
  };

  export const Route = createRootRoute({
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1.0" },
        { title: "Siddharth Pandalai | Senior Android Engineer" },
        { name: "description", content: "Senior Android Engineer. Platform owner at 50k MAU scale. GPS accuracy 50%→95%, 80% crash reduction, 92% Jetpack Compose. Ask my AI assistant anything." },
        { name: "author", content: "Siddharth Pandalai" },
        { name: "theme-color", content: "#0b0f0d" },
        { name: "color-scheme", content: "dark" },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://cv-siddharth.vercel.app/" },
        { property: "og:site_name", content: "sid.android" },
        { property: "og:title", content: "Siddharth Pandalai | Senior Android Engineer" },
        { property: "og:description", content: "Interactive CV with an AI assistant. GPS accuracy 50%→95%, 80% crash reduction, 92% Jetpack Compose at 738k LOC." },
        { property: "og:image", content: "https://cv-siddharth.vercel.app/og-image.png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Siddharth Pandalai | Senior Android Engineer" },
        { name: "twitter:description", content: "Interactive CV with an AI assistant, 3D storyboard and an infinite blueprint canvas. Android · Kotlin · KMP." },
        { name: "twitter:image", content: "https://cv-siddharth.vercel.app/og-image.png" },
      ],
      links: [
        { rel: "canonical", href: "https://cv-siddharth.vercel.app/" },
        { rel: "manifest", href: "/site.webmanifest" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "Agent-readable profile" },
        { rel: "icon", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230b0f0d'/%3E%3Ctext x='50' y='68' font-size='52' font-family='sans-serif' font-weight='bold' fill='%233ddc84' text-anchor='middle'%3ES%3C/text%3E%3C/svg%3E" },
      ],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(PERSON_LD) },
      ],
    }),
    component: RootDocument,
  });

  // Real route paths this site owns. Any legacy `#hash` matching one of these
  // (or `?project=<slug>`) is redirected to the real path; on-page section
  // anchors (#work, #projects, #skills, #writing, #contact, #experience) are
  // left alone so home-page scroll links keep working.
  const HASH_ROUTES = new Set(["resume", "loopdown", "terminal", "blueprint", "compose", "playground", "lab", "map", "forge"]);

  function HashCompat() {
    const router = useRouter();
    useEffect(() => {
      const apply = () => {
        const hash = window.location.hash.replace(/^#/, "");
        if (hash.startsWith("project/")) {
          router.navigate({ to: "/project/$slug", params: { slug: hash.slice("project/".length) }, replace: true });
          return;
        }
        if (HASH_ROUTES.has(hash)) {
          router.navigate({ to: `/${hash}`, replace: true });
          return;
        }
        // LinkedIn Featured strips the #fragment but keeps ?project=<slug>.
        const project = new URLSearchParams(window.location.search).get("project");
        if (project) router.navigate({ to: "/project/$slug", params: { slug: project }, replace: true });
      };
      apply();
      window.addEventListener("hashchange", apply);
      return () => window.removeEventListener("hashchange", apply);
    }, [router]);
    return null;
  }

  function RootDocument() {
    return (
      <html lang="en" className="dark">
        <head>
          <HeadContent />
        </head>
        <body>
          <HashCompat />
          <Outlet />
          <SpeedInsights />
          <Scripts />
          <noscript>
            <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem", fontFamily: "system-ui", color: "#e8efe9" }}>
              <h1>Siddharth Pandalai — Senior Android Engineer</h1>
              <p>Platform owner of a 738k-LOC, 92%-Compose financial SaaS app serving 50,000+ monthly users. GPS accuracy 50%→95%, 80% crash reduction. Kotlin · Jetpack Compose · Kotlin Multiplatform.</p>
              <p>This portfolio is interactive and needs JavaScript. Text versions:</p>
              <ul>
                <li><a href="/llms.txt" style={{ color: "#3ddc84" }}>Profile summary (llms.txt)</a></li>
                <li><a href="/llms-full.txt" style={{ color: "#3ddc84" }}>Full profile (llms-full.txt)</a></li>
                <li><a href="https://github.com/darkpandawarrior" style={{ color: "#3ddc84" }}>GitHub</a></li>
                <li><a href="https://linkedin.com/in/siddharth-pandalai-3712b215a" style={{ color: "#3ddc84" }}>LinkedIn</a></li>
                <li><a href="mailto:siddharthpandalai990@gmail.com" style={{ color: "#3ddc84" }}>siddharthpandalai990@gmail.com</a></li>
              </ul>
            </main>
          </noscript>
        </body>
      </html>
    );
  }
  ```
- [ ] `@fontsource` packages are installed in Task 17; if running this task first, temporarily comment the `@fontsource/*` imports and restore them in Task 17. (Prefer running Task 17 before first `npm run dev`.)
- [ ] Commit (with Task 4): `feat(shell): TanStack Start root document, head, and hash-compat shim`

### Group C — Routing migration (repeatable procedure)

#### Task 6 — Create the three SSR routes (home, resume, project)
The **repeatable procedure** (apply to every branch in `App.tsx`'s route switch, lines ~1126–1258): for each `if (hash === "#X") { return <JSX/> }` (and the `hash.startsWith("#project/")` and final default `return`), create `src/routes/<X>.tsx` exporting `createFileRoute("/<X>")({ ssr, head?, component })` whose `component` returns that branch's exact JSX (imports carried over verbatim, `lazy()`+`Suspense` preserved). SSR only home/resume/project; all else `ssr: false` (Task 7). Below are the SSR worked examples.

- [ ] `src/routes/index.tsx` (home, SSR default — body is `App.tsx`'s final `return`, minus the deleted `useHashRoute`/`resume-mode`/backtick effects which move to their own routes):
  ```tsx
  import { createFileRoute } from "@tanstack/react-router";
  import { HomePage } from "../App";
  export const Route = createFileRoute("/")({ component: HomePage });
  ```
  Refactor `App.tsx`: rename the default-export `App()`'s final scroll-page `return (...)` into an exported `export function HomePage() { ... }` containing `<AmbientBackground/> <CursorAura/> <Nav/> <main>…</main> <ScrollBot/> <FloatingChat/>`. Keep the backtick-terminal `useEffect` inside `HomePage` (it navigates to `/terminal`; update `window.location.hash = "#terminal"` → the router, or leave it — the hash shim catches it). Delete `useHashRoute`, `resolveInitialHash`, and the top-level route switch from `App.tsx`.
- [ ] `src/routes/resume.tsx` (SSR):
  ```tsx
  import { createFileRoute } from "@tanstack/react-router";
  import { useEffect } from "react";
  import { ResumeView } from "../ResumeView";
  export const Route = createFileRoute("/resume")({
    head: () => ({ meta: [{ title: "Résumé — Siddharth Pandalai | Senior Android Engineer" }] }),
    component: ResumePage,
  });
  function ResumePage() {
    // The portfolio is dark; the résumé prints on white (was in App's route effect).
    useEffect(() => {
      document.documentElement.classList.add("resume-mode");
      return () => document.documentElement.classList.remove("resume-mode");
    }, []);
    return <ResumeView />;
  }
  ```
- [ ] `src/routes/project.$slug.tsx` (SSR, per-project OG — verified `/p/<slug>/og.png` cards exist for mileway/kursi/paymentslab/hiresignal/deadlock):
  ```tsx
  import { createFileRoute } from "@tanstack/react-router";
  import { projects } from "../data/profile";
  import { CursorAura } from "../CursorAura";
  import { ProjectDetail } from "../ProjectDetail";
  import { FloatingChat } from "../FloatingChat";
  export const Route = createFileRoute("/project/$slug")({
    head: ({ params }) => {
      const p = projects.find((x) => x.slug === params.slug);
      const title = p ? `${p.title} — Siddharth Pandalai` : "Project — Siddharth Pandalai";
      const desc = p?.blurb ?? "A build from Siddharth Pandalai's portfolio.";
      const og = `https://cv-siddharth.vercel.app/p/${params.slug}/og.png`;
      return {
        meta: [
          { title },
          { name: "description", content: desc },
          { property: "og:title", content: title },
          { property: "og:description", content: desc },
          { property: "og:image", content: og },
          { property: "og:url", content: `https://cv-siddharth.vercel.app/project/${params.slug}` },
          { name: "twitter:image", content: og },
        ],
        links: [{ rel: "canonical", href: `https://cv-siddharth.vercel.app/project/${params.slug}` }],
      };
    },
    component: ProjectPage,
  });
  function ProjectPage() {
    const { slug } = Route.useParams();
    return (
      <div className="min-h-screen">
        <CursorAura />
        <ProjectDetail slug={slug} />
        <FloatingChat />
      </div>
    );
  }
  ```
  (Confirm the exact field names `title`/`blurb` against `src/data/profile.ts`'s project record at execution time; adjust `p?.blurb` to the actual short-description field if named differently.)
- [ ] Verify: `npm run dev`, then in another shell:
  `curl -s http://localhost:5173/resume | grep -q "Résumé — Siddharth" && echo SSR-RESUME-OK`
  `curl -s http://localhost:5173/project/mileway | grep -q 'og:image' && echo SSR-PROJECT-OK`
  `curl -s http://localhost:5173/ | grep -qi "Senior Android Engineer" && echo SSR-HOME-OK`
- [ ] Expected: all three print `*-OK` (server-rendered HTML present in the raw response, proving SSR).
- [ ] Commit: `feat(routes): SSR routes for home, resume, project detail`

#### Task 7 — Create the CSR routes (ssr:false) for every remaining branch
Apply the repeatable procedure with `ssr: false` and the exact component from each branch. One file each:

| File | Path | `ssr` | Body (verbatim from `App.tsx` branch) |
|---|---|---|---|
| `src/routes/terminal.tsx` | `/terminal` | `false` | `<><Terminal/><FloatingChat/></>` |
| `src/routes/blueprint.tsx` | `/blueprint` | `false` | `<Suspense fallback={…"drafting the blueprint room…"}><BlueprintRoom/><FloatingChat/></Suspense>` — keep `const BlueprintRoom = lazy(() => import("../BlueprintRoom"))` |
| `src/routes/compose.tsx` | `/compose` | `false` | `<Suspense fallback={…"spinning up the compose playground…"}><ComposePlayground/><FloatingChat/></Suspense>` — keep `lazy(() => import("../ComposePlayground"))` |
| `src/routes/playground.tsx` | `/playground` | `false` | `<><CursorAura/><Playground/><FloatingChat/></>` |
| `src/routes/lab.tsx` | `/lab` | `false` | `<><CursorAura/><RoomFrame title="The Lab Bench" tagline="nine instruments, running live"><LabBench/></RoomFrame><FloatingChat/></>` (`RoomFrame` imported from `../Playground`) |
| `src/routes/map.tsx` | `/map` | `false` | `<><CursorAura/><RoomFrame title="The 3D Storyboard" tagline="the projects as a constellation"><StoryMap/></RoomFrame><FloatingChat/></>` |
| `src/routes/forge.tsx` | `/forge` | `false` | `<><CursorAura/><RoomFrame title="The Particle Forge" tagline="physics on a canvas"><ParticleWordmark/></RoomFrame><FloatingChat/></>` |
| `src/routes/loopdown.tsx` | `/loopdown` | `false` | `<div className="min-h-screen"><AmbientBackground/><CursorAura/><WritingView/><FloatingChat/></div>` |

- [ ] Concrete template (e.g. `src/routes/lab.tsx`):
  ```tsx
  import { createFileRoute } from "@tanstack/react-router";
  import { CursorAura } from "../CursorAura";
  import { RoomFrame } from "../Playground";
  import { LabBench } from "../LabBench";
  import { FloatingChat } from "../FloatingChat";
  export const Route = createFileRoute("/lab")({
    ssr: false,
    component: () => (
      <>
        <CursorAura />
        <RoomFrame title="The Lab Bench" tagline="nine instruments, running live">
          <LabBench />
        </RoomFrame>
        <FloatingChat />
      </>
    ),
  });
  ```
- [ ] Note: `resume` has NO `FloatingChat` in the original branch — preserve that (do not add one). The 9 Lab instruments remain internal tabs of `<LabBench/>` handed over by `openLab()` (Task 8); no per-instrument routes.
- [ ] Verify: `npx tsc -b` exits 0, and `npm run dev` serves each path (`curl -s http://localhost:5173/lab | grep -qi "root" && echo LAB-SHELL-OK` — a CSR route returns the app shell, not pre-rendered instrument HTML).
- [ ] Commit: `feat(routes): client-only routes for terminal, blueprint, compose, playground, lab, map, forge, loopdown`

#### Task 8 — Point `openLab()` at the router instead of `window.location.hash`
`src/LabBench.tsx:40-43` sets `window.location.hash = "#lab"`. The hash-compat shim would catch it, but a direct nav is cleaner and avoids a redirect bounce.
- [ ] In `src/LabBench.tsx`, replace the `window.location.hash = "#lab"` block inside `openLab` with a router navigation using the exported router. Simplest: import the singleton and navigate:
  ```ts
  // top of file
  import { router } from "./router-instance";
  // inside openLab, replacing the hash block:
  if (window.location.pathname !== "/lab") {
    window.scrollTo({ top: 0 });
    router.navigate({ to: "/lab" });
  }
  ```
  Add `src/router-instance.ts` exporting the shared client router (`export const router = createRouter()` from `./router`) if Start does not already expose a global; otherwise use `window.location.assign("/lab")` as the one-line fallback (full nav is acceptable for this rarely-hit cross-link). The `pendingLab` + `open-lab` CustomEvent tab-handoff is unchanged.
- [ ] Verify: `npm run dev`, open `/`, click a case-study card that calls `openLab("crashes")` → lands on `/lab` with the Crash Triage tab active.
- [ ] Commit: `refactor(lab): openLab navigates via router`

#### Task 9 — Delete `index.html` and `src/main.tsx`; wire the client entry
Start owns the document (Task 5) and provides the client bootstrap.
- [ ] Delete `index.html` and `src/main.tsx`.
- [ ] If Start requires an explicit client entry in this version, add `src/client.tsx`:
  ```tsx
  import { StartClient } from "@tanstack/react-start/client";
  import { createRouter } from "./router";
  import { hydrateRoot } from "react-dom/client";
  const router = createRouter();
  hydrateRoot(document, <StartClient router={router} />);
  ```
  (Only add if `npm run dev` errors about a missing client entry — Start auto-provides defaults per its config schema; prefer the default and delete this file if unused.)
- [ ] Remove the now-obsolete `HomePage` default-export bridge in `src/App.tsx` (added in Task 6 solely to keep `src/main.tsx` compiling — with `main.tsx` deleted, `App.tsx` no longer needs a default export; keep the named `export function HomePage`).
- [ ] Establish the local production-serve command. `vite preview` only serves static client assets, not the SSR server, so it cannot exercise real SSR. Add `"serve": "node dist/server/server.js"` to `package.json` scripts (the build emits a self-listening Node server there, port 3000) and repoint `"preview"` at the same (`"preview": "node dist/server/server.js"`) so nothing references the stale static-only preview. This is the command Tasks 10/22/23 verify against per the dev-vs-prod SSR note in Global Constraints.
- [ ] Verify: `npm run build` completes; then `npm run serve` and confirm `curl -s http://localhost:3000/ | grep -qi "Senior Android Engineer"` finds server-rendered body content (proving real SSR from the prod server). Also confirm `npm run dev` still boots without a missing-client-entry error (dev won't full-SSR, per the note — that's expected).
- [ ] Commit: `refactor(shell): remove index.html/main.tsx; Start owns the entry`

### Group D — SSR/CSR classification verification

#### Task 10 — Prove SSR routes emit content HTML and CSR routes emit only the shell
Verify against the **production server**, not `npm run dev` (see the dev-vs-prod SSR note in Global Constraints — dev never full-SSRs, so it can't distinguish the classes). Run `npm run build` then `npm run serve` (production Node server on port 3000), and in another shell:
  ```bash
  # SSR: server HTML contains route content in the RAW response (no JS executed)
  curl -s http://localhost:3000/         | grep -qi "Senior Android Engineer" && echo HOME-SSR
  curl -s http://localhost:3000/resume   | grep -qi "Experience" && echo RESUME-SSR
  curl -s http://localhost:3000/project/mileway | grep -qi "mileway" && echo PROJECT-SSR
  # CSR: raw server HTML is the shell only; the route's interactive content is NOT
  # pre-rendered (arrives via the client bundle). Assert the shell is present AND
  # the route's signature content is ABSENT from the raw response.
  curl -s http://localhost:3000/terminal | grep -qi "html" && ! curl -s http://localhost:3000/terminal | grep -qi "boot sequence" && echo terminal-CSR-SHELL
  for r in blueprint compose playground lab map forge loopdown; do
    curl -s "http://localhost:3000/$r" | grep -qi "<html" && echo "$r-CSR-SHELL"
  done
  ```
- [ ] Expected: `HOME-SSR`, `RESUME-SSR`, `PROJECT-SSR`, and `<name>-CSR-SHELL` for each CSR route. (The CSR assertion is that the shell renders; because these routes are `ssr:false`, their interactive bodies are intentionally absent from the raw HTML — contrast with the three SSR routes whose bodies ARE present.)
- [ ] The 3D/canvas components on the home SSR route (`ParticleHero`, `AmbientBackground`, `Phone3D`, `SkillsOrbit`, `FoundationGraph`) already return `null`/static until a client `useEffect` sets `ready`/`enable3D` — they SSR to nothing and hydrate client-side, so no code change is needed. Confirm no server-side `window`/`document` access error appears in the dev log.
- [ ] Commit: `test(ssr): verify per-route SSR/CSR classification` (add the script above as `scripts/verify-ssr.sh` for reuse).

### Group E — Chat backend (kept on Edge)

#### Task 11 — Export the chat handler's testable helpers (no logic change)
- [ ] In `api/_lib/chat-handler.ts`, add `export` to the three helpers used by tests: `export const PROVIDERS`, `export function pickProvider`, `export function normalizeStream`. No other change.
- [ ] Verify: `npx tsc -b` exits 0.
- [ ] Commit: `refactor(chat): export PROVIDERS/pickProvider/normalizeStream for tests`

#### Task 12 — Confirm the chat Edge Function still serves under Start's dev server and on Vercel
The handler and `api/chat.ts` (`export const config = { runtime: "edge" }`) are unchanged. The old `chatApiDevPlugin` was removed from `vite.config.ts` (Task 3); confirm dev serving still works.
- [ ] With `npm run dev` running: `curl -s -X POST http://localhost:5173/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}' -i | head -5`
- [ ] Expected: a `text/event-stream` response (with a provider key set) or a clean `503` JSON "Chat is not configured" (without keys) — NOT a 404. If dev returns 404, re-add the `chatApiDevPlugin` from git history into `vite.config.ts` (it hooks `configureServer`, works under any Vite-based dev server including Start's). This is the only reason to keep that plugin.
- [ ] Commit: `chore(chat): confirm Edge function dev serving under Start`

### Group F — Assets (images + fonts)

#### Task 13 — Add the sharp AVIF/WebP generator `scripts/gen-images.mjs`
- [ ] Install: `npm install -D sharp@0.35.3`
- [ ] Create `scripts/gen-images.mjs` (walks `public/`, generates `.avif` for every static raster and a `.webp` for png/jpg sources; idempotent by mtime; skips animated gifs):
  ```js
  // Build-time AVIF + WebP siblings for public/ rasters (190 PNG / 4 WebP, ~20MB).
  // Idempotent: regenerates only when the source is newer. Runs in prebuild,
  // same pattern as gen-galleries.mjs / gen-og.mjs. No runtime image CDN.
  import { readdirSync, statSync, existsSync } from "node:fs";
  import { join, dirname, extname } from "node:path";
  import { fileURLToPath } from "node:url";
  import sharp from "sharp";

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const publicDir = join(root, "public");

  function* walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) yield* walk(p);
      else yield p;
    }
  }
  const fresher = (src, out) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;

  let made = 0;
  for (const src of walk(publicDir)) {
    const ext = extname(src).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue; // gifs: animated, skip
    const base = src.slice(0, -ext.length);
    const avif = `${base}.avif`;
    if (!fresher(src, avif)) { await sharp(src).avif({ quality: 50 }).toFile(avif); made++; }
    if (ext !== ".webp") {
      const webp = `${base}.webp`;
      if (!fresher(src, webp)) { await sharp(src).webp({ quality: 72 }).toFile(webp); made++; }
    }
  }
  console.log(`[gen-images] wrote/updated ${made} derivative(s)`);
  ```
- [ ] Verify: `node scripts/gen-images.mjs` → prints a non-zero count on first run; a second run prints `0` (idempotent).
- [ ] Add generated derivatives to `.gitignore` (they are build artifacts): append `public/**/*.avif` and the generated `public/**/*.webp` (keep the 4 source WebP by leaving them tracked — since sources predate this, the glob only ignores *new* ones; if that is ambiguous, instead run gen-images in CI/prebuild only and gitignore both). Simplest: gitignore `*.avif` under `public/` and rely on prebuild to regenerate on every deploy.
- [ ] Commit: `feat(images): build-time AVIF/WebP generator`

#### Task 14 — Wire `gen-images` into the build pipeline
- [ ] In `package.json` `scripts`: add `"gen:images": "node scripts/gen-images.mjs"`; append `&& node scripts/gen-images.mjs` to both `prebuild` and `predev`; add `gen:images` into the `refresh` chain (after `gen:galleries`).
- [ ] Verify: `npm run prebuild` runs gen-images among the others without error.
- [ ] Commit: `build(images): run gen-images in prebuild/predev/refresh`

#### Task 15 — Add the `<Picture>` helper
- [ ] Create `src/Picture.tsx`:
  ```tsx
  // AVIF → WebP → original fallback. src is the original raster path
  // (e.g. "/projects/kursi/screenshots/home.png"); siblings are produced by
  // scripts/gen-images.mjs. Animated gifs render as a plain <img>.
  type Props = { src: string; alt: string; className?: string; loading?: "lazy" | "eager" };
  export function Picture({ src, alt, className, loading = "lazy" }: Props) {
    const dot = src.lastIndexOf(".");
    const ext = dot >= 0 ? src.slice(dot + 1).toLowerCase() : "";
    if (ext === "gif" || dot < 0) return <img src={src} alt={alt} loading={loading} className={className} />;
    const base = src.slice(0, dot);
    return (
      <picture>
        <source srcSet={`${base}.avif`} type="image/avif" />
        {ext !== "webp" && <source srcSet={`${base}.webp`} type="image/webp" />}
        <img src={src} alt={alt} loading={loading} className={className} />
      </picture>
    );
  }
  ```
- [ ] Verify: `npx tsc -b` exits 0.
- [ ] Commit: `feat(images): Picture component with AVIF/WebP fallback`

#### Task 16 — Swap the image render sites to `<Picture>`
Only three data-driven surfaces render project rasters (galleries/cards are array-driven, so this is 3 edits, not 190).
- [ ] `src/ProjectDetail.tsx:508` gallery thumb — replace `<img src={it.src} alt={it.caption} loading="lazy" className="aspect-[9/19] h-full w-full object-cover" />` with `<Picture src={it.src} alt={it.caption} className="aspect-[9/19] h-full w-full object-cover" />`.
- [ ] `src/ProjectDetail.tsx:569` lightbox — replace the `<img key=… src={items[idx].src} …/>` with `<Picture src={items[idx].src} alt={items[idx].caption} loading="eager" className="lb-in max-h-[85vh] max-w-full rounded-xl shadow-2xl" />` (keep the outer `onClick` stopPropagation by wrapping if needed — the enlarge-on-click handler is on the `<img>`; move it to the `<picture>` wrapper or keep a plain `<img>` here if the click handler is load-bearing). Add `import { Picture } from "./Picture";`.
- [ ] `src/App.tsx` `CARD_MEDIA` render site (the card-top media in the `projects.map` around line 622) — swap its `<img>` for `<Picture>` (handles the `.gif` entries via the gif passthrough).
- [ ] Verify: `npm run dev`, open `/project/mileway` → gallery + lightbox render (AVIF served where the browser supports it, PNG/GIF otherwise); DevTools Network shows `.avif` requests.
- [ ] Commit: `perf(images): render project media via Picture (AVIF/WebP)`

#### Task 17 — Self-host fonts via @fontsource, drop the Google Fonts CDN
The Google Fonts `<link>` (old `index.html:40-45`) is already gone (index.html deleted). Now install the self-hosted sources referenced by `__root.tsx` (Task 5) and preload the critical weights.
- [ ] Install: `npm install @fontsource/space-grotesk@5.3.0 @fontsource/inter@5.3.0 @fontsource/rozha-one@5.3.0 @fontsource/jetbrains-mono@5.3.0`
- [ ] Confirm the `@fontsource/*` imports in `src/routes/__root.tsx` are active (uncomment if they were temporarily disabled in Task 5). The CSS var names in `src/index.css` (`--font-display: "Space Grotesk"`, `--font-body: "Inter"`, `--font-mono: "JetBrains Mono"`) are unchanged — @fontsource registers those exact family names. `font-display: swap` is @fontsource's default.
- [ ] Preload the two critical weights (display 700 + body 400) — add to `__root.tsx`'s `head().links` array, using the resolved @fontsource asset paths (Vite fingerprints them; import as URLs):
  ```ts
  // top of __root.tsx
  import spaceGrotesk700 from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?url";
  import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";
  // in head().links:
  { rel: "preload", as: "font", type: "font/woff2", href: spaceGrotesk700, crossOrigin: "anonymous" },
  { rel: "preload", as: "font", type: "font/woff2", href: inter400, crossOrigin: "anonymous" },
  ```
  (Verify the exact filenames under `node_modules/@fontsource/space-grotesk/files/` at execution time — @fontsource file naming is `<family>-<subset>-<weight>-normal.woff2`.)
- [ ] Verify: `npm run dev`, DevTools Network → fonts load from the local origin (`/_build/...` or `/assets/...`), zero requests to `fonts.googleapis.com` / `fonts.gstatic.com`.
- [ ] Commit: `perf(fonts): self-host via @fontsource, preload critical weights`

### Group G — Testing net

#### Task 18 — Vitest setup
- [ ] Install: `npm install -D vitest@4.1.10`
- [ ] Create `vitest.config.ts` (node env, no app/Start/react plugins — the three targets are pure logic / web-standard streams, so no jsdom and no Vite-8 plugin coupling):
  ```ts
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: { environment: "node", include: ["src/**/*.test.ts", "api/**/*.test.ts"] },
  });
  ```
- [ ] Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- [ ] Verify: `npm test` runs (0 tests found is fine at this point, exits 0).
- [ ] Commit: `test: add Vitest (node env)`

#### Task 19 — Unit test: chat-handler provider normalization
- [ ] Create `api/_lib/chat-handler.test.ts` (test-first — write before confirming exports exist; it will fail if Task 11 exports are missing):
  ```ts
  import { describe, it, expect } from "vitest";
  import { PROVIDERS, normalizeStream } from "./chat-handler";

  const sse = (lines: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l)); c.close(); },
    });
  async function collect(rs: ReadableStream<Uint8Array>) {
    const r = rs.getReader(); const dec = new TextDecoder(); let out = "";
    for (;;) { const { done, value } = await r.read(); if (done) break; out += dec.decode(value); }
    return out;
  }

  describe("provider extractDelta", () => {
    it("groq pulls choices[0].delta.content", () => {
      const groq = PROVIDERS.find((p) => p.name === "groq")!;
      expect(groq.extractDelta({ choices: [{ delta: { content: "Hi" } }] })).toBe("Hi");
    });
    it("gemini pulls candidates[0].content.parts[0].text", () => {
      const g = PROVIDERS.find((p) => p.name === "gemini")!;
      expect(g.extractDelta({ candidates: [{ content: { parts: [{ text: "yo" }] } }] })).toBe("yo");
    });
    it("anthropic pulls text only on content_block_delta/text_delta", () => {
      const a = PROVIDERS.find((p) => p.name === "anthropic")!;
      expect(a.extractDelta({ type: "content_block_delta", delta: { type: "text_delta", text: "x" } })).toBe("x");
      expect(a.extractDelta({ type: "message_start" })).toBeUndefined();
    });
  });

  describe("normalizeStream", () => {
    it("re-emits provider-independent data:{text} then [DONE]", async () => {
      const groq = PROVIDERS.find((p) => p.name === "groq")!;
      const upstream = sse([
        'data: {"choices":[{"delta":{"content":"He"}}]}\n',
        'data: {"choices":[{"delta":{"content":"llo"}}]}\n',
        "data: [DONE]\n",
      ]);
      const out = await collect(normalizeStream(upstream, groq.extractDelta));
      expect(out).toContain('data: {"text":"He"}');
      expect(out).toContain('data: {"text":"llo"}');
      expect(out.trimEnd().endsWith("data: [DONE]")).toBe(true);
    });
  });
  ```
- [ ] Run to see it fail if exports are missing: `npm test` (expect failure until Task 11 is done), then pass after Task 11.
- [ ] Expected final: `npm test` → these tests green.
- [ ] Commit: `test(chat): provider normalization`

#### Task 20 — Unit test: composeInterpreter `parseCompose`
- [ ] Create `src/composeInterpreter.test.ts` (signature is `parseCompose(src: string): Program` with `Program = { state: StateDecl[]; tree: Node[] }`):
  ```ts
  import { describe, it, expect } from "vitest";
  import { parseCompose } from "./composeInterpreter";

  describe("parseCompose", () => {
    it("parses a state decl and a Column with a Text child", () => {
      const p = parseCompose(`var count by remember { mutableStateOf(0) }\nColumn {\n  Text("Hello")\n}`);
      expect(p.state).toEqual(expect.arrayContaining([expect.objectContaining({ name: "count", init: 0 })]));
      const col = p.tree.find((n) => n.kind === "container" && n.name === "Column");
      expect(col).toBeTruthy();
      expect((col as { children: { kind: string }[] }).children.some((c) => c.kind === "text")).toBe(true);
    });

    it("never throws on unknown input (returns an unknown node, not an exception)", () => {
      expect(() => parseCompose("Wobble(???)")).not.toThrow();
    });
  });
  ```
  (Adjust the state-decl syntax in the first test to match `parseCompose`'s actual accepted grammar if `var … by remember { mutableStateOf(0) }` is not the exact form — read `src/composeInterpreter.ts` `tokenize`/state parsing to confirm; the assertion on `{ name: "count", init: 0 }` matches the `StateDecl` type.)
- [ ] Verify: `npm test` → green.
- [ ] Commit: `test(compose): parseCompose smoke`

#### Task 21 — Unit test: blueprintPersistence `isBlueprintDb`
- [ ] Refactor `src/blueprintPersistence.ts`: extract the inline predicate `!!n && (/tldraw/i.test(n) || n.includes(PERSISTENCE_KEY))` into an exported guard and use it in the `.filter`:
  ```ts
  export function isBlueprintDb(name: string | undefined): name is string {
    return !!name && (/tldraw/i.test(name) || name.includes(PERSISTENCE_KEY));
  }
  // …in clearBlueprintPersistence, replace the inline filter with:
  .filter(isBlueprintDb)
  ```
- [ ] Create `src/blueprintPersistence.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { isBlueprintDb } from "./blueprintPersistence";
  import { PERSISTENCE_KEY } from "./blueprintData";

  describe("isBlueprintDb", () => {
    it("matches tldraw databases case-insensitively", () => {
      expect(isBlueprintDb("TLDRAW_DOCUMENT_v2")).toBe(true);
      expect(isBlueprintDb("tldraw")).toBe(true);
    });
    it("matches the app persistence key", () => {
      expect(isBlueprintDb(`app-${PERSISTENCE_KEY}`)).toBe(true);
    });
    it("ignores unrelated and empty names", () => {
      expect(isBlueprintDb("firebase-heartbeat")).toBe(false);
      expect(isBlueprintDb(undefined)).toBe(false);
      expect(isBlueprintDb("")).toBe(false);
    });
  });
  ```
- [ ] Verify: `npm test` → all three suites green. `npx tsc -b` exits 0.
- [ ] Commit: `test(blueprint): extract and test isBlueprintDb`

#### Task 22 — Playwright smoke test
- [ ] Install: `npm install -D @playwright/test@1.61.1` then `npx playwright install chromium`
- [ ] Create `playwright.config.ts`:
  ```ts
  import { defineConfig } from "@playwright/test";
  export default defineConfig({
    testDir: "./e2e",
    use: { baseURL: "http://localhost:3000" },
    webServer: {
      // Run against the production SSR server, not `npm run dev` — dev doesn't
      // full-SSR in this Start version (see Global Constraints), and the prod
      // build is the representative target anyway. Playwright asserts on the
      // post-hydration DOM, which works either way, but prod is honest.
      command: "npm run build && npm run serve",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  });
  ```
- [ ] Create `e2e/smoke.spec.ts` (one test per top-level route: home, resume, a project, a lab — asserts render + no console errors, the exact class of breakage a framework migration causes):
  ```ts
  import { test, expect } from "@playwright/test";

  const routes = [
    { path: "/", expect: /Senior Android Engineer/i },
    { path: "/resume", expect: /Experience/i },
    { path: "/project/mileway", expect: /mileway/i },
    { path: "/lab", expect: /Lab Bench/i },
  ];

  for (const r of routes) {
    test(`${r.path} renders with no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(r.path, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText(r.expect);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
  ```
- [ ] Add script: `"test:e2e": "playwright test"`.
- [ ] Verify: `npm run test:e2e` → 4 passed. (WebGL context-loss warnings are `console.warn`, not `error`, so they will not fail the suite; if a benign third-party `console.error` appears, filter it by substring in the `console` handler rather than loosening the assertion.)
- [ ] Commit: `test(e2e): Playwright route smoke test`

### Group H — Lighthouse CI

#### Task 23 — Lighthouse CI with a performance budget
- [ ] Install: `npm install -D @lhci/cli@0.15.1`
- [ ] Create `lighthouserc.json` (budget fails the build on LCP / total-JS regression):
  ```json
  {
    "ci": {
      "collect": {
        "startServerCommand": "npm run serve",
        "url": ["http://localhost:3000/", "http://localhost:3000/resume", "http://localhost:3000/project/mileway"],
        "numberOfRuns": 3
      },
      "assert": {
        "assertions": {
          "categories:performance": ["warn", { "minScore": 0.8 }],
          "largest-contentful-paint": ["error", { "maxNumericValue": 3500 }],
          "total-byte-weight": ["warn", { "maxNumericValue": 3500000 }],
          "resource-summary:script:size": ["error", { "maxNumericValue": 1800000 }]
        }
      },
      "upload": { "target": "temporary-public-storage" }
    }
  }
  ```
- [ ] Create `.github/workflows/lighthouse.yml`:
  ```yaml
  name: Lighthouse CI
  on:
    push: { branches: [main] }
    pull_request:
  jobs:
    lhci:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 22, cache: npm }
        - run: npm ci
        - run: npx playwright install-deps chromium || true
        - run: npm run build
        - run: npx @lhci/cli autorun
  ```
- [ ] Verify locally: `npm run build && npx @lhci/cli autorun` → assertions run; the `script:size` `error` threshold is set at 1.8MB knowing `SketchBoard` (tldraw) is the current largest chunk — if it trips, Task 27 addresses it.
- [ ] Commit: `ci(perf): Lighthouse CI with LCP + bundle budget`

### Group I — Hosting consolidation (Vercel)

#### Task 24 — Retire GitHub Pages
- [ ] Delete `.github/workflows/deploy-pages.yml`.
- [ ] Rollback note for the chat/Edge decision (Global Constraints): if a future move ever folds the chat into a Start server route and it hits the 10s Node cap on Vercel Hobby, revert to the standalone `api/chat.ts` Edge Function (kept here) — the handler is identical either way.
- [ ] Verify: `ls .github/workflows/` shows only `refresh-media.yml` remains.
- [ ] Commit: `ci: retire GitHub Pages deploy workflow`

#### Task 25 — Update `vercel.json` (drop SPA rewrite, keep WASM headers, pick region)
- [ ] Rewrite `vercel.json`: remove the SPA `rewrites` block (Start/Nitro owns routing now — a catch-all `→ /index.html` would shadow real routes); keep the three WASM immutable-cache header blocks verbatim; pin a region close to the primary audience:
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "regions": ["bom1"],
    "headers": [
      { "source": "/kursi-app/(.*)\\.wasm", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/paymentslab-app/(.*)\\.wasm", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/mileway-app/(.*)\\.wasm", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
    ]
  }
  ```
  Region: verify current Hobby-plan region options and any restriction with the authenticated CLI before committing the value — `vercel` is installed and linked (`.vercel/project.json` → project `cv-siddharth`). The chat stays on Edge (globally distributed; region-independent), so `regions` only affects the Node SSR function.
- [ ] Verify Brotli + WASM headers on a preview deploy (do not assume): `vercel deploy` (preview), then `curl -sI -H 'accept-encoding: br' https://<preview-url>/kursi-app/<file>.wasm | grep -iE 'content-encoding|cache-control'` → expect `content-encoding: br` and the immutable cache header.
- [ ] Commit: `chore(vercel): Start-aware vercel.json, WASM headers, region`

#### Task 26 — Update README (Live link + deploy section)
- [ ] `README.md:15` — change the Live link from `darkpandawarrior.github.io/cv-siddharth` to `**Live: [cv-siddharth.vercel.app](https://cv-siddharth.vercel.app/)**`.
- [ ] `README.md:12` — replace the GitHub-Pages deploy badge with a Vercel deployment badge (or remove it).
- [ ] `README.md:21` — update the résumé-view link `#resume` → `/resume` (real path now).
- [ ] Rewrite the Deploy section (`README.md:55-90`): drop "Option B — GitHub Pages"; single path is Vercel (site + chat), `ANTHROPIC_API_KEY` in project env, chat on Edge. Update the stack line (`README.md:36`) `Vite 7` → `Vite 8 · TanStack Start · TypeScript 7`.
- [ ] Verify: `grep -c "github.io" README.md` returns 0.
- [ ] Commit: `docs: point README at Vercel; drop GitHub Pages path`

#### Task 27 — Bundle audit (SketchBoard / tldraw)
- [ ] Build and inspect chunk sizes: `npm run build` then review the build output / `.output` (or `dist`) chunk report for the tldraw-driven `SketchBoard` chunk (largest today, ~1.6MB).
- [ ] Investigate tldraw's sub-feature / tree-shaking options (import only needed modules rather than the umbrella `tldraw` entry) — apply a reduction only if one exists without breaking the canvas. Do not commit to a target number; if nothing clean is available, document the finding and leave it (it is already `lazy()`-loaded on the `/blueprint` route only). Adjust the Lighthouse `script:size` threshold in `lighthouserc.json` if this route legitimately needs headroom.
- [ ] Commit (only if a change is made): `perf(bundle): trim tldraw chunk on the blueprint route`

### Group J — Final green gate

#### Task 28 — Full definition-of-done verification
- [ ] `npm run build` → succeeds (SSR + client build).
- [ ] `npx tsc --noEmit` → 0 errors (routeTree.gen.ts is committed, so this runs standalone).
- [ ] `npm run lint` → passes clean (the existing `eslint.config.js` keeps only `rules-of-hooks`/`exhaustive-deps`/`only-export-components`; with React Compiler now enabled, optionally re-enable the fuller `eslint-plugin-react-hooks` recommended set — but that is a follow-on, not required for this gate).
- [ ] `npm test` → all Vitest suites (chat normalization, parseCompose, isBlueprintDb) green.
- [ ] `npm run test:e2e` → 4 Playwright smoke tests green.
- [ ] `npx @lhci/cli autorun` → budget assertions pass.
- [ ] `scripts/verify-ssr.sh` → SSR/CSR classification matches the plan (Task 10).
- [ ] `grep -rc "github.io" README.md` → 0; `ls .github/workflows/deploy-pages.yml` → not found.
- [ ] Hand off to owner for the final `vercel --prod` (DoD: owner controls final deploy).
- [ ] Commit: `chore: TanStack Start migration — green gate`

---

## Risks

- **Riskiest step — Task 3 (Start + Vite 8 + React Compiler wiring).** Three bleeding-edge pieces converge: `tanstackStart({ customViteReactPlugin: true })` coexisting with `viteReact()`, and the async `@rolldown/plugin-babel` bridge feeding `reactCompilerPreset()`. Mitigation: the `defineConfig(async …)` + `await babel(...)` form and `reactCompilerPreset` export are verified against the installed v6.0.4 type defs. If Start double-adds a react plugin, drop `customViteReactPlugin` (zod config is non-strict, so an unknown key is harmless) or move the compiler into Start's plugin options. Rollback: revert `vite.config.ts`; the app still builds on the pre-Start config while the route files are inert until imported.
- **Route generation ordering.** `tsc --noEmit` needs `src/routeTree.gen.ts`. Mitigation: commit the generated file (not gitignored). If CI regenerates, `npm run build` (which triggers generation) runs before `tsc` in Task 28.
- **SSR + browser globals.** A home-route child touching `window`/`document` outside an effect would crash SSR. Mitigation: the 3D components already gate all browser access behind `useEffect` and render `null`/static first (verified in `ParticleHero.tsx`, `AmbientBackground.tsx`); Task 10 confirms no SSR error. Rollback: set `ssr: false` on `/` as a stopgap if an un-guarded access surfaces, then fix the component.
- **Chat 10s cap.** Keeping the chat as a dedicated Edge Function (not a Node-runtime Start route) is the mitigation itself. Task 12 curl-verifies serving; a streaming preview test confirms no truncation.
- **Vitest 4 ↔ Vite 8 peer coupling.** Mitigated by a minimal `vitest.config.ts` with no app/Start plugins and `environment: node` — the three targets are pure logic / web-standard streams, so the Vite-8 plugin pipeline is never loaded.
- **Broken inbound links.** Every existing `#hash`/`?project=` link is preserved by the single `HashCompat` shim in `__root.tsx` (Task 5) — one guard where all callers route through, rather than editing ~60 call sites.

## Sequencing notes
- A (toolchain) → B (scaffold) → C (routes) → D (verify) are strictly ordered. E (chat), F (assets), G (tests), H (LHCI), I (hosting) are largely independent of each other and can be parallelized across agents once C/D land, but all must precede J. Task 11 must precede Task 19; Task 13 precedes 14/16; Task 5's `@fontsource` imports precede or coincide with Task 17.
