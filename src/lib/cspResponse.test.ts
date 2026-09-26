import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { withHtmlCsp } from "./cspResponse.ts";

it("authorizes each actual SSR body without reusing the previous render's hash", async () => {
  for (const time of [123, 456]) {
    const script = `window.hydrate={time:${time},id:"\0"}`;
    const html = `<script>${script}</script>`;
    const response = await withHtmlCsp(new Response(html, { headers: { "content-type": "text/html", "content-length": "1" } }));
    const expected = createHash("sha256").update(script.replace(/\0/g, "\uFFFD")).digest("base64");
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain(`'sha256-${expected}'`);
    expect(response.headers.has("content-length")).toBe(false);
    expect(await response.text()).toBe(html);
  }
});

it("preserves non-HTML responses without consuming their body", async () => {
  const response = new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
  expect(await withHtmlCsp(response)).toBe(response);
  expect(response.bodyUsed).toBe(false);
});

it("preserves bodyless HTTP responses without creating an invalid 304 body", async () => {
  const response = new Response(null, { status: 304, headers: { "content-type": "text/html" } });
  expect(await withHtmlCsp(response)).toBe(response);
});
