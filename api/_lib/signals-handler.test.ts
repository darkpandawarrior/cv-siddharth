import { describe, it, expect, vi } from "vitest";
import { getSignals, handleSignals } from "./signals-handler";

const LICHESS_URL = "https://lichess.org/api/users/status?ids=darkpandawarrior";
const DEVTO_URL = "https://dev.to/api/articles?username=darkpandawarrior&per_page=100";

const CI_REPOS = ["Doori", "Gaddi", "PaymentsLab-KMP", "kmp-toolkit", "kmp-build-logic"];
const DOWNLOAD_REPOS = ["Doori", "Gaddi", "PaymentsLab-KMP"];
const runsUrl = (repo: string) => `https://api.github.com/repos/darkpandawarrior/${repo}/actions/runs?branch=main&status=completed&per_page=30`;
const releasesUrl = (repo: string) => `https://api.github.com/repos/darkpandawarrior/${repo}/releases?per_page=1`;

const LICHESS_SAMPLE = [{ name: "x", id: "x", online: true, playing: false }];
const DEVTO_SAMPLE = [
  { url: "https://dev.to/darkpandawarrior/a", public_reactions_count: 1, comments_count: 0, published_at: "2026-09-01T00:00:00Z" },
];
const GREEN_RUN = { name: "CI", conclusion: "success", run_started_at: "2026-09-24T03:28:00Z", head_branch: "main" };
const RELEASE_SAMPLE = [
  {
    tag_name: "v1.0",
    assets: [
      { name: "app.apk", download_count: 21 },
      { name: "app.apk.sha256", download_count: 5 },
      { name: "demo.gif", download_count: 9 },
    ],
  },
];

/** Routes a fake fetch by exact URL. `ci`/`downloads` are keyed by repo name
 *  and default to GREEN_RUN / RELEASE_SAMPLE for every repo not overridden. */
function routedFetch(opts: {
  lichess?: unknown | "fail";
  devto?: unknown | "fail";
  ci?: Record<string, unknown | "fail">;
  downloads?: Record<string, unknown | "fail">;
}) {
  return vi.fn(async (url: string) => {
    if (url === LICHESS_URL) {
      if (opts.lichess === "fail") return new Response(null, { status: 500 });
      return new Response(JSON.stringify(opts.lichess ?? LICHESS_SAMPLE), { status: 200 });
    }
    if (url === DEVTO_URL) {
      if (opts.devto === "fail") return new Response(null, { status: 500 });
      return new Response(JSON.stringify(opts.devto ?? DEVTO_SAMPLE), { status: 200 });
    }
    for (const repo of CI_REPOS) {
      if (url === runsUrl(repo)) {
        const pick = opts.ci?.[repo] ?? { workflow_runs: [GREEN_RUN] };
        if (pick === "fail") return new Response(null, { status: 403 });
        return new Response(JSON.stringify(pick), { status: 200 });
      }
    }
    for (const repo of DOWNLOAD_REPOS) {
      if (url === releasesUrl(repo)) {
        const pick = opts.downloads?.[repo] ?? RELEASE_SAMPLE;
        if (pick === "fail") return new Response(null, { status: 403 });
        return new Response(JSON.stringify(pick), { status: 200 });
      }
    }
    throw new Error(`unexpected url ${url}`);
  });
}

describe("getSignals", () => {
  it("returns the exact SignalsResponse shape from a fully live fixture set", async () => {
    const result = await getSignals({}, routedFetch({}) as unknown as typeof fetch);
    expect(result.lichess).toEqual({ online: true, playing: false });
    expect(result.devto).toEqual([{ url: DEVTO_SAMPLE[0].url, reactions: 1, comments: 0, publishedAt: "2026-09-01T00:00:00Z" }]);
    expect(result.ci).toEqual({
      doori: { state: "pass", newestAt: GREEN_RUN.run_started_at, failing: [] },
      gaddi: { state: "pass", newestAt: GREEN_RUN.run_started_at, failing: [] },
      "paymentslab-kmp": { state: "pass", newestAt: GREEN_RUN.run_started_at, failing: [] },
      "kmp-toolkit": { state: "pass", newestAt: GREEN_RUN.run_started_at, failing: [] },
      "kmp-build-logic": { state: "pass", newestAt: GREEN_RUN.run_started_at, failing: [] },
    });
    expect(result.downloads).toEqual({
      doori: { tag: "v1.0", apk: 21 },
      gaddi: { tag: "v1.0", apk: 21 },
      "paymentslab-kmp": { tag: "v1.0", apk: 21 },
    });
    expect(typeof result.at).toBe("string");
  });

  it("a newer failing chore/* run alongside a green main run gives pass (proves the branch filter)", async () => {
    const chore = { name: "CI", conclusion: "failure", run_started_at: "2026-09-24T05:00:00Z", head_branch: "chore/bump" };
    const fetchImpl = routedFetch({ ci: { Doori: { workflow_runs: [chore, GREEN_RUN] } } });
    const result = await getSignals({}, fetchImpl as unknown as typeof fetch);
    expect(result.ci?.doori).toEqual({ state: "pass", newestAt: GREEN_RUN.run_started_at, failing: [] });
  });

  it("the newest 'Quality Gate: failure' on main gives fail with failing:['Quality Gate']", async () => {
    const qualityGate = { name: "Quality Gate", conclusion: "failure", run_started_at: "2026-09-24T03:29:00Z", head_branch: "main" };
    const fetchImpl = routedFetch({ ci: { "PaymentsLab-KMP": { workflow_runs: [GREEN_RUN, qualityGate] } } });
    const result = await getSignals({}, fetchImpl as unknown as typeof fetch);
    expect(result.ci?.["paymentslab-kmp"]).toEqual({ state: "fail", newestAt: qualityGate.run_started_at, failing: ["Quality Gate"] });
  });

  it("0 completed runs gives none", async () => {
    const fetchImpl = routedFetch({ ci: { "kmp-toolkit": { workflow_runs: [] } } });
    const result = await getSignals({}, fetchImpl as unknown as typeof fetch);
    expect(result.ci?.["kmp-toolkit"]).toEqual({ state: "none", newestAt: null, failing: [] });
  });

  it("a GitHub 403 gives ci:null and downloads:null while lichess and devto stay present, with no retry (exactly 10 fetches)", async () => {
    const fetchImpl = routedFetch({ ci: { Doori: "fail" }, downloads: { Gaddi: "fail" } });
    const result = await getSignals({}, fetchImpl as unknown as typeof fetch);
    expect(result.ci).toBeNull();
    expect(result.downloads).toBeNull();
    expect(result.lichess).toEqual({ online: true, playing: false });
    expect(result.devto).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it("release assets [app.apk 21, app.apk.sha256 5, demo.gif 9] give apk:21 (sha256/gif excluded)", async () => {
    const result = await getSignals({}, routedFetch({}) as unknown as typeof fetch);
    expect(result.downloads?.doori.apk).toBe(21);
  });

  it("a lichess body with no online/playing fields defaults both to false", async () => {
    const fetchImpl = routedFetch({ lichess: [{ name: "x", id: "x" }] });
    const result = await getSignals({}, fetchImpl as unknown as typeof fetch);
    expect(result.lichess).toEqual({ online: false, playing: false });
  });

  it("a lichess body with online:true, playing:true gives both true", async () => {
    const fetchImpl = routedFetch({ lichess: [{ online: true, playing: true }] });
    const result = await getSignals({}, fetchImpl as unknown as typeof fetch);
    expect(result.lichess).toEqual({ online: true, playing: true });
  });

  it("calls exactly 10 upstreams (1 lichess + 1 dev.to + 5 Actions + 3 Releases), AbortSignal.timeout, no '@' in any header", async () => {
    const fetchImpl = routedFetch({});
    await getSignals({ GITHUB_TOKEN: "tok" }, fetchImpl as unknown as typeof fetch);
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(10);
    for (const [, init] of calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      for (const value of Object.values(init.headers as Record<string, string>)) {
        expect(value).not.toContain("@");
      }
    }
  });
});

describe("handleSignals", () => {
  it("sets the 2-minute edge cache header", async () => {
    global.fetch = routedFetch({}) as unknown as typeof fetch;
    const response = await handleSignals(new Request("http://localhost/api/signals"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=120, stale-while-revalidate=600");
  });
});
