import { describe, expect, it } from "vitest";
import { GIBS_CATALOG } from "../layers/gibsCatalog.ts";
import { hazardsSummary, imagerySummary, liveLayersSummary, selectionAnnouncement, selectionSummary, skySummary } from "./sceneSummaryText.ts";
import type { LayerHealth, LayerId, Selection } from "../globeStore.ts";
import type { SkyState } from "../../../lib/sky.ts";

const VIIRS = GIBS_CATALOG["VIIRS_SNPP_CorrectedReflectance_TrueColor"];
const PRECIP = GIBS_CATALOG["IMERG_Precipitation_Rate"];

describe("imagerySummary", () => {
  it("names the base layer and its date", () => {
    const text = imagerySummary(VIIRS, "NASA GIBS / VIIRS SNPP, 2026-09-28", []);
    expect(text).toBe("Imagery: VIIRS true colour (NASA GIBS / VIIRS SNPP, 2026-09-28).");
  });

  it("lists overlays by title, not by id", () => {
    const text = imagerySummary(VIIRS, "NASA GIBS / VIIRS SNPP, 2026-09-28", [PRECIP.id]);
    expect(text).toContain("plus 1 overlay: Precipitation rate");
  });

  it("says so honestly when the base is unknown, rather than crashing", () => {
    expect(imagerySummary(undefined, undefined, [])).toBe("Imagery: base layer unknown.");
  });
});

describe("liveLayersSummary", () => {
  const allOff = Object.fromEntries(["markers", "stars", "satellites", "aircraft", "presence", "pulses", "hazards", "wind", "reach", "countries", "together", "density", "guide"].map((id) => [id, false])) as Record<LayerId, boolean>;

  it("splits on/off and never invents a layer not in globeStore's own list", () => {
    const layers = { ...allOff, satellites: true, markers: true };
    const text = liveLayersSummary(layers, {});
    expect(text).toContain("on — Pune markers, Satellites");
    expect(text).toContain("Off — Stars and Moon");
  });

  it("names a failed feed even while its toggle reads on — never a stale value shown as live", () => {
    const layers = { ...allOff, wind: true };
    const status: Partial<Record<LayerId, LayerHealth>> = { wind: { state: "failed", detail: "feed unreachable" } };
    expect(liveLayersSummary(layers, status)).toContain("Unreachable: Wind.");
  });

  it("reads 'none' rather than an empty list when every layer is off", () => {
    expect(liveLayersSummary(allOff, {})).toContain("on — none");
  });
});

describe("hazardsSummary", () => {
  it("reuses the layer's own composite detail line", () => {
    expect(hazardsSummary({ state: "live", detail: "47 quakes, 3 fires" })).toBe("Hazards: 47 quakes, 3 fires.");
  });

  it("names total failure rather than a blank sentence", () => {
    expect(hazardsSummary({ state: "failed", detail: "" })).toBe("Hazards: every feed unreachable.");
  });

  it("says 'not reporting yet' before the layer has ever reported", () => {
    expect(hazardsSummary(undefined)).toBe("Hazards: not reporting yet.");
  });
});

const SKY: SkyState = {
  now: new Date("2026-09-29T12:00:00Z"),
  sun: { altitudeDeg: 60, azimuthDeg: 180 },
  times: { sunrise: new Date(0), solarNoon: new Date(0), sunset: new Date(0) },
  daypart: "day",
  progress: 0.5,
  k: {} as SkyState["k"],
  weather: { at: "", intervalSec: 900, tempC: 27.4, code: 0, cloudPct: 0, precipMmH: 0, windKmh: 0, windFromDeg: 0, humidityPct: 0, visibilityM: 0 },
  preview: false,
};

describe("skySummary", () => {
  it("names daypart, rounded temperature and the computed subsolar point", () => {
    const text = skySummary(SKY);
    expect(text).toMatch(/^Sky: day over Pune, 27°C, clear sky, sun overhead near -?\d+\.\d°, -?\d+\.\d°\.$/);
  });

  it("degrades to 'not available yet' before the clock has ticked (SSR)", () => {
    expect(skySummary(null)).toBe("Sky: not available yet.");
  });
});

const SELECTION: Selection = { id: "x", kind: "guide-place", title: "Pune, India", rows: [], source: "Google Maps Takeout", live: false };

describe("selectionSummary / selectionAnnouncement", () => {
  it("names title, kind, live-ness and source", () => {
    expect(selectionSummary(SELECTION)).toBe("Selection: Pune, India (guide-place), snapshot, source Google Maps Takeout.");
  });

  it("reads 'nothing selected' rather than an empty sentence", () => {
    expect(selectionSummary(null)).toBe("Selection: nothing selected.");
  });

  it("the live region only ever holds a selection announcement", () => {
    expect(selectionAnnouncement(SELECTION)).toBe("Now showing Pune, India.");
    expect(selectionAnnouncement(null)).toBe("");
  });
});
