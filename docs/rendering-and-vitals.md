# Rendering and vitals

Moved from the README, which keeps the one gated sentence about which routes server-render.
The figures below are dated by the commit that wrote them and were not re-measured when this
file was split out; `lighthouserc.json` and `budgets.json` hold the current ceilings.

`/playground` used to be the seventh. Lighthouse did not score it slow, it
scored it `NO_FCP`, meaning the page painted no content whatsoever: a phone saw
a blank screen until the client bundle and three.js had both arrived. One
import caused it. The room grid reads the interaction counter from a module
that loads `@playhtml/react`, which reads `document` when it is imported, and
that killed the route's SSR in the loader before render began. The counter now
reaches components through a context whose default is a working no-op, which is
the truth on the server anyway, and the route serves its room grid and a baked
terrain plate as real HTML.

Six things hold the numbers up, and each is enforced rather than remembered:

- **Content-hashed assets are immutable.** Everything under `/assets` is
  `max-age=31536000, immutable`. It was `max-age=0, must-revalidate`, so every
  returning visitor paid a revalidation round trip for every file.
- **HTML is cached at the edge** with `s-maxage` and `stale-while-revalidate`,
  which is safe here because two fetches of the same page differ by eight
  characters of router timestamp and nothing else.
- **The LCP element must not animate its opacity.** Chrome does not count a
  transparent element as painted, so an entrance fade adds its own duration to
  the measured LCP. `.rise-in-lcp` in `src/index.css` is the translate-only
  keyframe for anything that could be the largest paint.
- **`content-visibility: auto` on four below-the-fold sections**, every
  `contain-intrinsic-size` measured against the deployed page rather than
  guessed, because a wrong one buys paint time by trading away layout
  stability. Cumulative layout shift measures 0.0086 at `/ops`, the worst URL
  in the fleet, and 0.058 or under everywhere else; `lighthouserc.json` errors
  above 0.25, a ceiling with real headroom rather than the measured figure
  itself.
- **SSR import protection fails the build, not the browser.** TanStack
  Start's own `importProtection` denies `leaflet`, `tldraw`,
  `@playhtml/react`, `playhtml`, `three` and `@react-three/*` from the SSR
  bundle at build time, naming the file and the specifier instead of shipping
  a `ReferenceError: document is not defined` (this repo's own history: both
  libraries have done exactly that in production before). A `lazy()` import
  alone does not keep a module out of the SSR compile; every SSR-reachable
  client-only render site (a WebGL scene, a tldraw board, a `playhtml` room)
  renders through `<ClientOnly>`, which Start's compiler recognises and
  strips from the server build.
- **Below-the-fold homepage sections hydrate late, on purpose.** The nine
  sections under the hero (case studies, projects, experience, skills,
  circuit, doorways, contact, the multiplatform frame switcher) mount inside
  `<Hydrate when={visible()}>`, so their client JS stops competing with the
  hero for the main thread until they are near the viewport. Measured
  (`npx lighthouse --preset=perf --form-factor=mobile`, before → after):
  `/` performance 63 → 66, LCP 6.44s → 5.56s, TBT 19ms → 29ms; `/project/doori`
  performance 60 → 65, LCP 8.55s → 6.08s. Short of an 80/2.5s aspirational
  bar, said plainly rather than rounded up; `lighthouserc.json`'s own header
  is where that's written down, and only `/`'s total-blocking-time (still a
  6-15x margin against the 300ms budget) was promoted to an error gate on
  the strength of it.

Heavy static assets live on GitHub Pages, not Vercel: the five bundled WASM
apps, Excelsior's 396 magazine scans, the project screenshot galleries,
showcase films and OG cards moved out of `public/` into a top-level `heavy/`
directory Vite never copies, served from
`https://darkpandawarrior.github.io/cv` through one
[`heavy()`](src/lib/assetBase.ts) helper. Vercel's free tier caps deployment
storage at 10 GB and this site redeploys on every merge to main; moving
~251 MB off it dropped `dist/client` to about 25 MB.
[`distSize.test.ts`](src/data/distSize.test.ts) gates it going forward: no
file over 2 MB outside the hashed `assets/` bundles, the whole directory
under 60 MB. `scripts/publish-heavy-assets.mjs` rsyncs `heavy/` into the
sibling Pages checkout (a no-op if it isn't checked out);
`VITE_HEAVY_ASSET_BASE=/` in `.env.local` points local dev back at `heavy/`
directly.

Generators refuse to make things worse. A fetch that succeeds and returns
nothing is not treated as truth: `gen-chess-stats.mjs`, `gen-timeline.mjs` and
`gen-repo-stats.mjs` each compare against what is already committed and decline
to write a smaller number, because an empty success once deleted three real
chess ratings. `scripts/lib/net.mjs` gives every fetch a timeout and bounded
retries, since a stalled socket never rejects and hung the build for ten
minutes.

