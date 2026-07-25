// Vercel serverless SSR entry for TanStack Start.
//
// This Start version (1.168.x) has no Nitro/Vercel adapter — its build emits a
// plain web `fetch(Request) => Response` handler at dist/server/server.js, which
// Vercel's own presets don't wrap as a function (they treat the build as static,
// so every route 404s). This function is the missing adapter: it does exactly
// what TanStack Start's own vite-preview server does (srvx NodeRequest ->
// serverEntry.fetch -> sendNodeResponse), so behavior matches `npm run serve`.
//
// A filesystem-first rewrite in vercel.json sends every non-static, non-/api
// request here; static assets in dist/client are served directly by Vercel.
//
// .mjs (not .ts) on purpose: it imports the BUILT server (.js, produced by the
// buildCommand before functions are bundled) and skips Vercel's TS typecheck,
// which otherwise trips on this repo's `typescript` -> @typescript/typescript6
// compat alias.
import { NodeRequest, sendNodeResponse } from "srvx/node";
import serverEntry from "../dist/server/server.js";

export default async function handler(req, res) {
  const webReq = new NodeRequest({ req, res });
  const webRes = await serverEntry.fetch(webReq);
  // NB: no forced `content-encoding: identity` (that's a preview-only quirk) —
  // let Vercel compress, so production LCP isn't inflated.
  res.setHeaders(webRes.headers);
  res.writeHead(webRes.status, webRes.statusText);
  return sendNodeResponse(res, webRes);
}
