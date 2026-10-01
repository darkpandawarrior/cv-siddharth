import { describe, expect, it } from "vitest";
import { GIBS_CATALOG } from "../layers/gibsCatalog.ts";
import { hazardsSummary, loadedImageryHeadline, loadedImagerySummary, sceneReceiptRows, imageryObservationAge, imagerySummary, liveLayersSummary, selectionAnnouncement, selectionSummary, skySummary } from "./sceneSummaryText.ts";
import { LAYER_IDS, type LayerHealth, type LayerId, type Selection } from "../globeStore.ts";
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
    expect(text).toContain("on: Pune markers, Satellites");
    expect(text).toContain("Off: Stars and Moon");
  });

  it("names a failed feed even while its toggle reads on: never a stale value shown as live", () => {
    const layers = { ...allOff, wind: true };
    const status: Partial<Record<LayerId, LayerHealth>> = { wind: { state: "failed", detail: "feed unreachable" } };
    expect(liveLayersSummary(layers, status)).toContain("Unreachable: Wind.");
  });

  it("reads 'none' rather than an empty list when every layer is off", () => {
    expect(liveLayersSummary(allOff, {})).toContain("on: none");
  });
});

describe("hazardsSummary", () => {
  it("reuses the layer's own composite detail line", () => {
    expect(hazardsSummary({ state: "live", detail: "47 quakes, 3 fires" })).toBe("Hazards: 47 quakes, 3 fires.");
  });

  it("names total failure rather than a blank sentence", () => {
    expect(hazardsSummary({ state: "failed", detail: "" })).toBe("Hazards: every feed unreachable.");
  });

  it("does not call a pending hazard feed empty", () => {
    expect(hazardsSummary({ state: "loading" })).toBe("Hazards: loading, no events confirmed.");
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

describe("scene receipt honesty", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const off = Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<LayerId, boolean>;
  const imagery = { base: VIIRS.id, overlays: [] };

  it("keeps the loaded product and date first in the collapsed phone line", () => {
    expect(loadedImageryHeadline("imagery", { state: "live", detail: "NASA GIBS MODIS Terra true colour, 2026-09-29" })).toBe("MODIS Terra · 2026-09-29");
    expect(loadedImageryHeadline("imagery", { state: "live", detail: "NASA GIBS VIIRS true colour (time machine), 2026-09-28" })).toBe("VIIRS · 2026-09-28");
    expect(loadedImageryHeadline("imagery", { state: "loading", detail: "2026-09-29" })).toBe("Imagery loading");
    expect(loadedImageryHeadline("imagery", { state: "failed", detail: "2026-09-29" })).toBe("Dots · imagery unavailable");
    expect(loadedImageryHeadline("dots", { state: "live", detail: "2026-09-29" })).toBe("Dots · computed");
    expect(loadedImageryHeadline("imagery", undefined)).toBe("Awaiting imagery report");
    expect(loadedImageryHeadline("imagery", { state: "snapshot", detail: "NASA static composite" })).toBe("NASA static composite");
  });

  it("uses the loaded fallback product/date, never the catalog selection", () => {
    expect(loadedImagerySummary("imagery", { state: "live", detail: "NASA GIBS MODIS Terra true colour, 2026-09-28" }))
      .toBe("Imagery: whole-globe texture, NASA GIBS MODIS Terra true colour, 2026-09-28. Snapshot imagery, not live.");
    for (const status of [undefined, { state: "loading" as const }, { state: "failed" as const, detail: "NASA unavailable" }]) {
      expect(loadedImagerySummary("imagery", status)).toContain("No imagery date confirmed");
    }
    expect(loadedImagerySummary("imagery", undefined)).not.toContain("dots");
    expect(loadedImagerySummary("dots", { state: "live", detail: "2026-09-28" })).not.toContain("2026-09-28");
  });

  it("reports UTC daily precision, missing dates, malformed dates and future dates", () => {
    expect(imageryObservationAge("NASA GIBS, 2026-09-29", now)).toBe("Observation age: 1 UTC calendar day, daily mosaic.");
    expect(imageryObservationAge("NASA GIBS, 2026-09-30", now)).toContain("0 UTC calendar days");
    expect(imageryObservationAge("NASA GIBS, 2026-10-01", now)).toContain("ahead of the real clock");
    for (const detail of [undefined, "static", "2026-02-30", "2026-99-99"]) {
      expect(imageryObservationAge(detail, now)).toBe("Observation age not reported.");
    }
    expect(imageryObservationAge("2026-09-29", null)).toBe("Observation age not reported.");
  });

  it("never promotes missing/loading/failed producers to available", () => {
    const rows = sceneReceiptRows({ ...off, wind: true, aircraft: true, satellites: true }, {
      wind: { state: "failed", detail: "Open-Meteo unreachable" }, aircraft: { state: "loading" },
    }, imagery, "imagery", 0);
    expect(rows.every((row) => !row.available)).toBe(true);
    expect(rows.find((row) => row.id === "wind")?.text).toContain("Unavailable. Open-Meteo unreachable");
    expect(rows.find((row) => row.id === "aircraft")?.text).toContain("Loading, drawing unconfirmed");
    expect(rows.find((row) => row.id === "satellites")?.text).toContain("no status reported");
    expect(sceneReceiptRows(off, {}, imagery, "imagery", 0)).toEqual([]);
  });

  it("qualifies computed, modelled and snapshot values and hides nowcasts during simulation", () => {
    const layers = { ...off, daylight: true, satellites: true, guide: true, aircraft: true, presence: true, pulses: true, wind: true, together: true };
    const status: Partial<Record<LayerId, LayerHealth>> = Object.fromEntries(LAYER_IDS.map((id) => [id, { state: "live" as const }]));
    status.satellites = { state: "snapshot" };
    const rows = sceneReceiptRows(layers, status, imagery, "imagery", -60);
    expect(rows.find((row) => row.id === "daylight")?.text).toContain("Computed");
    expect(rows.find((row) => row.id === "satellites")?.text).toContain("Modelled, snapshot");
    expect(rows.find((row) => row.id === "guide")?.text).toContain("Snapshot");
    for (const id of ["aircraft", "presence", "pulses", "wind", "together"]) {
      const row = rows.find((row) => row.id === id);
      expect(row?.available).toBe(false);
      expect(row?.text).toContain("Hidden during simulated time");
    }
  });

  it("does not invent loaded dates for tile overlays, even with a healthy status", () => {
    const stack = { ...imagery, overlays: [{ id: "SMAP_L4_Analyzed_Surface_Soil_Moisture", opacity: 0.75 }, { id: PRECIP.id, opacity: 0 }] };
    const rows = sceneReceiptRows(off, { [stack.overlays[0].id]: { state: "live" } }, stack, "imagery", 0);
    expect(rows[0].text).toContain("drawing and loaded date unconfirmed");
    expect(rows[0].text).toContain("NASA GIBS / SMAP L4. Modelled");
    expect(rows[0].text).toContain("Observation age not reported");
    expect(rows[0].available).toBe(false);
    expect(rows[1].text).toContain("hidden at zero opacity");
    expect(sceneReceiptRows(off, {}, stack, "dots", 0)[0].text).toContain("real imagery is off");
    const failed = sceneReceiptRows(off, { [stack.overlays[0].id]: { state: "failed", detail: "feed unavailable" } }, stack, "imagery", 0);
    expect(failed[0].text).toContain("unavailable: feed unavailable");
    const loading = sceneReceiptRows(off, { [stack.overlays[0].id]: { state: "loading" } }, stack, "imagery", 0);
    expect(loading[0].text).toContain("loading, drawing unconfirmed");
  });
});
