import { describe, it, expect, vi } from "vitest";
import { fetchLiveSignal } from "./useLiveSignal";

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
