// The shared trust-boundary primitives every API route with a live upstream
// credential needs: is this browser allowed to call us at all, and is this
// address calling too fast. Both were invented once, in chat-handler.ts, for
// the one endpoint that had a secret worth stealing. D2/D3 in the
// architecture council found three more that carry the owner's GITHUB_TOKEN
// or a Spotify OAuth exchange with neither door in place (ops, pipeline,
// github-activity, spotify) — this file is that pair, extracted so a fifth
// endpoint gets both for one import instead of one more hand-rolled copy.
// chat-handler.ts keeps its own richer wrapper (JD's tighter bucket, the CMP
// twin's native-client bucket) built on the same primitives — see there.

declare const process: { env: Record<string, string | undefined> };

// Both production hosts: the project was renamed to siddharth-pandalai on
// 2026-09-07 and cv-siddharth.vercel.app stays as a second alias while every
// link out there still points at it.
const SITE_ORIGINS = new Set(["https://siddharth-pandalai.vercel.app", "https://cv-siddharth.vercel.app"]);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Moved verbatim from chat-handler.ts's original isAllowedOrigin — see the
 * git history there for the full rationale on why a deployment's own
 * Vercel-supplied hostnames are matched rather than a `cv-siddharth-*`
 * pattern (project names on vercel.app are first-come, so a prefix match
 * would hand the key to whoever registers `cv-siddharth-evil`).
 */
export function isAllowedOrigin(
  origin: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (SITE_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin)) return true;
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && origin === `https://${host}`) return true;
  }
  return (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

/** Same header preference order as chat-handler.ts's original clientIp — see
 *  there for why the platform header wins over the client-controlled one. */
export function clientIp(request: Request): string {
  const h = (name: string) => request.headers.get(name)?.trim();
  return (
    h("x-vercel-forwarded-for") ||
    h("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** Same IPv6-/64-bucketing rationale as chat-handler.ts's original
 *  rateLimitKey — a residential IPv6 allocation IS a /64. */
export function rateLimitKey(ip: string): string {
  const bare = ip.replace(/^\[([^\]]+)\](:\d+)?$/, "$1"); // [2001:db8::1]:443
  if (!bare.includes(":") || bare.includes(".")) return bare;
  const [head, tail] = bare.split("::", 2);
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? bare.split(":")
      : [...left, ...new Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => (g || "0").toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

export type RateWindow = { ms: number; max: number };
const MAX_TRACKED_IPS = 5000; // bounded: a handful of timestamps per key worst case

/**
 * Generic sliding-window limiter, extracted from chat-handler.ts's original
 * checkRateLimit. `key` is whatever bucket the caller wants (a bare
 * rate-limited IP, or one namespaced like chat's `jd:`/`native:` prefixes) —
 * this function only counts against it. `rules` are checked in order; a
 * rejected request is NOT recorded, so a hammering client is let back in
 * once its oldest hit falls out of the window rather than being locked out
 * forever.
 *
 * Same eviction as the original: halve by oldest-hit rather than
 * `store.clear()` when the map overflows — clearing would let an attacker
 * rotating through MAX_TRACKED_IPS addresses wipe every real visitor's
 * window on demand.
 */
export function checkRateLimit(
  key: string,
  now: number,
  store: Map<string, number[]>,
  rules: RateWindow[],
): { allowed: boolean; retryAfter: number } {
  const longestWindowMs = Math.max(...rules.map((r) => r.ms));
  if (store.size > MAX_TRACKED_IPS) {
    for (const [k, times] of store) {
      if (times[times.length - 1] <= now - longestWindowMs) store.delete(k);
    }
    if (store.size > MAX_TRACKED_IPS) {
      const oldestFirst = [...store].sort((a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1]);
      for (const [k] of oldestFirst.slice(0, Math.ceil(oldestFirst.length / 2))) store.delete(k);
    }
  }

  const times = (store.get(key) ?? []).filter((t) => t > now - longestWindowMs);
  for (const rule of rules) {
    const inWindow = times.filter((t) => t > now - rule.ms);
    if (inWindow.length >= rule.max) {
      store.set(key, times);
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((inWindow[0] + rule.ms - now) / 1000)) };
    }
  }
  times.push(now);
  store.set(key, times);
  return { allowed: true, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// The perimeter for a plain read-only data endpoint (ops, pipeline,
// github-activity, spotify): reject a disallowed foreign Origin, then a
// too-fast IP. A request with NO Origin header is let through — unlike
// chat's key-spending POST, these are GETs a browser's plain `fetch()` does
// not reliably attach an Origin to for a same-origin call, and rejecting it
// would 403 the site's own widgets. The rate limiter is the real guard here,
// same honest-limitation caveat as chat-handler.ts's (per-isolate memory,
// best-effort against a distributed attacker, generous enough to still
// bound the damage).
// ---------------------------------------------------------------------------

/** 30/min: generous next to a human refreshing /ops, tight next to the curl
 *  loop that would otherwise burn the owner's 5,000 req/hr GitHub budget. */
const DEFAULT_RULES: RateWindow[] = [{ ms: 60_000, max: 30 }];

function jsonError(status: number, message: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

/**
 * Wraps a GET data-endpoint handler with the origin allowlist and rate
 * limiter. `name` keys this endpoint's own rate-limit bucket in `store` (a
 * fresh Map by default, one per call site) so a flood on one endpoint can
 * never spend another's budget — mirrors chat-handler.ts's jd/native bucket
 * isolation, at the endpoint level instead of the mode level.
 */
export function guarded(
  name: string,
  handler: (request: Request) => Promise<Response>,
  rules: RateWindow[] = DEFAULT_RULES,
  store: Map<string, number[]> = new Map(),
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) {
      return jsonError(403, "This endpoint only serves Siddharth's portfolio site.");
    }
    const key = `${name}:${rateLimitKey(clientIp(request))}`;
    const limit = checkRateLimit(key, Date.now(), store, rules);
    if (!limit.allowed) {
      return jsonError(429, "Too many requests — try again shortly.", { "retry-after": String(limit.retryAfter) });
    }
    return handler(request);
  };
}
