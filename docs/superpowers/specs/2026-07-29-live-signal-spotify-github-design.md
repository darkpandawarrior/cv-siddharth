# Live Signal — Spotify Now Playing + GitHub activity — design spec

Date: 2026-07-29
Status: approved, ready for implementation

## Context

Full-site audit (2026-07-29) plus a feature request: surface live Spotify listening
data and live GitHub activity across the site's existing "live surface" pattern
(Terminal commands, the tldraw Blueprint canvas's custom React/three.js shapes,
persistent widgets like `FloatingChat`). The audit also found `profile.ts`'s GitHub
activity list is a hand-curated static array that's already stale (punch-list #21) —
the GitHub-activity half of this feature fixes that finding directly, not just adds
a new one.

Owner decisions locked this session:
- Spotify auth: OAuth refresh-token flow (real data), walked through interactively
  this session. Last.fm noted as a fallback pattern, not built.
- Surface scope: full multi-surface — footer chip, Terminal commands, Blueprint
  canvas live shape.
- Other integrations beyond GitHub activity: researched into a roadmap, not built.

## Architecture

Two independent Vercel Edge endpoints, following the exact pattern already
established by `api/chat.ts` / `api/_lib/chat-handler.ts`.

### `api/spotify.ts` → `api/_lib/spotify-handler.ts`

- Reads `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` from
  env. Any missing → `{ connected: false }` (same graceful-fallback shape the chat
  widget already uses for a missing provider key — no broken UI, just an honest
  "not connected" state).
- Exchanges the refresh token for an access token via `POST
  accounts.spotify.com/api/token` on every invocation. Spotify refresh tokens don't
  expire (only revocation kills them), so there's no need to cache the access token
  server-side — *(ponytail: skips a token cache; add one if latency measurably
  matters — it won't at this traffic scale)*.
- Calls `GET /v1/me/player/currently-playing`. If nothing's playing (204/empty),
  falls back to `GET /v1/me/player/recently-played?limit=5`.
- Normalizes both shapes into one response type:
  ```ts
  type SpotifyNow = {
    connected: boolean;
    isPlaying: boolean;
    track?: string;
    artist?: string;
    album?: string;
    albumArt?: string;
    url?: string;
    recent: { track: string; artist: string; albumArt?: string; url?: string; playedAt: string }[];
  };
  ```
- Response header: `Cache-Control: s-maxage=15, stale-while-revalidate=60` — Vercel's
  edge network absorbs repeat polling across visitors; no KV/DB needed.
- Known upstream quirk (confirmed via Spotify community reports, 2026): the
  `recently-played` endpoint's `played_at` field is occasionally inaccurate. We
  display it as relative time ("3m ago") so small inaccuracies aren't visible —
  *(ponytail: not worth defending against further)*.

### `api/github-activity.ts` → `api/_lib/github-activity-handler.ts`

- Calls GitHub's public `GET /users/darkpandawarrior/events/public` — keyless by
  default. If `GITHUB_TOKEN` is set (same justification `refresh-media.yml` already
  uses: "lifts the raw/API rate limit; repos are public"), sends it as a Bearer
  token for a higher rate ceiling.
- Filters to `PushEvent`, `PullRequestEvent`, `CreateEvent`; normalizes to:
  ```ts
  type GithubActivity = {
    connected: boolean; // false only on total fetch failure
    items: { repo: string; type: string; message: string; url: string; at: string }[];
  };
  ```
- Same `Cache-Control: s-maxage=15, stale-while-revalidate=60` header.

## Client

One small shared hook, `src/lib/useLiveSignal.ts` — `fetch` + `setInterval`
polling (~20s), no new dependency (this is the "one line" ladder rung, not
SWR/react-query, matching the site's existing pattern of one hand-rolled
implementation reused everywhere — `streamReply`/`chatClient.ts` is reused by both
the chat panel and the terminal's `ask` command the same way).

```ts
function useLiveSignal<T>(url: string, intervalMs = 20000): { data: T | null; error: boolean }
```

## Surfaces

1. **Footer chip** (`SiteFooter.tsx`) — album art thumbnail + track name (marquee if
   overflowing) when playing, "last played: X" otherwise; a compact GitHub-activity
   line ("pushed to Mileway · 2h ago"). Links out to the Spotify track / GitHub repo.
2. **Terminal** (`Terminal.tsx`) — `spotify`/`np` command (now playing + last 5
   tracks) and `activity`/`gh` command (recent GitHub events), added to the same
   `cmds` array as `uptime`/`neofetch`, same terminal-styled output.
3. **Blueprint canvas** (`SketchBoard.tsx`) — a new tldraw custom shape
   (`LiveSignalShapeUtil`, alongside the existing `MetricShapeUtil`/`HoloShapeUtil`)
   showing album art in a small frame that pulses/rotates while `isPlaying`, dims
   when idle or disconnected.

Every surface treats "not connected" / "fetch failed" / "nothing playing" as a
normal, first-class state — never a broken image or a thrown error.

## One-time Spotify OAuth setup

`scripts/spotify-auth.mjs` — a throwaway local script (not part of `npm run
refresh`/build): reads `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` from
`.env.local`, opens the Spotify authorize URL (scopes:
`user-read-currently-playing user-read-recently-played`,
`redirect_uri=http://127.0.0.1:8888/callback`), runs a one-shot local HTTP server
to catch the redirect code, exchanges it for tokens, prints the refresh token to
paste into `.env.local` / Vercel env vars. Run once, interactively, by the owner.

## Testing

Unit tests for both `_lib` handlers' normalization + graceful-degradation logic —
mirrors `chat-handler.test.ts`'s style: fixture upstream responses in, assert the
normalized shape and cache headers out; assert the `connected:false` path when env
vars are absent. No E2E for the visual surfaces themselves — nothing to assert
against a real account in CI.

## Also fixed this session (audit punch list, not gated by this spec)

Mechanical/objective fixes applied directly, not treated as design decisions:
Terminal keyboard trap, Blueprint 3D `prefers-reduced-motion`, `gen-og.mjs` stale
claim, `llms.txt`/`llms-full.txt` stale claims, and the remaining medium/low items
from the audit where the fix is unambiguous. One item (phone number on résumé but
not the on-page Contact section) is left alone as a possible deliberate privacy
choice.

## Roadmap (researched, not built)

- **CI badge strip** for Mileway/Kursi/PaymentsLab — keyless GitHub Actions status
  API, same pattern as the GitHub-activity feature, cheap to add later.
- **WakaTime coding-time stats** — needs a WakaTime account + API key (not
  currently set up).
- **Strava** — OAuth flow like Spotify, if the owner is active on Strava.
- **"Currently reading" widget** — dead end today: Goodreads shut down its public
  API for new keys in 2020, and StoryGraph has never shipped a public API.
