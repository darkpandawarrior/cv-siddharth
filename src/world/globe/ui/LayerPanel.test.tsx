import { describe, expect, it } from "vitest";
import LayerPanel from "./LayerPanel.tsx";
import { renderToStaticMarkup } from "react-dom/server";
import { useGlobe } from "../globeStore.ts";
import { WIND_LEGEND } from "../layers/windField.ts";
import { DENSITY_LEGEND, densityColor } from "../layers/hexbin.ts";
import { QUAKE_DEPTH_LEGEND, depthToColor } from "../layers/quake.ts";

describe("layer legend and health", () => {
  it("distinguishes unavailable upstream data from a product error", () => {
    const prior = useGlobe.getState();
    try {
      useGlobe.setState({ panelOpen: true, status: { wind: { state: "failed", detail: "feed unreachable" }, hazards: { state: "failed", detail: "invalid renderer state" } } });
      const html = renderToStaticMarkup(<LayerPanel />);
      expect(html).toContain("background-color:var(--color-degraded)");
      expect(html).toContain("background-color:var(--color-danger)");
    } finally { useGlobe.setState(prior); }
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
