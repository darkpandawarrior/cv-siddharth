import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLiveSignal, subscribeLiveSignal, getLiveSignalSnapshot } from "./useLiveSignal";
import { QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL } from "../world/globe/layers/feedUrls.ts";
import { QUAKE_POLL_MS } from "../world/globe/layers/quake.ts";
import { EONET_POLL_MS } from "../world/globe/layers/eonet.ts";
import { GDACS_POLL_MS } from "../world/globe/layers/hazardAlerts.ts";
import { AURORA_POLL_MS, KP_POLL_MS } from "../world/globe/layers/aurora.ts";
import { XRAY_URL, PROTON_URL, SOLAR_WIND_MAG_URL, SOLAR_WIND_SPEED_URL, SPACE_WEATHER_POLL_MS } from "../world/globe/layers/solarFlare.ts";

// ponytail: @testing-library/react isn't a devDependency, so this tests the
// extracted fetchLiveSignal(url, fetchImpl) helper directly instead of
// renderHook — same coverage of the fetch/parse/error contract, no new dep.
describe("fetchLiveSignal", () => {
  it("fetches and returns the parsed JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await fetchLiveSignal<{ ok: boolean }>("/api/spotify", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/spotify");
  });

  it("throws when the response is not ok", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(fetchLiveSignal("/api/spotify", fetchImpl as unknown as typeof fetch)).rejects.toThrow("500");
  });
});

// P4 — the shared bus, exercised through the non-React primitive it's built
// on (subscribeLiveSignal/getLiveSignalSnapshot) for the same reason
// fetchLiveSignal is tested directly above.
describe("subscribeLiveSignal (the shared per-URL bus)", () => {
  const url = "/api/github-activity-test-bus";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the first visible fetch without advancing an installed clock", async () => {
    const doc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", doc);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ features: [] })));
    const unsub = subscribeLiveSignal("/first-poll-frozen-clock", QUAKE_POLL_MS, vi.fn(), fetchImpl);
    try {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(getLiveSignalSnapshot("/first-poll-frozen-clock").data).toEqual({ features: [] });
    } finally {
      unsub();
      vi.unstubAllGlobals();
    }
  });

  it("makes one fetch per interval no matter how many subscribers share the URL", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
    const onChange = vi.fn();

    const unsub1 = subscribeLiveSignal(url, 1000, onChange, fetchImpl as unknown as typeof fetch);
    const unsub2 = subscribeLiveSignal(url, 1000, onChange, fetchImpl as unknown as typeof fetch);
    const unsub3 = subscribeLiveSignal(url, 1000, onChange, fetchImpl as unknown as typeof fetch);

    await vi.advanceTimersByTimeAsync(0); // flush the immediate fetch on first subscribe
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    unsub1();
    unsub2();
    unsub3();
  });

  it("polls at the smallest interval any subscriber asked for", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
    const url2 = "/api/github-activity-test-bus-2";
    const unsubSlow = subscribeLiveSignal(url2, 5000, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    fetchImpl.mockClear();

    const unsubFast = subscribeLiveSignal(url2, 500, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // the fast subscriber's cadence won, not 5000ms

    unsubSlow();
    unsubFast();
  });

  it("shares one snapshot across subscribers and updates it on tick", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ n: 42 }), { status: 200 }));
    const url3 = "/api/github-activity-test-bus-3";
    const unsub = subscribeLiveSignal(url3, 1000, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(getLiveSignalSnapshot<{ n: number }>(url3)).toMatchObject({ data: { n: 42 }, error: false });
    unsub();
  });

  it("stops polling once the last subscriber unsubscribes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
    const url4 = "/api/github-activity-test-bus-4";
    const unsub = subscribeLiveSignal(url4, 1000, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    fetchImpl.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("exposes nextPollAt in the future once the first fetch has settled", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
    const url5 = "/api/github-activity-test-bus-5";
    const unsub = subscribeLiveSignal(url5, 1000, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(getLiveSignalSnapshot(url5).nextPollAt).toBeGreaterThan(Date.now());
    unsub();
  });

  it("pauses polling while document.hidden is true", async () => {
    // vitest.config.ts runs this suite in the "node" environment (no real
    // `document`) — same reason isHidden()/ensureVisibilityHandling treat a
    // missing `document` as "visible": a minimal stand-in is enough to
    // exercise the branch that reads document.hidden.
    const fakeDocument = { hidden: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("document", fakeDocument);
    try {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
      const url6 = "/api/github-activity-test-bus-6";
      const unsub = subscribeLiveSignal(url6, 1000, vi.fn(), fetchImpl as unknown as typeof fetch);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(getLiveSignalSnapshot(url6).nextPollAt).toBeNull();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchImpl).not.toHaveBeenCalled();
      unsub();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    [QUAKES_URL, QUAKE_POLL_MS], [EONET_URL, EONET_POLL_MS],
    [GDACS_URL, GDACS_POLL_MS], [OVATION_URL, AURORA_POLL_MS], [KP_URL, KP_POLL_MS],
    ...[XRAY_URL, PROTON_URL, SOLAR_WIND_MAG_URL, SOLAR_WIND_SPEED_URL].map(url => [url, SPACE_WEATHER_POLL_MS] as const),
  ] as const)("resumes only overdue %s and coalesces visibility events", async (feedUrl, cadence) => {
    const doc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", doc);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ n: 1 })));
    const unsub = subscribeLiveSignal(feedUrl, cadence, vi.fn(), fetchImpl);
    try {
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 2; i++) {
        doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(15);
        doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(cadence);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
      doc.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(cadence);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      unsub();
      vi.unstubAllGlobals();
    }
  });

});
