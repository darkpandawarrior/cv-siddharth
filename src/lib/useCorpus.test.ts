import { describe, expect, it, vi } from "vitest";
import { fetchCorpus } from "./useCorpus.ts";

// ponytail: same shape as useLiveSignal.test.ts — the extracted plain function
// is the whole contract (URL, parse, throw-on-not-ok), so no renderHook and no
// new devDependency.
describe("fetchCorpus", () => {
  it("parses the corpus payload", async () => {
    const body = { generatedAt: "x", graveyard: { losses: new Array(64).fill(0), wins: new Array(64).fill(0) } };
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    await expect(fetchCorpus(f as unknown as typeof fetch)).resolves.toEqual(body);
    expect(f).toHaveBeenCalledWith("/chess/corpus.json");
  });

  it("throws on a non-ok response so the caller can show an honest error", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchCorpus(f as unknown as typeof fetch)).rejects.toThrow("404");
  });
});
