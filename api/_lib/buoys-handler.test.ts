import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBuoys } from "./buoys-handler";
const fixture = "#STN LAT LON YYYY MM DD hh mm\n41001 34.7 -72.7 2026 09 29 22 00 90 4 MM 2.3 8 MM MM MM MM MM 25";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("NDBC", () => {
  it("parses values, UTC time, missing measurements and rejects bad positions", () => {
    expect(parseBuoys(fixture)[0]).toMatchObject({ id: "41001", wave: 2.3, period: 8, water: 25, at: Date.UTC(2026, 8, 29, 22) });
    expect(parseBuoys(fixture.replace("2.3", "MM"))[0].wave).toBeNull();
    expect(parseBuoys(fixture.replace("34.7", "134.7"))).toEqual([]);
    expect(() => parseBuoys("<html>error</html>")).toThrow();
    expect(parseBuoys(fixture + ("\n" + fixture.split("\n")[1]).repeat(400))).toHaveLength(200);
  });
  it("routes a capped sample with cache headers and rejects failed/stale upstream", async () => {
    vi.resetModules();
    const fetcher = vi.fn().mockResolvedValue(new Response(fixture));
    vi.stubGlobal("fetch", fetcher);
    const { handleBuoys } = await import("./buoys-handler");
    const req = new Request("https://cv.test/api/buoys");
    const res = await handleBuoys(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=600");
    expect(JSON.stringify(await res.json()).length).toBeLessThan(40000);
    expect((await handleBuoys(req)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(300001))));
    expect((await (await import("./buoys-handler")).handleBuoys(req)).status).toBe(502);
  });
});

it("serves paced and stale buoy data with its age instead of 502", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.resetModules();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(fixture)).mockResolvedValue(new Response("bad", { status: 503 })); vi.stubGlobal("fetch", fetcher);
  const { handleBuoys } = await import("./buoys-handler"); const request = new Request("https://cv.test/api/buoys");
  await handleBuoys(request); vi.advanceTimersByTime(60000);
  expect(await (await handleBuoys(request)).json()).toMatchObject({ stale: false, ageMs: 60000 });
  vi.advanceTimersByTime(540000);
  const stale = await handleBuoys(request); expect(stale.status).toBe(200);
  expect(stale.headers.get("cache-control")).toContain("s-maxage=30");
  expect(await stale.json()).toMatchObject({ stale: true, ageMs: 600000 });
  vi.advanceTimersByTime(1);
  expect((await handleBuoys(request)).status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(3000000);
  expect((await handleBuoys(request)).status).toBe(502);
});
