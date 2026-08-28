// Minimal, hand-written service worker for the sid.android portfolio.
//
// Hand-written (not vite-plugin-pwa) on purpose: TanStack Start orchestrates
// its own client+server Vite builds and vite-plugin-pwa has no official Start
// integration, so bolting its generateSW onto that build risks emitting the SW
// against the wrong bundle and breaking the SSR output. A static SW in public/
// sidesteps the whole build coupling and lets us GUARANTEE the one property
// that actually matters on an SSR site: navigations are network-first, so the
// server-rendered HTML is never served stale. Registered PROD-only, after load
// (see src/routes/__root.tsx), so it never touches the first SSR paint or dev
// HMR.

const VERSION = "v1";
const OFFLINE_CACHE = `offline-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const ASSET_MAX = 80;

// Precache only the offline shell + its icon — never app HTML (would serve
// stale SSR) and never the big WASM apps or the streaming chat.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.addAll([OFFLINE_URL, "/icon.svg"])));
  self.skipWaiting(); // autoUpdate: take over as soon as the new SW installs
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Never intercept: the streaming chat API and the WASM sub-apps must always hit
// the network directly (SSE streams + multi-MB binaries break under caching).
//
// The sub-app pattern is a SHAPE, not a hand-kept list of names. It used to
// name three apps explicitly and portfolio-app — added later — was never added
// to it, so the one build the list forgot had its iframe navigation and its
// 12 MB of Wasm routed through this worker anyway. Exactly the same drift bit
// `isLive` in App.tsx and the wasm cache rules in vercel.json; every directory
// under public/ that serves a Compose build ends in `-app`, so matching that
// suffix cannot forget the next one. Guarded by src/data/serviceWorker.test.ts.
const BYPASS = [/^\/api\//, /^\/[a-z0-9-]+-app\//];

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POSTs (chat) pass straight through
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // third-party: untouched
  if (BYPASS.some((re) => re.test(url.pathname))) return;

  // HTML / navigations: NETWORK-FIRST so SSR pages stay fresh; only fall back
  // to the cached shell when the network is genuinely unreachable. Precaching
  // HTML instead would serve stale SSR — the whole reason this stays net-first.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  // Immutable, content-hashed assets (images + fonts): CACHE-FIRST with a
  // bounded cache, so a repeat/offline visit still has them.
  if (request.destination === "image" || request.destination === "font") {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          cache.put(request, res.clone());
          trimCache(cache, ASSET_MAX);
        }
        return res;
      }),
    );
    return;
  }
  // Everything else (hashed JS/CSS): left to the browser HTTP cache — the
  // immutable-hash filenames already make those free to re-serve. No SW cache.
});

async function trimCache(cache, max) {
  const keys = await cache.keys();
  // ponytail: FIFO drop-oldest, good enough for a bounded asset cache; swap for
  // an LRU only if eviction churn ever shows up in practice.
  if (keys.length > max) await cache.delete(keys[0]);
}
