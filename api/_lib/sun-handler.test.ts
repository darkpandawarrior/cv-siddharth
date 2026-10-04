import { afterEach, expect, it, vi } from "vitest";
import { parseSun } from "./sun-handler";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("accepts only positive numeric screenshot IDs", () => {
  expect(parseSun('{"id":123}')).toEqual({ id: 123 });
  for (const id of ['"../foo"', '-1', 'null']) expect(() => parseSun(`{"id":${id}}`)).toThrow();
});
it("returns observed time and fixed-host PNG URL, rejects oversized metadata", async () => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ date: "2026-09-29 22:31:45", name: "AIA 171" })).mockResolvedValueOnce(Response.json({ id: 123 })));
  const res = await (await import("./sun-handler")).handleSun(new Request("https://cv.test/api/sun"));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ image: "https://api.helioviewer.org/v2/downloadScreenshot/?id=123", observedAt: Date.parse("2026-09-29T22:31:45Z") });
  expect(res.headers.get("cache-control")).toContain("s-maxage=1800");
  vi.resetModules(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(4097))));
  expect((await (await import("./sun-handler")).handleSun(new Request("https://cv.test/api/sun"))).status).toBe(502);
});

it("serves paced and stale solar data with its age instead of 502", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.resetModules();
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ date: "2026-09-30 23:31:45", name: "AIA 171" })).mockResolvedValueOnce(Response.json({ id: 123 })).mockResolvedValue(new Response("bad", { status: 503 })); vi.stubGlobal("fetch", fetcher);
  const { handleSun } = await import("./sun-handler"); const request = new Request("https://cv.test/api/sun");
  await handleSun(request); vi.advanceTimersByTime(60000);
  expect(await (await handleSun(request)).json()).toMatchObject({ stale: false, ageMs: 60000 });
  vi.advanceTimersByTime(1740000);
  const stale = await handleSun(request); expect(stale.status).toBe(200);
  expect(stale.headers.get("cache-control")).toContain("s-maxage=30");
  expect(await stale.json()).toMatchObject({ stale: true, ageMs: 1800000 });
  vi.advanceTimersByTime(1);
  expect((await handleSun(request)).status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(5400000);
  expect((await handleSun(request)).status).toBe(502);
});
