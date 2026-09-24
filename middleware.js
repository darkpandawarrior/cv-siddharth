// Generated after prerendering, before Vercel bundles this middleware. This is
// deliberately outside src/api TypeScript compilation: a clean tsc check runs
// before dist exists. Deployment bundling must fail if generation is missing.
import policy from "./dist/csp-policy.json";

export const config = { matcher: "/((?!api/|assets/|_vercel/).*)" };

export default function middleware(request) {
  const path = new URL(request.url).pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
  // Vercel's next() helper is precisely this standard Response protocol:
  // github.com/vercel/vercel/blob/main/packages/functions/src/middleware.ts
  const headers = new Headers({ "x-middleware-next": "1" });
  if (policy.paths.includes(path)) headers.set("Content-Security-Policy-Report-Only", policy.header);
  return new Response(null, { headers });
}
