import { describe, it, expect, vi } from "vitest";
import { getGithubActivity, handleGithubActivity } from "./github-activity-handler";

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("getGithubActivity", () => {
  it("filters to push/PR/create events and normalizes them", async () => {
    const events = [
      {
        type: "PushEvent",
        repo: { name: "darkpandawarrior/mileway" },
        created_at: "2026-07-29T09:00:00Z",
        payload: { commits: [{ message: "fix: thing" }] },
      },
      { type: "WatchEvent", repo: { name: "darkpandawarrior/kursi" }, created_at: "2026-07-29T08:00:00Z", payload: {} },
      {
        type: "PullRequestEvent",
        repo: { name: "darkpandawarrior/kursi" },
        created_at: "2026-07-29T07:00:00Z",
        payload: { action: "opened", number: 12, pull_request: { title: "Add feature" } },
      },
    ];
    const result = await getGithubActivity({}, fakeFetch(events) as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ repo: "darkpandawarrior/mileway", type: "push" });
    expect(result.items[1]).toMatchObject({ repo: "darkpandawarrior/kursi", type: "pr" });
  });

  it("returns connected:false when the fetch fails", async () => {
    const result = await getGithubActivity({}, vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch);
    expect(result).toEqual({ connected: false, items: [] });
  });

  it("sends an authorization header when GITHUB_TOKEN is set", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    await getGithubActivity({ GITHUB_TOKEN: "tok" }, fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
});

describe("handleGithubActivity", () => {
  it("sets a short edge-cache header", async () => {
    const response = await handleGithubActivity(new Request("http://localhost/api/github-activity"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=15, stale-while-revalidate=60");
  });
});
