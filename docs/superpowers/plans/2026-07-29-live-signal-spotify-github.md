# Live Signal (Spotify + GitHub activity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live Spotify now-playing/recently-played and live GitHub activity, surfaced through three existing site patterns (footer widget, Terminal command, Blueprint tldraw canvas), backed by two new Vercel Edge functions.

**Architecture:** Two Vercel Edge functions (`api/spotify.ts`, `api/github-activity.ts`) each backed by a pure `Request -> Response` handler in `api/_lib/`, following the exact structure of `api/chat.ts`/`api/_lib/chat-handler.ts`. One shared client polling hook (`src/lib/useLiveSignal.ts`) feeds three UI surfaces.

**Tech Stack:** TypeScript, Vercel Edge Runtime (Web-standard `Request`/`Response`, no Node APIs), Vitest, React 19, tldraw (`ShapeUtil`).

## Global Constraints

- Edge handler files import sibling `_lib` modules with an explicit `.js` extension (Vercel's builder type-checks under `moduleResolution: "node16"`) — see `api/chat.ts:5`.
- Env var access in `_lib` files uses the local `declare const process: { env: Record<string, string | undefined> }` shim, not `@types/node` — see `api/_lib/chat-handler.ts:11`.
- No new npm dependencies. No SWR/react-query — a hand-rolled `fetch` + `setInterval` hook matches the site's existing "one implementation, reused everywhere" convention.
- Every new client surface must render a graceful "not connected" / "nothing playing" state — never a broken image, never a thrown error reaching the UI.
- `Cache-Control: s-maxage=15, stale-while-revalidate=60` on both new edge responses.

---

### Task 1: Spotify API layer

**Files:**
- Create: `api/_lib/spotify-handler.ts`
- Create: `api/_lib/spotify-handler.test.ts`
- Create: `api/spotify.ts`

**Interfaces:**
- Produces: `export async function handleSpotify(request: Request): Promise<Response>` from `spotify-handler.ts`, response body JSON matches:
  ```ts
  type SpotifyTrack = { track: string; artist: string; albumArt?: string; url?: string; playedAt?: string };
  type SpotifyNow = { connected: boolean; isPlaying: boolean; track?: string; artist?: string; album?: string; albumArt?: string; url?: string; recent: SpotifyTrack[] };
  ```
- Produces: `export async function getSpotifyNow(env: Record<string, string | undefined>, fetchImpl?: typeof fetch): Promise<SpotifyNow>` — the testable core, called by `handleSpotify`.

- [ ] **Step 1: Write the failing test**

Create `api/_lib/spotify-handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getSpotifyNow, handleSpotify } from "./spotify-handler";

function fakeFetch(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.keys(responses).find((k) => url.includes(k));
    if (!match) throw new Error(`unexpected fetch: ${url}`);
    const { status, body } = responses[match];
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
}

describe("getSpotifyNow", () => {
  it("returns connected:false when env vars are missing", async () => {
    const result = await getSpotifyNow({});
    expect(result).toEqual({ connected: false, isPlaying: false, recent: [] });
  });

  it("returns the currently-playing track when Spotify reports one", async () => {
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": {
        status: 200,
        body: {
          is_playing: true,
          item: {
            name: "Song A",
            artists: [{ name: "Artist A" }],
            album: { name: "Album A", images: [{ url: "https://img/a.jpg" }] },
            external_urls: { spotify: "https://open.spotify.com/track/a" },
          },
        },
      },
    });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.isPlaying).toBe(true);
    expect(result.track).toBe("Song A");
    expect(result.artist).toBe("Artist A");
    expect(result.albumArt).toBe("https://img/a.jpg");
  });

  it("falls back to recently-played when nothing is currently playing", async () => {
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": { status: 204 },
      "recently-played": {
        status: 200,
        body: {
          items: [
            {
              played_at: "2026-07-29T10:00:00Z",
              track: {
                name: "Song B",
                artists: [{ name: "Artist B" }],
                album: { name: "Album B", images: [{ url: "https://img/b.jpg" }] },
                external_urls: { spotify: "https://open.spotify.com/track/b" },
              },
            },
          ],
        },
      },
    });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.isPlaying).toBe(false);
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0].track).toBe("Song B");
  });

  it("returns connected:false when the token exchange fails", async () => {
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "bad" };
    const fetchImpl = fakeFetch({ "accounts.spotify.com/api/token": { status: 400, body: { error: "invalid_grant" } } });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch);
    expect(result.connected).toBe(false);
  });
});

describe("handleSpotify", () => {
  it("sets a short edge-cache header", async () => {
    const response = await handleSpotify(new Request("http://localhost/api/spotify"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=15, stale-while-revalidate=60");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/spotify-handler.test.ts`
Expected: FAIL — `spotify-handler` module not found.

- [ ] **Step 3: Write the implementation**

Create `api/_lib/spotify-handler.ts`:

```ts
declare const process: { env: Record<string, string | undefined> };

export type SpotifyTrack = { track: string; artist: string; albumArt?: string; url?: string; playedAt?: string };
export type SpotifyNow = {
  connected: boolean;
  isPlaying: boolean;
  track?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  url?: string;
  recent: SpotifyTrack[];
};

const EMPTY: SpotifyNow = { connected: false, isPlaying: false, recent: [] };

interface SpotifyApiTrack {
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
}

function fromApiTrack(t: SpotifyApiTrack) {
  return {
    track: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    albumArt: t.album.images[0]?.url,
    url: t.external_urls.spotify,
  };
}

async function getAccessToken(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } = env;
  if (!id || !secret || !refresh) return null;
  const res = await fetchImpl("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }).toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Testable core: no Request/Response, just env + an injectable fetch. */
export async function getSpotifyNow(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<SpotifyNow> {
  const token = await getAccessToken(env, fetchImpl);
  if (!token) return EMPTY;

  const auth = { authorization: `Bearer ${token}` };
  const nowRes = await fetchImpl("https://api.spotify.com/v1/me/player/currently-playing", { headers: auth });

  if (nowRes.status === 200) {
    const json = (await nowRes.json()) as { is_playing: boolean; item: SpotifyApiTrack | null };
    if (json.item) {
      return { connected: true, isPlaying: json.is_playing, ...fromApiTrack(json.item), recent: [] };
    }
  }

  const recentRes = await fetchImpl("https://api.spotify.com/v1/me/player/recently-played?limit=5", { headers: auth });
  if (!recentRes.ok) return { connected: true, isPlaying: false, recent: [] };
  const recentJson = (await recentRes.json()) as { items: { played_at: string; track: SpotifyApiTrack }[] };
  return {
    connected: true,
    isPlaying: false,
    recent: recentJson.items.map((it) => ({ ...fromApiTrack(it.track), playedAt: it.played_at })),
  };
}

export async function handleSpotify(request: Request): Promise<Response> {
  void request;
  const now = await getSpotifyNow(process.env);
  return new Response(JSON.stringify(now), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
    },
  });
}
```

Create `api/spotify.ts`:

```ts
// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports.
import { handleSpotify } from "./_lib/spotify-handler.js";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleSpotify(request);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/spotify-handler.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add api/spotify.ts api/_lib/spotify-handler.ts api/_lib/spotify-handler.test.ts
git commit -m "feat(spotify): edge endpoint for now-playing + recently-played"
```

---

### Task 2: GitHub activity API layer

**Files:**
- Create: `api/_lib/github-activity-handler.ts`
- Create: `api/_lib/github-activity-handler.test.ts`
- Create: `api/github-activity.ts`

**Interfaces:**
- Produces: `export async function handleGithubActivity(request: Request): Promise<Response>`.
- Produces: `export async function getGithubActivity(env: Record<string, string | undefined>, fetchImpl?: typeof fetch): Promise<GithubActivity>`.
  ```ts
  type GithubActivityItem = { repo: string; type: "push" | "pr" | "create"; message: string; url: string; at: string };
  type GithubActivity = { connected: boolean; items: GithubActivityItem[] };
  ```

- [ ] **Step 1: Write the failing test**

Create `api/_lib/github-activity-handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getGithubActivity, handleGithubActivity } from "./github-activity-handler";

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("getGithubActivity", () => {
  it("filters to push/PR/create events and normalizes them", async () => {
    const events = [
      {
        type: "PushEvent",
        repo: { name: "darkpandawarrior/mileway" },
        created_at: "2026-07-29T09:00:00Z",
        payload: { commits: [{ message: "fix: thing" }] },
      },
      { type: "WatchEvent", repo: { name: "darkpandawarrior/kursi" }, created_at: "2026-07-29T08:00:00Z", payload: {} },
      {
        type: "PullRequestEvent",
        repo: { name: "darkpandawarrior/kursi" },
        created_at: "2026-07-29T07:00:00Z",
        payload: { action: "opened", number: 12, pull_request: { title: "Add feature" } },
      },
    ];
    const result = await getGithubActivity({}, fakeFetch(events) as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ repo: "darkpandawarrior/mileway", type: "push" });
    expect(result.items[1]).toMatchObject({ repo: "darkpandawarrior/kursi", type: "pr" });
  });

  it("returns connected:false when the fetch fails", async () => {
    const result = await getGithubActivity({}, vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch);
    expect(result).toEqual({ connected: false, items: [] });
  });

  it("sends an authorization header when GITHUB_TOKEN is set", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    await getGithubActivity({ GITHUB_TOKEN: "tok" }, fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
});

describe("handleGithubActivity", () => {
  it("sets a short edge-cache header", async () => {
    const response = await handleGithubActivity(new Request("http://localhost/api/github-activity"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=15, stale-while-revalidate=60");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/github-activity-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `api/_lib/github-activity-handler.ts`:

```ts
declare const process: { env: Record<string, string | undefined> };

const GITHUB_USER = "darkpandawarrior";

export type GithubActivityItem = { repo: string; type: "push" | "pr" | "create"; message: string; url: string; at: string };
export type GithubActivity = { connected: boolean; items: GithubActivityItem[] };

interface RawEvent {
  type: string;
  repo: { name: string };
  created_at: string;
  payload: Record<string, unknown>;
}

function normalize(e: RawEvent): GithubActivityItem | null {
  const url = `https://github.com/${e.repo.name}`;
  if (e.type === "PushEvent") {
    const commits = (e.payload.commits as { message: string }[] | undefined) ?? [];
    return { repo: e.repo.name, type: "push", message: commits[0]?.message ?? "pushed", url, at: e.created_at };
  }
  if (e.type === "PullRequestEvent") {
    const pr = e.payload.pull_request as { title: string } | undefined;
    return { repo: e.repo.name, type: "pr", message: pr?.title ?? "opened a PR", url, at: e.created_at };
  }
  if (e.type === "CreateEvent") {
    const refType = e.payload.ref_type as string | undefined;
    return { repo: e.repo.name, type: "create", message: `created ${refType ?? "ref"}`, url, at: e.created_at };
  }
  return null;
}

export async function getGithubActivity(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubActivity> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetchImpl(`https://api.github.com/users/${GITHUB_USER}/events/public`, { headers });
  if (!res.ok) return { connected: false, items: [] };
  const events = (await res.json()) as RawEvent[];
  const items = events.map(normalize).filter((i): i is GithubActivityItem => i !== null).slice(0, 5);
  return { connected: true, items };
}

export async function handleGithubActivity(request: Request): Promise<Response> {
  void request;
  const activity = await getGithubActivity(process.env);
  return new Response(JSON.stringify(activity), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
    },
  });
}
```

Create `api/github-activity.ts`:

```ts
import { handleGithubActivity } from "./_lib/github-activity-handler.js";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleGithubActivity(request);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/github-activity-handler.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/github-activity.ts api/_lib/github-activity-handler.ts api/_lib/github-activity-handler.test.ts
git commit -m "feat(github): edge endpoint for live recent activity"
```

---

### Task 3: `useLiveSignal` client hook

**Files:**
- Create: `src/lib/useLiveSignal.ts`
- Create: `src/lib/useLiveSignal.test.ts`

**Interfaces:**
- Produces: `export function useLiveSignal<T>(url: string, intervalMs?: number): { data: T | null; error: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/useLiveSignal.test.ts` (Vitest + `@testing-library/react`'s `renderHook` — check if `@testing-library/react` is already a devDependency; if not, test via a minimal manual harness instead, since no new dependency may be added):

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { useLiveSignal } from "./useLiveSignal";
import { renderHook, waitFor, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useLiveSignal", () => {
  it("fetches once on mount and exposes the parsed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const { result } = renderHook(() => useLiveSignal<{ ok: boolean }>("/api/spotify", 999999));
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }));
    expect(result.current.error).toBe(false);
  });

  it("sets error:true when the fetch fails, keeps prior data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const { result } = renderHook(() => useLiveSignal<{ ok: boolean }>("/api/spotify", 999999));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
```

If `@testing-library/react` is not present in `package.json`, skip `renderHook` and instead write a plain-function test against an extracted `fetchLiveSignal(url, fetchImpl)` helper that `useLiveSignal` wraps — same coverage, no new dependency. Prefer this fallback: check `package.json` `devDependencies` before writing the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/useLiveSignal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/useLiveSignal.ts`:

```ts
import { useEffect, useRef, useState } from "react";

/** Fetches `url` once immediately, then every `intervalMs`. One shared
 * implementation for every Live Signal surface (footer, terminal, blueprint) —
 * same "one implementation, reused everywhere" pattern as chatClient.ts. */
export function useLiveSignal<T>(url: string, intervalMs = 20000): { data: T | null; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;
    let timer: ReturnType<typeof setInterval>;

    async function tick() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as T;
        if (liveRef.current) {
          setData(json);
          setError(false);
        }
      } catch {
        if (liveRef.current) setError(true);
      }
    }

    tick();
    timer = setInterval(tick, intervalMs);
    return () => {
      liveRef.current = false;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  return { data, error };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/useLiveSignal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useLiveSignal.ts src/lib/useLiveSignal.test.ts
git commit -m "feat(live-signal): shared polling hook for spotify/github widgets"
```

---

### Task 4: Dev middleware wiring

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `handleSpotify` from `api/_lib/spotify-handler.ts` (Task 1), `handleGithubActivity` from `api/_lib/github-activity-handler.ts` (Task 2).

Run this task AFTER Tasks 1 and 2 are committed (it imports their modules by path).

- [ ] **Step 1: Add a generic GET-API dev plugin and register both routes**

In `vite.config.ts`, add below `chatApiDevPlugin` (same file, same pattern, simplified for GET-only/no-body-forwarding since these endpoints take no request body):

```ts
/** Serves a GET-only Edge handler during local dev — same web-standard
 * handler Vercel runs in production, no vercel dev needed. Simpler than
 * chatApiDevPlugin: these endpoints take no request body. */
function edgeGetApiDevPlugin(path: string, modulePath: string, exportName: string): Plugin {
  return {
    name: `edge-get-api-dev:${path}`,
    configureServer(server) {
      server.middlewares.use(path, async (req: IncomingMessage, res: ServerResponse) => {
        const mod = await server.ssrLoadModule(modulePath);
        const handler = mod[exportName] as (r: Request) => Promise<Response>;
        const response = await handler(new Request(`http://localhost${path}`));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      });
    },
  };
}
```

Then add both plugins to the `plugins` array, right after `chatApiDevPlugin()`:

```ts
    chatApiDevPlugin(),
    edgeGetApiDevPlugin("/api/spotify", "/api/_lib/spotify-handler.ts", "handleSpotify"),
    edgeGetApiDevPlugin("/api/github-activity", "/api/_lib/github-activity-handler.ts", "handleGithubActivity"),
```

- [ ] **Step 2: Manually verify in dev**

Run: `npm run dev`, then in another terminal: `curl -s http://localhost:5173/api/spotify | head -c 200` and `curl -s http://localhost:5173/api/github-activity | head -c 200`.
Expected: both return JSON (`{"connected":false,...}` for Spotify until Task 6's OAuth setup runs; GitHub activity returns real data immediately since it's keyless).

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat(dev): serve /api/spotify and /api/github-activity locally"
```

---

### Task 5: Footer "now" chip

**Files:**
- Modify: `src/SiteFooter.tsx`

**Interfaces:**
- Consumes: `useLiveSignal` (Task 3) with type params `SpotifyNow` (Task 1) and `GithubActivity` (Task 2) — import only the type via `import type`.

- [ ] **Step 1: Add the chip**

In `src/SiteFooter.tsx`, add imports:

```ts
import { useLiveSignal } from "./lib/useLiveSignal.ts";
import type { SpotifyNow } from "../api/_lib/spotify-handler.ts";
import type { GithubActivity } from "../api/_lib/github-activity-handler.ts";
```

Add a `NowChip` component in the same file, above `SiteFooter`:

```tsx
function NowChip() {
  const { data: spotify } = useLiveSignal<SpotifyNow>("/api/spotify");
  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity");

  const nowTrack = spotify?.connected && (spotify.isPlaying ? spotify.track : spotify.recent[0]?.track);
  const nowArtist = spotify?.connected && (spotify.isPlaying ? spotify.artist : spotify.recent[0]?.artist);
  const nowArt = spotify?.connected ? (spotify.isPlaying ? spotify.albumArt : spotify.recent[0]?.albumArt) : undefined;
  const nowUrl = spotify?.connected ? (spotify.isPlaying ? spotify.url : spotify.recent[0]?.url) : undefined;
  const latestActivity = activity?.connected ? activity.items[0] : undefined;

  if (!nowTrack && !latestActivity) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 border-t border-line py-3 text-xs text-muted">
      {nowTrack && (
        <a href={nowUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-accent">
          {nowArt && <img src={nowArt} alt="" width={16} height={16} className="rounded-sm" />}
          <span>{spotify?.isPlaying ? "Now playing" : "Last played"}: {nowTrack} · {nowArtist}</span>
        </a>
      )}
      {latestActivity && (
        <a href={latestActivity.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
          {latestActivity.type === "push" ? "Pushed to" : latestActivity.type === "pr" ? "Opened a PR on" : "Created a ref on"} {latestActivity.repo.split("/")[1]}
        </a>
      )}
    </div>
  );
}
```

Mount it inside the `<footer>` element in `SiteFooter()`, between the two existing `<div>` blocks (after the sitemap grid, before the "Built with…" line):

```tsx
      </div>
      <NowChip />
      <div className="border-t border-line py-5 text-center text-xs text-muted">
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, load `/`, scroll to the footer. With no Spotify env vars set yet, only the GitHub activity half should render (or neither, if `nowTrack`/`latestActivity` are both falsy) — confirm nothing renders broken (no missing-image icon, no layout shift on data arrival).

- [ ] **Step 3: Commit**

```bash
git add src/SiteFooter.tsx
git commit -m "feat(footer): live now-playing + github-activity chip"
```

---

### Task 6: Terminal commands + keyboard-trap fix

**Files:**
- Modify: `src/Terminal.tsx`

**Interfaces:**
- Consumes: `useLiveSignal`, `SpotifyNow`, `GithubActivity` (same imports as Task 5).

This task also fixes audit finding #1 (keyboard trap) in the same file, since splitting it into a separate concurrent task would race on this file.

- [ ] **Step 1: Fix the keyboard trap**

Find the Tab-handling code around `Terminal.tsx:950-953` (search for `preventDefault` near a `Tab`/`key === "Tab"` check). Change the unconditional `e.preventDefault()` so it only fires when completion actually applies — mirror the guard already used in `FloatingChat.tsx:482-486`:

```ts
if (e.key === "Tab" && !e.shiftKey && complete(value) !== value) {
  e.preventDefault();
  // ...existing completion logic
}
```

(Read `FloatingChat.tsx:482-486` first to match its exact guard shape before editing — do not guess the condition.)

- [ ] **Step 2: Add the `spotify`/`np` and `activity`/`gh` commands**

In the `cmds` array (same array holding `coffee`, `uptime`, `vim` — see `Terminal.tsx:660-683`), add:

```ts
{
  name: "spotify",
  alias: ["np"],
  help: "what I'm listening to",
  run: () => <SpotifyBlock />,
},
{
  name: "activity",
  alias: ["gh"],
  help: "recent GitHub activity",
  run: () => <GithubActivityBlock />,
},
```

(If the existing command objects don't have an `alias` field, check the type used for `cmds` entries first — add `alias?: string[]` to that type and handle it in whatever function dispatches a typed command to its matching entry, rather than registering `np` as a second full duplicate object.)

Add the two block components near `Neofetch` (same file):

```tsx
function SpotifyBlock() {
  const { data } = useLiveSignal<SpotifyNow>("/api/spotify");
  if (!data) return <Dim>reading now-playing…</Dim>;
  if (!data.connected) return <Dim>spotify: not connected</Dim>;
  if (data.isPlaying) {
    return <span>▶ <Hi>{data.track}</Hi> — {data.artist}</span>;
  }
  if (data.recent.length === 0) return <Dim>nothing recent</Dim>;
  return (
    <div>
      <Dim>not playing. recent:</Dim>
      {data.recent.map((t, i) => (
        <div key={i}>· {t.track} — {t.artist}</div>
      ))}
    </div>
  );
}

function GithubActivityBlock() {
  const { data } = useLiveSignal<GithubActivity>("/api/github-activity");
  if (!data) return <Dim>reading github activity…</Dim>;
  if (!data.connected || data.items.length === 0) return <Dim>no recent activity</Dim>;
  return (
    <div>
      {data.items.map((it, i) => (
        <div key={i}>· [{it.repo.split("/")[1]}] {it.message}</div>
      ))}
    </div>
  );
}
```

Add the two type-only imports and `useLiveSignal` import at the top of `Terminal.tsx` alongside its existing imports.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open `/terminal`, run `spotify` and `activity` (and confirm `np`/`gh` aliases work), confirm Tab no longer traps focus when the command palette isn't offering a completion (tab away from the terminal input with the keyboard, confirm focus moves to the next focusable element on the page).

- [ ] **Step 4: Commit**

```bash
git add src/Terminal.tsx
git commit -m "feat(terminal): spotify + github-activity commands; fix Tab keyboard trap"
```

---

### Task 7: Blueprint canvas live shape

**Files:**
- Modify: `src/SketchBoard.tsx`
- Modify: `src/blueprintData.ts`

**Interfaces:**
- Consumes: `useLiveSignal`, `SpotifyNow` (same imports as Task 5).

- [ ] **Step 1: Register the shape type**

In `src/SketchBoard.tsx`, extend the `declare module "tldraw"` block (near `sid-metric`/`sid-holo`):

```ts
    "sid-live": { w: number; h: number };
```

- [ ] **Step 2: Implement `LiveSignalShapeUtil`**

Add below `HoloShapeUtil` in the same file, following its exact structural pattern (`getDefaultProps`, `getGeometry`, `component`, `getIndicatorPath`):

```tsx
type LiveShape = TLShape<"sid-live">;

function LiveSignalCard() {
  const { data } = useLiveSignal<SpotifyNow>("/api/spotify");
  const playing = data?.connected && data.isPlaying;
  const art = data?.connected ? (data.isPlaying ? data.albumArt : data.recent[0]?.albumArt) : undefined;
  const label = data?.connected
    ? data.isPlaying
      ? `${data.track} — ${data.artist}`
      : data.recent[0]
        ? `last: ${data.recent[0].track}`
        : "quiet"
    : "not connected";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 14,
        background: "rgba(11, 15, 13, 0.92)",
        border: "1px solid rgba(61, 220, 132, 0.4)",
        fontFamily: "var(--font-mono)",
        padding: 12,
      }}
    >
      {art ? (
        <img
          src={art}
          alt=""
          width={64}
          height={64}
          style={{
            borderRadius: "50%",
            animation: playing ? "spin 4s linear infinite" : "none",
            opacity: playing ? 1 : 0.5,
          }}
        />
      ) : (
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(61,220,132,0.15)" }} />
      )}
      <span style={{ fontSize: 10, color: "rgba(232, 239, 233, 0.75)", textAlign: "center" }}>{label}</span>
    </div>
  );
}

class LiveSignalShapeUtil extends ShapeUtil<LiveShape> {
  static override type = "sid-live" as const;

  getDefaultProps(): LiveShape["props"] {
    return { w: 160, h: 140 };
  }

  getGeometry(shape: LiveShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  component(shape: LiveShape) {
    return (
      <HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
        <LiveSignalCard />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: LiveShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
```

Add the imports this needs at the top of `SketchBoard.tsx`: `useLiveSignal` from `./lib/useLiveSignal.ts`, `type { SpotifyNow }` from `../api/_lib/spotify-handler.ts`.

Register `LiveSignalShapeUtil` wherever `MetricShapeUtil`/`HoloShapeUtil` are passed to `Tldraw`'s `shapeUtils` prop (search for where those two classes are referenced together, likely a `shapeUtils={[MetricShapeUtil, HoloShapeUtil]}` array — add `LiveSignalShapeUtil` to it).

If `@keyframes spin` doesn't already exist in `src/index.css`, add it once:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

Check `src/index.css` for an existing `@media (prefers-reduced-motion: reduce)` block; if present, add a rule there disabling the `spin` animation, matching how the rest of the site already handles reduced motion.

- [ ] **Step 3: Add the node to the canvas**

In `src/blueprintData.ts`, add one entry to `NODES` (or wherever shapes get placed on the canvas — check how `HoloShapeUtil`'s instance gets its position/size on the canvas, since `NODES` in the current file holds plain-rectangle metadata, not tldraw shape records; if live shapes are placed via a different mechanism — e.g. a `LIVE_SHAPES` array or inline in `SketchBoard.tsx`'s canvas-mount effect — follow that existing mechanism instead of guessing). Place it near the `"chat"` node (`x: 1180, y: 120`) since both represent "live" surfaces.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/blueprint`, switch to Sketch mode, confirm the new live card renders, shows "not connected" gracefully with no Spotify env vars set, and doesn't break canvas pan/zoom/persistence.

- [ ] **Step 5: Commit**

```bash
git add src/SketchBoard.tsx src/blueprintData.ts src/index.css
git commit -m "feat(blueprint): live spotify shape on the canvas"
```

---

### Task 8: One-time Spotify OAuth script

**Files:**
- Create: `scripts/spotify-auth.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/spotify-auth.mjs`:

```js
#!/usr/bin/env node
// One-time local helper: trades a Spotify Developer app's client id/secret for
// a long-lived refresh token. Not part of the build/refresh pipeline — run by
// hand, once, then paste SPOTIFY_REFRESH_TOKEN into .env.local / Vercel env.
import http from "node:http";
import { config } from "dotenv";

config({ path: ".env.local" });

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPES = "user-read-currently-playing user-read-recently-played";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local first (from your Spotify Developer app).");
  process.exit(1);
}

const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: "code",
  redirect_uri: REDIRECT_URI,
  scope: SCOPES,
})}`;

console.log("\nOpen this URL, log in, and approve access:\n\n" + authUrl + "\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") return res.end();
  const code = url.searchParams.get("code");
  res.end("Done — you can close this tab and go back to the terminal.");
  server.close();

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
  });
  const json = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("Token exchange failed:", json);
    process.exit(1);
  }
  console.log("\nAdd this to .env.local and Vercel's env vars:\n");
  console.log(`SPOTIFY_REFRESH_TOKEN=${json.refresh_token}\n`);
});

server.listen(8888);
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add: `"spotify:auth": "node scripts/spotify-auth.mjs"`.

- [ ] **Step 3: Commit**

```bash
git add scripts/spotify-auth.mjs package.json
git commit -m "feat(spotify): one-time OAuth helper script"
```

(Do not run this script as part of this task — it requires the owner's own Spotify Developer app credentials and a real browser login. It's run interactively, separately, once the owner has created that app.)

---

### Task 9: Docs

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`

- [ ] **Step 1: Document the new env vars**

Append to `.env.local.example`:

```
# Spotify "now playing" widget — optional. Create a free app at
# developer.spotify.com/dashboard, then run `npm run spotify:auth` once to
# get SPOTIFY_REFRESH_TOKEN. Without these, the widget shows "not connected".
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=

# GitHub activity widget — optional, works keyless. Set this only to raise
# the rate ceiling (same token/reasoning refresh-media.yml already uses).
GITHUB_TOKEN=
```

- [ ] **Step 2: Add a short README section**

Add a subsection under "Interactive surfaces" in `README.md` describing the Live Signal feature (footer chip, `spotify`/`np` and `activity`/`gh` terminal commands, Blueprint canvas card) and pointing to `npm run spotify:auth` for setup — one paragraph, matching the existing terse style of that section.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example README.md
git commit -m "docs: document spotify/github live-signal setup"
```
