import { describe, it, expect, vi, afterEach } from "vitest";
import { subscribeOpsPoll } from "./opsPoll";
import type { Ops } from "../api/_lib/ops-handler.ts";

// audit fix (2026-09-28): useOpsPoll used to be a bare setInterval with no
// document.hidden awareness, unlike P4's shared bus (useLiveSignal.ts) — a
// background /blueprint tab still polled /api/ops every 2 min forever.
// subscribeOpsPoll is the extracted non-React primitive behind it, tested
// directly for the same reason useLiveSignal.test.ts tests
// subscribeLiveSignal directly: no @testing-library/react dependency.

const okOps: Ops = {
  connected: true,
  stale: false,
  repo: "darkpandawarrior/cv-siddharth",
  runs: [],
  neverRan: [],
  supplyChain: { connected: false, indexBuiltAt: null, apps: [] },
};
const fakeFetch = () => vi.fn(async () => new Response(JSON.stringify(okOps), { status: 200 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("subscribeOpsPoll", () => {
  it("fetches once immediately and again every intervalMs", async () => {
    vi.useFakeTimers();
    const fetchImpl = fakeFetch();
    const onData = vi.fn();
    const unsub = subscribeOpsPoll("/api/ops", 1000, onData, fetchImpl as unknown as typeof fetch);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith(okOps);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("stops polling once unsubscribed", async () => {
    vi.useFakeTimers();
    const fetchImpl = fakeFetch();
    const unsub = subscribeOpsPoll("/api/ops", 1000, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    fetchImpl.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never fetches while document.hidden is true", async () => {
    vi.useFakeTimers();
    const fakeDocument = { hidden: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("document", fakeDocument);
    const fetchImpl = fakeFetch();
    const unsub = subscribeOpsPoll("/api/ops", 1000, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).not.toHaveBeenCalled();
    unsub();
  });

  it("resumes and polls immediately when the tab becomes visible again", async () => {
    vi.useFakeTimers();
    const fakeDocument: { hidden: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; _onVisibility?: () => void } = {
      hidden: false,
      addEventListener: vi.fn((_event, handler) => {
        fakeDocument._onVisibility = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("document", fakeDocument);

    const fetchImpl = fakeFetch();
    const unsub = subscribeOpsPoll("/api/ops", 1000, vi.fn(), fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Tab goes hidden — no more polling, however long the timer runs.
    fakeDocument.hidden = true;
    fakeDocument._onVisibility?.();
    fetchImpl.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).not.toHaveBeenCalled();

    // Tab comes back — polls immediately, doesn't wait out the interval.
    fakeDocument.hidden = false;
    fakeDocument._onVisibility?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("keeps the last-good value on a failed fetch instead of throwing", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const onData = vi.fn();
    const unsub = subscribeOpsPoll("/api/ops", 1000, onData, fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(onData).not.toHaveBeenCalled();
    unsub();
  });
});
