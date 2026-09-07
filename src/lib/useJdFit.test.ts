import { describe, it, expect, vi, afterEach } from "vitest";
import { CHAT_FALLBACK, isAbortError } from "./chatClient.ts";
import { runJdFit, type JdFitUpdate } from "./useJdFit.ts";

// runJdFit is the pure, DOM-free half of useJdFit — the actual React hook is a
// thin useState/useCallback wrapper around it (same split as useLiveSignal.ts:
// fetchLiveSignal / useLiveSignal), so this is testable with a plain function
// call and no @testing-library/react.

function sse(lines: string[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(l));
        c.close();
      },
    }),
    { status: 200 },
  );
}

describe("runJdFit", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a no-op on empty or whitespace-only text — no fetch, no update", async () => {
    const updates: JdFitUpdate[] = [];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await runJdFit("   ", (u) => updates.push(u));
    expect(updates).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders the offline card immediately, then the model's reply supersedes it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sse(['data: {"text":"He fits well."}\n\n', "data: [DONE]\n\n"])),
    );
    const updates: JdFitUpdate[] = [];
    await runJdFit("Senior Android Engineer. Kotlin, Jetpack Compose, Room.", (u) => updates.push(u));

    // First update: the offline instant match, before any network response.
    expect(updates[0].content).toContain("[[jdfit:");
    expect(updates[0].done).toBe(false);
    // The model's delta REPLACES the offline card rather than appending —
    // stacking two scorecards in one bubble is worse than showing either alone.
    const last = updates.at(-1)!;
    expect(last.done).toBe(true);
    expect(last.content).toBe("He fits well.");
  });

  it("skips the offline card when the JD names nothing recognisable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse(["data: [DONE]\n\n"])));
    const updates: JdFitUpdate[] = [];
    await runJdFit("asdkjf qpwoeiru zxcvbnm", (u) => updates.push(u));
    expect(updates[0].content).toBe("");
  });

  it("keeps the offline card and appends the honest error text when every provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "nope" }), { status: 503 })));
    const updates: JdFitUpdate[] = [];
    await runJdFit("Senior Android Engineer. Kotlin, Jetpack Compose, Room.", (u) => updates.push(u));
    const last = updates.at(-1)!;
    expect(last.done).toBe(true);
    expect(last.content).toContain("[[jdfit:"); // the offline card survives
    expect(last.content).toContain(CHAT_FALLBACK);
  });

  it("reports plain fallback text with no card when there was no offline match either", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "nope" }), { status: 503 })));
    const updates: JdFitUpdate[] = [];
    await runJdFit("asdkjf qpwoeiru zxcvbnm", (u) => updates.push(u));
    const last = updates.at(-1)!;
    expect(last.content).toBe(CHAT_FALLBACK);
  });

  it("re-throws an abort instead of reporting a failure — the caller decides the stopped-state UI", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const updates: JdFitUpdate[] = [];
    const controller = new AbortController();
    const pending = runJdFit("Senior Android Engineer. Kotlin, Compose.", (u) => updates.push(u), controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy(isAbortError);
    // Only the synchronous offline update landed — nothing pretending to be a
    // final (error) state got appended after the abort.
    expect(updates).toHaveLength(1);
    expect(updates[0].done).toBe(false);
  });
});
