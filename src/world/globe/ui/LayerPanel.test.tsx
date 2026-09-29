import { describe, expect, it } from "vitest";
import { dotStyle } from "./LayerPanel.tsx";
import { WIND_LEGEND } from "../layers/windField.ts";
import { DENSITY_LEGEND, densityColor } from "../layers/hexbin.ts";
import { QUAKE_DEPTH_LEGEND, depthToColor } from "../layers/quake.ts";

describe("layer legend and health", () => {
  it("distinguishes unavailable upstream data from a product error", () => {
    expect(dotStyle({ state: "failed", detail: "feed unreachable" }).color).toBe("var(--color-degraded)");
    expect(dotStyle({ state: "failed", detail: "invalid renderer state" }).color).toBe("var(--color-danger)");
  });
  it("labels the renderer's actual color endpoints", () => {
    expect(WIND_LEGEND.stops.map((s) => s.label)).toEqual(["2", "12", "22+"]);
    expect(QUAKE_DEPTH_LEGEND.stops.map((s) => s.color)).toEqual([depthToColor(0), depthToColor(300)]);
    for (const [i, stop] of DENSITY_LEGEND.stops.entries()) {
      const rgb = densityColor(i / 2).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
      expect(stop.color).toBe(`#${rgb}`);
    }
  });
});
