import { afterEach, expect, it, vi } from "vitest";
import { parseVolcanoes } from "./volcano-handler";
const rss = '<rss><channel><item><title>Krakatau (Indonesia) - Report for 10 September-16 September 2026 - New Eruptive Activity</title><guid>vn_262000</guid><pubDate>Thu, 17 Sep 2026 01:20:04 -0400</pubDate><description>&lt;p&gt;Reported activity&lt;/p&gt;</description><georss:point>-6.1009 105.4233</georss:point></item></channel></rss>';
afterEach(() => vi.unstubAllGlobals());
it("parses weekly RSS and never invents missing coordinates", () => {
  expect(parseVolcanoes(rss)[0]).toMatchObject({ name: "Krakatau", country: "Indonesia", lat: -6.1009, lon: 105.4233, summary: "Reported activity" });
  expect(parseVolcanoes(rss.replace(/<georss:point>.*?<\/georss:point>/, ""))[0].lat).toBeNull();
  expect(() => parseVolcanoes('<!DOCTYPE rss>'+rss)).toThrow();
});
it("uses six-hour CDN cache and fails honestly", async () => {
  vi.resetModules(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss)));
  const { handleVolcanoes } = await import("./volcano-handler");
  const res = await handleVolcanoes(new Request("https://cv.test/api/volcanoes"));
  expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("s-maxage=21600");
  vi.resetModules(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  expect((await (await import("./volcano-handler")).handleVolcanoes(new Request("https://cv.test/api/volcanoes"))).status).toBe(502);
});
