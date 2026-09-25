import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import VoiceMeasured from "./VoiceMeasured.tsx";
import { voiceMetrics } from "./data/voice.ts";

/**
 * Named .test.ts, not .test.tsx, matching AnimatedMetric.test.ts: written with
 * createElement rather than JSX so it needs no change to vitest.config.ts's
 * include pattern (a file this lane does not own).
 */
const html = renderToStaticMarkup(createElement(VoiceMeasured));

describe("VoiceMeasured", () => {
  it("renders all 5 metric pairs", () => {
    expect(voiceMetrics).toHaveLength(5);
    for (const m of voiceMetrics) {
      expect(html).toContain(`data-testid="voice-metric-${m.id}"`);
      expect(html).toContain(m.archive.toFixed(2));
      expect(html).toContain(m.shipped.toFixed(2));
    }
  });

  it("marks direct address, and only direct address, as the one that rose", () => {
    const risers = voiceMetrics.filter((m) => m.rose);
    expect(risers.map((m) => m.id)).toEqual(["direct-address"]);
    expect(html).toContain('data-testid="voice-metric-direct-address-rose-badge"');
    for (const m of voiceMetrics) {
      if (m.id !== "direct-address") {
        expect(html).not.toContain(`voice-metric-${m.id}-rose-badge`);
      }
    }
  });

  it("has no em dash in its rendered copy", () => {
    expect(html.includes("—")).toBe(false);
  });
});
