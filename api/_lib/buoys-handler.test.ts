import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBuoys } from "./buoys-handler";
const fixture = "#STN LAT LON YYYY MM DD hh mm\n41001 34.7 -72.7 2026 09 29 22 00 90 4 MM 2.3 8 MM MM MM MM MM 25";
afterEach(() => vi.unstubAllGlobals());
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
