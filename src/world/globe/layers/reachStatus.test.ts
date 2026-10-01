import { describe, it, expect } from "vitest";
import { buildReachStatus } from "./reachStatus.ts";

describe("buildReachStatus", () => {
  it("matches the brief's own example shape when everything is live", () => {
    const health = buildReachStatus({ appCount: 88, ci: { pass: 5, total: 5 }, ciDown: false, nowPlaying: true, lichessOnline: false });
    expect(health.state).toBe("live");
    expect(health.detail).toBe("88 apps on the ring; CI 5/5 passing; now playing");
  });

  it("names the CI family as unreachable rather than silently omitting it", () => {
    const health = buildReachStatus({ appCount: 88, ci: null, ciDown: true, nowPlaying: false, lichessOnline: false });
    expect(health.detail).toContain("CI family unreachable");
  });

  it("falls back to snapshot when only the static app ring has anything to show", () => {
    const health = buildReachStatus({ appCount: 88, ci: null, ciDown: true, nowPlaying: false, lichessOnline: false });
    expect(health.state).toBe("snapshot");
  });

  it("stays live on lichess presence alone, even with CI down", () => {
    const health = buildReachStatus({ appCount: 88, ci: null, ciDown: true, nowPlaying: false, lichessOnline: true });
    expect(health.state).toBe("live");
    expect(health.detail).toContain("lichess online");
  });
});
