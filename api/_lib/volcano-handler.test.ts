import { afterEach, expect, it, vi } from "vitest";
import { parseVolcanoes } from "./volcano-handler";
const rss = '<rss><channel><item><title>Krakatau (Indonesia) - Report for 10 September-16 September 2026 - New Eruptive Activity</title><guid>vn_262000</guid><pubDate>Thu, 17 Sep 2026 01:20:04 -0400</pubDate><description>&lt;p&gt;Reported activity&lt;/p&gt;</description><georss:point>-6.1009 105.4233</georss:point></item></channel></rss>';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
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

it("reads the GitHub relay, because Smithsonian refuses Vercel's IPs", async () => {
  vi.resetModules(); const fetcher = vi.fn().mockResolvedValue(new Response(rss)); vi.stubGlobal("fetch", fetcher);
  const { handleVolcanoes } = await import("./volcano-handler");
  expect((await handleVolcanoes(new Request("https://cv.test/api/volcanoes"))).status).toBe(200);
  expect(fetcher.mock.calls[0][0]).toBe("https://raw.githubusercontent.com/darkpandawarrior/cv-siddharth/relay-volcanoes/WeeklyVolcanoRSS.xml");
});

it("serves paced weekly data with its actual age", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.resetModules();
  const fetcher = vi.fn().mockResolvedValue(new Response(rss)); vi.stubGlobal("fetch", fetcher);
  const { handleVolcanoes } = await import("./volcano-handler");
  const request = new Request("https://cv.test/api/volcanoes");
  await handleVolcanoes(request);
  vi.advanceTimersByTime(60000);
  const response = await handleVolcanoes(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ageMs: 60000, stale: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("serves young last-good weekly data after a failed refresh and during cooldown", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.resetModules();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(rss)).mockResolvedValue(new Response("unavailable", { status: 503 })); vi.stubGlobal("fetch", fetcher);
  const { handleVolcanoes } = await import("./volcano-handler");
  const request = new Request("https://cv.test/api/volcanoes");
  await handleVolcanoes(request);
  vi.advanceTimersByTime(21600000);
  const refresh = await handleVolcanoes(request);
  expect(refresh.status).toBe(200);
  expect(await refresh.json()).toMatchObject({ ageMs: 21600000, stale: true, reason: "http-503" });
  vi.advanceTimersByTime(1);
  const cooldown = await handleVolcanoes(request);
  expect(cooldown.status).toBe(200);
  expect(await cooldown.json()).toMatchObject({ ageMs: 21600001, stale: true, reason: "http-503" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([
  ["timeout", () => Promise.reject(new DOMException("private hostname", "TimeoutError"))],
  ["network", () => Promise.reject(new Error("private hostname"))],
  ["http-503", () => Promise.resolve(new Response("private details", { status: 503 }))],
  ["parse", () => Promise.resolve(new Response("not RSS"))],
])("reports %s without leaking internals and retries a cold failure promptly", async (reason, upstream) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.resetModules();
  const fetcher = vi.fn().mockImplementationOnce(upstream).mockResolvedValue(new Response(rss)); vi.stubGlobal("fetch", fetcher);
  const { handleVolcanoes } = await import("./volcano-handler");
  const request = new Request("https://cv.test/api/volcanoes");
  const failed = await handleVolcanoes(request);
  expect(failed.status).toBe(502);
  expect(await failed.json()).toEqual({ error: "Smithsonian weekly report unreachable", reason });
  const cooling = await handleVolcanoes(request);
  expect(cooling.status).toBe(502); expect((await cooling.json()).reason).toBe(reason);
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60000);
  const recovered = await handleVolcanoes(request);
  expect(recovered.status).toBe(200); expect((await recovered.json()).reason).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("refuses expired last-good data and only accepts GET", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.resetModules();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(rss)).mockResolvedValue(new Response("unavailable", { status: 503 })); vi.stubGlobal("fetch", fetcher);
  const { handleVolcanoes } = await import("./volcano-handler");
  expect((await handleVolcanoes(new Request("https://cv.test/api/volcanoes", { method: "POST" }))).status).toBe(405);
  expect(fetcher).not.toHaveBeenCalled();
  const request = new Request("https://cv.test/api/volcanoes");
  await handleVolcanoes(request);
  vi.advanceTimersByTime(86400001);
  const expired = await handleVolcanoes(request);
  expect(expired.status).toBe(502);
  expect(await expired.json()).toEqual({ error: "Smithsonian weekly report unreachable", reason: "http-503" });
});
