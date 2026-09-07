# WebGPU renderer deferral

New doc — the first thing in it is the one deferral this lane's brief required to be written down
rather than silently skipped.

## Deferred: the WebGPU renderer path (lane V3, `b7-webgpu-renderer` / `tanstack-webgpu-renderer`)

**Not built in this lane.** `docs/superpowers/specs/2026-07-24-tanstack-start-migration-design.md`
(lines 92-97) and the 2026-07-25 spec (L43) both call for moving the site's R3F scenes to Three's
`WebGPURenderer` with automatic WebGL2 fallback. The spec's own documented contingency — "fall back
to the `gl` prop factory pattern on R3F v9 if v10 isn't fully stable when this is built" — is what
shipped, and it's still what should ship, for a reason verified today rather than carried over from
July.

### What it would change

Six scene files, all currently built on `@react-three/fiber`'s v9 `gl`-prop factory:

- `src/ParticleHeroScene.tsx`
- `src/FoundationGraphScene.tsx`
- `src/Phone3DScene.tsx`
- `src/AmbientScene.tsx`
- `src/StoryMapScene.tsx`
- `src/SkillsOrbitScene.tsx`

Plus three package bumps in `package.json`: `three` (`^0.185.1`), `@react-three/fiber`
(`^9.6.1`), and whatever version of `@react-three/drei` / `@react-three/postprocessing` tracks
R3F v10 — both currently pinned to versions built against v9's renderer contract.

### Why it's deferred, verified now rather than assumed

Two independent checks, both run against this actual working tree and the live npm registry
today, not recalled from the spec:

1. **The upstream dependency the migration needs isn't stable yet.** `npm view @react-three/fiber
   dist-tags` returns `latest: 9.7.0` — `10.0.0-alpha.4` and canary builds exist, but there is no
   stable v10. R3F v10 is what carries first-class WebGPU + TSL support; migrating onto an alpha
   render pipeline for six production scenes on a portfolio site is exactly the failure mode the
   spec's own contingency was written to avoid. This is the same finding the 2026-08-05 audit made
   (`docs/superpowers/specs/2026-08-05-site-overhaul-design.md`'s lane V3 entry: "the repo is on
   `@react-three/fiber` ^9.6.1 ... revisit now that r171+ is long stable") — checked again here
   because "long stable" describes `three`'s renderer, not the React binding on top of it, and the
   binding is the actual blocker.

2. **The bundle cost is real, not hypothetical.** `three` ships its WebGPU renderer as a separate
   prebuilt bundle (`node_modules/three/build/three.webgpu.min.js`), so the size delta is
   measurable without building anything:

   | Bundle | Raw | Gzip |
   |---|---|---|
   | `three.core-Co-9pgkG.js` — the chunk this site's own committed `dist/client` build actually ships today | 373,737 B | 98,926 B |
   | `three.module.min.js` — current WebGL-only bundle, unbundled npm package | 365,552 B | 86,831 B |
   | `three.webgpu.min.js` — `WebGPURenderer`, no node-material system | 667,861 B | 185,230 B |
   | `three.webgpu.nodes.min.js` — `WebGPURenderer` + the TSL node-material system the six scenes' material setup would actually need | 665,902 B | 184,916 B |

   The WebGPU renderer alone is **~1.9x the gzip size** of what ships today (185 KB vs 99 KB), on
   six scenes that already run acceptably on WebGL2 — a real regression to the site's initial-load
   weight for a renderer swap with no visible feature the current scenes use. That cost is worth
   paying once the fallback path (auto-downgrade to WebGL2 on unsupported browsers, per the spec)
   is built on a stable binding; it isn't worth paying twice, once now on an alpha API surface and
   again when v10 stabilizes and the migration has to be redone against its final API.

### Condition for picking it up

Re-run both checks above before starting:

- `npm view @react-three/fiber dist-tags` reports a stable (non-alpha, non-canary) v10 as
  `latest`.
- Re-measure the gzip delta against whatever this site's `dist/client` chunk looks like at that
  time (bundling changes; the 99 KB baseline above will have drifted) and confirm the WebGPU path
  still ships behind the spec's WebGL2 auto-fallback, so a visitor on an unsupported browser never
  pays the larger download for a renderer they can't use.

Until then this stays a documented gap, not a silent one — the PR for the lane that skipped it
says so in its own body rather than leaving lane V3 unmentioned.
