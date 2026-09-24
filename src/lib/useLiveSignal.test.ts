import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLiveSignal, subscribeLiveSignal, getLiveSignalSnapshot } from "./useLiveSignal";

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
});
