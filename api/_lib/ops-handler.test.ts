import { describe, it, expect, vi } from "vitest";
import { getOps, type OpsCacheStore } from "./ops-handler";

const RUNS_URL = "https://api.github.com/repos/darkpandawarrior/cv-siddharth/actions/runs?per_page=100&status=completed";
const WORKFLOWS_URL = "https://api.github.com/repos/darkpandawarrior/cv-siddharth/actions/workflows";
const CHAIN_URL = "https://darkpandawarrior.github.io/fdroid/repo/index-v2.json";

const RUN = {
  name: "CI",
  conclusion: "success",
  run_started_at: "2026-09-01T00:00:00Z",
  html_url: "https://github.com/darkpandawarrior/cv-siddharth/actions/runs/1",
  event: "push",
};

const CHAIN_BODY = {
  repo: { timestamp: Date.parse("2026-09-01T00:00:00Z") },
  packages: {
    "com.kursi.android": { versions: { v1: { file: { size: 1, sha256: "a" }, manifest: { versionName: "1.0", versionCode: 1 } } } },
  },
};

function routedFetch(ok: { runs?: boolean; workflows?: boolean; chain?: boolean } = { runs: true, workflows: true, chain: true }) {
  return vi.fn(async (url: string) => {
    if (url === RUNS_URL) {
      return ok.runs
        ? new Response(JSON.stringify({ workflow_runs: [RUN] }), { status: 200 })
        : new Response(null, { status: 500 });
    }
    if (url === WORKFLOWS_URL) {
      return ok.workflows
        ? new Response(JSON.stringify({ workflows: [{ name: "CI", state: "active" }] }), { status: 200 })
        : new Response(null, { status: 500 });
    }
    if (url === CHAIN_URL) {
      if (!ok.chain) throw new Error("network down");
      return new Response(JSON.stringify(CHAIN_BODY), { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  });
}

describe("getOps — ops-1: last-good cache instead of zeroing the board", () => {
  it("a fresh, fully live read is not stale and populates the cache", async () => {
    const store: OpsCacheStore = { runs: null, chain: null };
    const result = await getOps({}, routedFetch() as unknown as typeof fetch, store);
    expect(result.connected).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.runs).toHaveLength(1);
    expect(result.supplyChain.connected).toBe(true);
    expect(store.runs?.runs).toHaveLength(1);
    expect(store.chain?.connected).toBe(true);
  });

  it("falls back to the cached runs and chain, labelled stale, when the live calls fail", async () => {
    const store: OpsCacheStore = { runs: null, chain: null };
    await getOps({}, routedFetch() as unknown as typeof fetch, store); // warm the cache

    const dead = routedFetch({ runs: false, workflows: false, chain: false });
    const result = await getOps({}, dead as unknown as typeof fetch, store);

    expect(result.connected).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].workflow).toBe("CI");
    expect(result.supplyChain.connected).toBe(true);
  });

  it("with no prior cache, a dead live call reports disconnected rather than a fake stale success", async () => {
    const store: OpsCacheStore = { runs: null, chain: null };
    const dead = routedFetch({ runs: false, workflows: false, chain: false });
    const result = await getOps({}, dead as unknown as typeof fetch, store);

    expect(result.connected).toBe(false);
    expect(result.stale).toBe(false);
    expect(result.runs).toHaveLength(0);
    expect(result.supplyChain.connected).toBe(false);
  });
});
