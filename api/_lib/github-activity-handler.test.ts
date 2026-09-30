import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

// github-activity-handler.ts's governor state is module-scope, keyed
// "github-activity" — resetModules + a fresh dynamic import gives each test
// its own instance instead of leaking cooldown/last-good across cases (same
// pattern as aircraft-handler.test.ts and tle-handler.test.ts).
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getGithubActivity", () => {
  it("filters to push/PR/create events and normalizes them", async () => {
    const { getGithubActivity } = await import("./github-activity-handler");
    const events = [
      {
        type: "PushEvent",
        repo: { name: "darkpandawarrior/doori" },
        created_at: "2026-07-29T09:00:00Z",
        payload: { commits: [{ message: "fix: thing" }] },
      },
      { type: "WatchEvent", repo: { name: "darkpandawarrior/gaddi" }, created_at: "2026-07-29T08:00:00Z", payload: {} },
      {
        type: "PullRequestEvent",
        repo: { name: "darkpandawarrior/gaddi" },
        created_at: "2026-07-29T07:00:00Z",
        payload: { action: "opened", number: 12, pull_request: { title: "Add feature" } },
      },
    ];
    const result = await getGithubActivity({}, fakeFetch(events) as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ repo: "darkpandawarrior/doori", type: "push" });
    expect(result.items[1]).toMatchObject({ repo: "darkpandawarrior/gaddi", type: "pr" });
  });

  it("returns connected:false when the fetch fails", async () => {
    const { getGithubActivity } = await import("./github-activity-handler");
    const result = await getGithubActivity({}, vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch);
    expect(result).toEqual({ connected: false, items: [] });
  });

  it("sends an authorization header when GITHUB_TOKEN is set", async () => {
    const { getGithubActivity } = await import("./github-activity-handler");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    await getGithubActivity({ GITHUB_TOKEN: "tok" }, fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
});

describe("handleGithubActivity", () => {
  it("caches a good response for 120s with a 900s swr, matching streams.ts's slower cadences", async () => {
    vi.stubGlobal("fetch", fakeFetch([]));
    const { handleGithubActivity } = await import("./github-activity-handler");
    const response = await handleGithubActivity(new Request("http://localhost/api/github-activity"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=120, stale-while-revalidate=900");
  });

  it("uses a short negative cache when the upstream call fails, so a recovery isn't hidden for 15 minutes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const { handleGithubActivity } = await import("./github-activity-handler");
    const response = await handleGithubActivity(new Request("http://localhost/api/github-activity"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=15, stale-while-revalidate=60");
    const body = await response.json();
    expect(body).toEqual({ connected: false, items: [] });
  });
});
