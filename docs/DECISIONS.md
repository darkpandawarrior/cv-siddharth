# Decisions log

Settled choices for this repo, one line each, so a new session does not re-open them. Read before proposing an architectural change, and append a line when a decision is made.

- 2026-07-24: The site migrated to TanStack Start on Vite 8 with the React Compiler. Why: the migration design spec and plan were written first and this config is the first build step of that plan. (source: 5333b617, e91043d9, 7645d3c8)
- 2026-09-07: The WebGPU renderer is deferred, and the scenes stay on the R3F v9 gl-prop factory. Why: R3F has no stable v10 (latest is 9.7.0 with only v10 alphas), and WebGPURenderer is about 1.9x the gzip size of what ships today (185 KB against 99 KB) for no visible feature gain. (source: docs/webgpu-renderer-deferral.md, 4ea576b3)
- 2026-09-07: The heavy WASM app assets (251 MB) live in the top-level heavy/ directory and are served from GitHub Pages, not from Vercel. Why: they counted against Vercel's bandwidth cap, and totalDeploySizeBytes now ratchets the Vercel deploy at a 60 MB ceiling. (source: 9246c746, a90ffd31, docs/perf-budgets.md)
- 2026-09-07: Backend deploys for Candidai and PaymentsLab-KMP are owner-run commands, never triggered from this repo's CI, and bundle-static wasmJs stays the default for demos. Why: a running backend costs money the moment it exists, and automation would let an agent or a merged PR spend it without the owner in the loop. (source: docs/deploy-playbook.md, fcb38fb0)
- 2026-09-07: Every route must be reachable from facets.ts or the sitemap list, or be named in the Exceptions section with a reason, and routeSystemisation.test.ts enforces it. Why: the prose audit drifts, so the invariant is checked mechanically. (source: docs/route-systemisation.md, 0d78a4da)
