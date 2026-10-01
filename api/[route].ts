// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as the old per-route files this
// replaces.
//
// One dynamic-segment file replaces the 11 former top-level api/*.ts files
// (api/aircraft.ts, api/chat.ts, ...). Vercel's file-system router matches
// any single /api/<segment> path to this file the same way it would match a
// literal api/wind.ts — see api/_lib/router.ts for the before/after count
// and every public URL this preserves byte-identical.
import { dispatch } from "./_lib/router.js";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return dispatch(request);
}
