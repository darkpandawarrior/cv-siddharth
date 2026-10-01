import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import LayerPanel, { EarthStatus, LayerRows } from "./LayerPanel.tsx";
import { renderToStaticMarkup } from "react-dom/server";
import { useGlobe } from "../globeStore.ts";
import { WIND_LEGEND } from "../layers/windField.ts";
import { DENSITY_LEGEND, densityColor } from "../layers/hexbin.ts";
import { QUAKE_DEPTH_LEGEND, depthToColor } from "../layers/quake.ts";

// Node SSR reads Zustand's initial snapshot. Inject current store state so
// each render exercises the panel against the loader states under test.
vi.mock("../globeStore.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../globeStore.ts")>();
  return { ...actual, useGlobe: Object.assign((selector: (state: ReturnType<typeof actual.useGlobe.getState>) => unknown) => selector(actual.useGlobe.getState()), actual.useGlobe) };
});

describe("layer legend and health", () => {
  it("distinguishes unavailable upstream data from a product error", () => {
    const html = renderToStaticMarkup(<LayerRows layers={useGlobe.getState().layers} toggleLayer={() => {}} status={{ wind: { state: "failed", detail: "feed unreachable" }, hazards: { state: "failed", detail: "invalid renderer state" } }} />);
    expect(html).toContain("background-color:var(--color-degraded)");
    expect(html).toContain("background-color:var(--color-danger)");
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

describe("W11B panel regressions", () => {
  it("renders the loader's actual Earth health", () => {
    for (const [health, text] of [
      [{ state: "loading" as const }, "Loading imagery"],
      [{ state: "failed" as const, detail: "NASA GIBS unreachable" }, "Imagery unavailable, showing dots. NASA GIBS unreachable"],
      [{ state: "live" as const, detail: "NASA GIBS VIIRS, 2026-09-29" }, "NASA GIBS VIIRS, 2026-09-29"],
    ] as const) {
      const previous = useGlobe.getState().status;
      useGlobe.setState({ status: { earth: health } });
      const html = renderToStaticMarkup(<LayerPanel tier={1} />);
      useGlobe.setState({ status: previous });
      expect(html).toContain(text);
      expect(html).toContain('data-earth-status-line');
    }
    for (const health of [undefined, null, { state: "loading" as const }, { state: "live" as const, detail: "Old imagery" }, { state: "failed" as const }]) {
      const dots = renderToStaticMarkup(<EarthStatus health={health} style="dots" tier={1} />);
      const lowTier = renderToStaticMarkup(<EarthStatus health={health} style="imagery" tier={3} />);
      expect(dots).toContain("Showing dots. Real imagery is off.");
      expect(lowTier).toContain("Showing dots. Real imagery is unavailable at this graphics tier.");
      expect(dots + lowTier).not.toContain("Loading imagery");
    }
    expect(renderToStaticMarkup(<EarthStatus health={undefined} style="imagery" tier={1} />)).toContain("Showing dots while imagery starts.");
  });
  it("includes a native Imagery disclosure without eagerly rendering the picker", () => {
    const html = renderToStaticMarkup(<LayerPanel tier={1} />);
    expect(html).toContain('<details');
    expect(html).toContain('Imagery<span');
    expect(html).toContain('active overlays');
    expect(html).not.toContain('data-globe-layer-catalog');
  });
  it("never statically imports the catalog and keeps meaningful text readable", () => {
    const panel = readFileSync(new URL('./LayerPanel.tsx', import.meta.url), 'utf8');
    expect(panel).not.toMatch(/import\s+(?!\()[^;]*from\s*["']\.\/LayerCatalog/);
    for (const file of ['LayerPanel.tsx', 'LayerCatalog.tsx', 'FeedRail.tsx']) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/text-zinc-(500|600)/);
    }
    expect(panel).not.toContain('truncate');
  });
});

it("keys include X-ray and both search shortcuts", () => {
  const previous = useGlobe.getState().panelOpen;
  useGlobe.setState({ panelOpen: true });
  const html = renderToStaticMarkup(<LayerPanel tier={1} />);
  useGlobe.setState({ panelOpen: previous });
  expect(html).toContain("X X-ray");
  expect(html).toContain("/ or Cmd-K search");
});

it("enabled eclipse and daylight rows explain both rendered bands and the shadow point", () => {
  const layers = { ...useGlobe.getState().layers, eclipse: true, daylight: true };
  const html = renderToStaticMarkup(<LayerRows layers={layers} status={{}} toggleLayer={() => {}} />);
  for (const label of ["Umbra / antumbra track", "Live shadow point", "Golden-hour band", "Waking-cities band"]) expect(html).toContain(label);
});
