import { describe, it, expect } from "vitest";
import { buildHazardStatus, type HazardStatusInput } from "./hazardStatus.ts";

const ALL_OK: HazardStatusInput = {
  quakes: { ok: true, value: { count: 31 } },
  eonet: { ok: true, value: { fireCount: 12, stormCount: 2, volcanoCount: 0 } },
  gdacs: { ok: true, value: { count: 0 } },
  aurora: { ok: true, value: {} },
  kp: { ok: true, value: { kp: 3.3 } },
  launches: { ok: true, value: { count: 0 } },
};

describe("buildHazardStatus", () => {
  it("matches the brief's own example sentence when everything is live", () => {
    const health = buildHazardStatus(ALL_OK);
    expect(health.state).toBe("live");
    expect(health.detail).toBe("31 quakes, 12 fires, 2 storms, Kp 3.30");
  });

  it("names one failed feed among otherwise-live ones", () => {
    const input: HazardStatusInput = { ...ALL_OK, eonet: { ok: false, value: null } };
    const health = buildHazardStatus(input);
    expect(health.state).toBe("live");
    expect(health.detail).toContain("EONET unreachable");
    expect(health.detail).toContain("31 quakes");
  });

  it("reports failed only when every feed is down", () => {
    const input: HazardStatusInput = {
      quakes: { ok: false, value: null },
      eonet: { ok: false, value: null },
      gdacs: { ok: false, value: null },
      aurora: { ok: false, value: null },
      kp: { ok: false, value: null },
      launches: { ok: false, value: null },
    };
    expect(buildHazardStatus(input).state).toBe("failed");
  });

  it("reports loading, not failed, before the first round-trip", () => {
    const input: HazardStatusInput = {
      quakes: { ok: false, value: null },
      eonet: { ok: false, value: null },
      gdacs: { ok: false, value: null },
      aurora: { ok: false, value: null },
      kp: { ok: false, value: null },
      launches: { ok: false, value: null },
    };
    const health = buildHazardStatus(input, { quakes: true, eonet: true, gdacs: true, aurora: true, kp: true, launches: true });
    expect(health.state).toBe("loading");
  });

  it("omits a zero-count optional clause (GDACS, launches) rather than padding the sentence", () => {
    const health = buildHazardStatus(ALL_OK);
    expect(health.detail).not.toContain("alerts");
    expect(health.detail).not.toContain("launches");
  });
});
