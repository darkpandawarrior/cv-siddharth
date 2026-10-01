import { createElement } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HazardLegend, Legend } from "../ui/Legend.tsx";
import { OCEAN_FRAG } from "./sun.ts";
import { ECLIPSE_CORE, ECLIPSE_LEGEND, DAYLIGHT_LEGEND, EMBER, VOLCANO, STORM, ALERT_WARN, ALERT_DANGER, LAUNCH, LAUNCH_BEAM, setHazardKeys, resetHazardKeys } from "./layerKeys.ts";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
afterEach(resetHazardKeys);

function luminance(rgb: number[]) {
  return rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}

it("the eclipse band clears 3:1 against the real night ocean, including its rendered opacity", () => {
  const match = OCEAN_FRAG.match(/mix\(vec3\(([^)]+)\)/);
  expect(match).not.toBeNull();
  const night = match![1].split(",").map(Number);
  const core = [1, 3, 5].map((i) => parseInt(ECLIPSE_CORE.slice(i, i + 2), 16) / 255);
  const composited = core.map((v, i) => Math.min(1, v * 0.8 + night[i]));
  expect((luminance(composited) + 0.05) / (luminance(night) + 0.05)).toBeGreaterThanOrEqual(3);
  const renderer = source("EclipseLayer.tsx");
  for (const symbol of ["ECLIPSE_CORE", "ECLIPSE_HALO", "ECLIPSE_SHADOW", "ECLIPSE_CORE_RADIUS", "ECLIPSE_HALO_RADIUS"]) expect(renderer).toContain(symbol);
  expect(renderer).toContain("blending={THREE.AdditiveBlending}");
  expect(renderToStaticMarkup(createElement(Legend, { legend: ECLIPSE_LEGEND }))).toContain(ECLIPSE_CORE);
});

it("glyphs and keys use the same imported constants, including aurora and daylight shaders", () => {
  for (const [file, names] of [
    ["eonetGlyphs.tsx", ["EMBER", "VOLCANO", "STORM"]],
    ["hazardHalos.tsx", ["ALERT_WARN", "ALERT_DANGER"]],
    ["launchMarkers.tsx", ["LAUNCH", "LAUNCH_BEAM"]],
    ["nhcConeGlyphs.tsx", ["ALERT_WARN", "ALERT_DANGER"]],
    ["auroraOval.tsx", ["AURORA_RGB"]],
  ] as const) {
    const renderer = source(file);
    expect(renderer).toMatch(/import \{[^}]+\} from "\.\/layerKeys.ts"/);
    for (const name of names) expect(renderer).toContain(name);
  }
  // The weekly renderer is outside this lane. Guard its existing colour
  // against the shared EONET/legend colour until it can import the key too.
  expect(source("VolcanoGlyphs.tsx")).toContain(`color="${VOLCANO}"`);
  expect(source("daylight.ts")).toContain('export { DAYLIGHT_FRAG } from "./layerKeys.ts"');
  setHazardKeys({ quakes: 1, fires: 1, storms: 1, volcanoes: 1, alerts: 1, launches: 1, cones: 1, aurora: true, kp: 3.33 });
  const html = renderToStaticMarkup(createElement(HazardLegend));
  for (const color of [EMBER, VOLCANO, STORM, ALERT_WARN, ALERT_DANGER, LAUNCH, LAUNCH_BEAM]) expect(html).toContain(color);
  expect(html).toContain("NOAA OVATION nowcast), Kp 3.33");
  expect(renderToStaticMarkup(createElement(Legend, { legend: DAYLIGHT_LEGEND }))).toContain("Golden-hour band");
});

it("absent sub-feeds have no key or quake-depth ramp", () => {
  resetHazardKeys();
  expect(renderToStaticMarkup(createElement(HazardLegend))).toBe("");
  setHazardKeys({ quakes: 0, fires: 1, storms: 0, volcanoes: 0, alerts: 0, launches: 0, cones: 0, aurora: false, kp: null });
  const html = renderToStaticMarkup(createElement(HazardLegend));
  expect(html).toContain("Fires:");
  for (const absent of ["km depth", "Storms:", "Volcanoes:", "Alerts:", "Launches:", "NHC cones:", "Aurora:"]) expect(html).not.toContain(absent);
});

it("the scene mounts one BuoyLayer, gated by the buoy toggle", () => {
  const scene = source("../GlobeScene.tsx");
  expect(scene.match(/<BuoyLayer\b/g)).toHaveLength(1);
  expect(scene).toMatch(/layers\.buoys && <BuoyLayer tier=\{tier\} \/>/);
});
