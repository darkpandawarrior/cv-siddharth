/** CSP for fallback SSR responses whose hydration timestamps change per request. */
import { createHash } from "node:crypto";
import { buildCspHeader, inlineScriptBodies } from "./csp.ts";
import { PERSON_LD, PROFILEPAGE_LD } from "./structuredData.ts";

export async function withHtmlCsp(response: Response): Promise<Response> {
  if (response.body === null || !response.headers.get("content-type")?.startsWith("text/html")) return response;
  const html = await response.text();
  const scripts = [...inlineScriptBodies(html), JSON.stringify(PERSON_LD), JSON.stringify(PROFILEPAGE_LD)];
  const hashes = scripts.map(script => createHash("sha256").update(script).digest("base64"));
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy-Report-Only", buildCspHeader(hashes));
  headers.delete("content-length");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}
