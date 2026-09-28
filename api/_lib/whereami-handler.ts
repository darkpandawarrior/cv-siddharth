// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as aircraft-handler.ts.
import { guarded } from "./guard.js";

// living-ledger-spec.md §9.1: a country code from the edge header only. No
// address is read, logged, stored or forwarded, and a client-supplied
// `?country=` is never consulted — the header is the only input this route
// looks at.
const COUNTRY_HEADER = "x-vercel-ip-country";
const CC_RE = /^[A-Z]{2}$/;

export type WhereamiResponse = { country: string | null };

/** Pure extractor: the request's Origin/headers only, never its URL —
 *  §9.1's "ignores any client-supplied country" is enforced by never
 *  reading `request.url` at all. */
export function countryFromHeader(request: Request): string | null {
  const raw = request.headers.get(COUNTRY_HEADER);
  if (!raw) return null;
  const cc = raw.trim().toUpperCase();
  return CC_RE.test(cc) ? cc : null;
}

async function whereamiHandler(request: Request): Promise<Response> {
  const body: WhereamiResponse = { country: countryFromHeader(request) };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // audit fix (2026-09-28): "no-store" meant one Vercel function
      // invocation per /globe visit even though presenceGeo.ts's
      // usePresenceGeo() already fetches this exactly once per mount and
      // never re-polls (a visitor's country doesn't change mid-session).
      // "private" (never "public"): the response is derived from THIS
      // request's own edge-observed x-vercel-ip-country header, so it must
      // never sit in a shared/CDN cache where visitor A's country could be
      // served back to visitor B — only this visitor's own browser may
      // cache it. 3600s: long enough that a page revisited within the hour
      // (nav away and back, a refresh) costs no invocation, short enough
      // that stale data never lingers past a session.
      "cache-control": "private, max-age=3600",
    },
  });
}

export const handleWhereami = guarded("whereami", whereamiHandler);
