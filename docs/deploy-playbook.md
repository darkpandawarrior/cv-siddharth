# Backend deploy playbook (owner-run)

Two projects on this site have a real backend behind the static demo: Candidai's Spring Boot
sync server and PaymentsLab's payment gateway simulators. Neither deploys automatically from this
repo or from theirs. This is the repeatable, owner-run process for standing one up, and the
checklist ProjectDetail's live-preview wiring points at once a URL exists.

Bundle-static stays the default (Doori, Gaddi, PaymentsLab-KMP and Stutter already ship this way:
a self-contained wasmJs build copied into `public/<slug>-app/`, no server involved). A separate
deploy is only for a project whose live demo needs a server it cannot run entirely in the visitor's
browser.

## Why this is owner-run, not automated

Nothing in this repo's CI triggers a deploy to another repo, and nothing here should: a backend
deploy costs money (a running dyno/machine, a database volume) the moment it exists, whether or not
anyone visits the site. Vercel's own deploys are metered on the Hobby plan the same way. Automatic
here means an agent or a merged PR can spend the owner's money without him in the loop. Every step
below is a command he runs himself.

## Candidai (HireSignal) server

The repo (`Android/HireSignal`) already carries the deploy target:

- `server/Dockerfile` — multi-stage build, `:server:bootJar` then a slim JRE runtime image.
- `fly.toml` — Fly.io app config, region `bom` (Mumbai), a mounted volume for the career-ops data
  dir (`DATA_CONTRACT.md`: user data lives on the volume, never baked into the image), and an
  `/actuator/health` check.

Steps, from `Android/HireSignal`:

1. `fly apps create hiresignal-server` (one time; skip if the app already exists).
2. `fly volumes create hiresignal_data --region bom --size 1` (one time).
3. `fly secrets set <whatever the server's Spring profile needs>` — check
   `server/src/main/resources/application.yml` for which env vars are read before assuming none
   are; do not commit a secret to `fly.toml` itself.
4. `fly deploy`.
5. `fly status` and hit `/actuator/health` on the returned URL to confirm the SQLite-backed index
   came up before pointing anything at it.

Once a URL exists: add it to the `hiresignal` project record in `src/data/profile.ts` (a
`liveBackendUrl`-shaped field, matching how `liveUrl` already works for the bundled apps) and wire
ProjectDetail to show it. That code path is not built yet — this playbook documents the deploy side
so it can land the moment the owner has run the steps above and has a URL to give it.

## PaymentsLab gateways

`Android/PaymentsLab/backend` is JVM-only Gradle today (`build.gradle.kts`, no `Dockerfile`, no
`fly.toml`). The playbook is the same shape as Candidai's once those exist:

1. Add a `Dockerfile` to `backend/` following Candidai's `server/Dockerfile` pattern (`bootJar` or
   the module's actual JAR task, a slim JRE runtime stage). PaymentsLab's backend has no Android KMP
   target dependency the way Candidai's `:server` does, so it should not need the Android SDK stage
   Candidai's build image carries — confirm against `backend/build.gradle.kts` before copying that
   stage over.
2. Add a `fly.toml` (or the equivalent for whatever host the owner picks) with the gateway
   simulator's actual port and health-check path.
3. Steps 1-5 above, substituting the PaymentsLab app name and volume (if the gateways carry state
   that needs one; check before assuming they don't).

This step is not done. The Dockerfile and fly.toml are prerequisites this playbook cannot skip
past, and building them is a PaymentsLab-repo change, out of this lane's scope (cv-siddharth only).

## Frontend WASM embeds: a separate, already-working path

Doori, Gaddi, PaymentsLab-KMP, the portfolio's own Compose twin and Stutter are already live in the
browser via a different, already-built mechanism, and it moved since this paragraph was first
written: their `wasmJsBrowserDistribution` Gradle output no longer lands in `public/<slug>-app/` at
all. It lands in the top-level `heavy/<slug>-app/` (see `src/lib/assetBase.ts`), which Vite never
copies into `dist/client`, and every `liveUrl` resolves through `heavy()` to
`https://darkpandawarrior.github.io/cv/<slug>-app/index.html` in production (`VITE_HEAVY_ASSET_BASE=/`
serves it same-origin off `heavy/` for local dev instead — see `vite.config.ts`'s
`heavyAssetsDevPlugin`). `scripts/publish-heavy-assets.mjs` rsyncs `heavy/` into the
`darkpandawarrior.github.io` repo's `cv/` directory and commits it there; `.github/workflows/publish-assets.yml`
runs that on every push to `main` (needs a `PAGES_DEPLOY_TOKEN` repo secret — a PAT with
`contents:write` on `darkpandawarrior.github.io` — see that workflow's own header comment).

`vercel.json` used to carry an immutable-cache header block per `<slug>-app/(.*).wasm` — removed in
`9246c74` (`feat(assets): move 251 MB of heavy static assets off Vercel onto GitHub Pages`) because
nothing under `dist/client` matches those paths anymore; Vercel cannot set headers for a response it
never serves. GitHub Pages does not support custom response headers at all (no `_headers` file, unlike
Netlify), so there is no equivalent block to add on the new origin — GH Pages' own default static-file
caching applies instead, which this repo cannot configure further; that is a limitation of the free
Pages tier, not a caching decision.

That path needs no backend, no Fly app and no owner-run deploy step beyond the one-time
`PAGES_DEPLOY_TOKEN` secret above; it ships as part of a normal `cv-siddharth` PR once published.

Candidai (HireSignal) targets Web the same way (`webApp`, wasmJs, Compose Multiplatform) and belongs
on this same path once its build is green. As of this writing it is not:
`./gradlew :webApp:wasmJsBrowserDistribution` in `Android/HireSignal` fails at
`kotlinWasmStoreYarnLock` with "Lock file was changed. Run the `kotlinWasmUpgradeYarnLock` task to
actualize lock file" — a yarn-lock drift in that repo, fixed by running
`./gradlew kotlinWasmUpgradeYarnLock` there and committing the updated lock file. That is a change
to `Android/HireSignal`, not to this repo, so it is out of this lane's scope; once it lands, the
`heavy/hiresignal-app/` copy and the `liveUrl` field are a five-minute follow-up here, copying the
Doori/Gaddi/PaymentsLab-KMP pattern exactly.
