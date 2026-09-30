import { createElement } from "react";
import { expect, it } from "vitest";
import { WIND_LEGEND } from "../layers/windField.ts";
import { DENSITY_LEGEND } from "../layers/hexbin.ts";
import { QUAKE_DEPTH_LEGEND } from "../layers/quake.ts";
import { legendGradient, legendTicks } from "./legendTicks.ts";
import { Legend } from "./Legend.tsx";
import { renderToStaticMarkup } from "react-dom/server";
for (const legend of [WIND_LEGEND, DENSITY_LEGEND, QUAKE_DEPTH_LEGEND]) {
  it(`keeps every ${legend.unit} stop aligned with its gradient`, () => {
    const ticks = legendTicks(legend);
    expect(ticks).toHaveLength(legend.stops.length);
    ticks.forEach((tick, i) => {
      expect(tick.position).toBe(i / (ticks.length - 1) * 100);
      expect(legendGradient(legend)).toContain(`${tick.color} ${tick.position}%`);
      expect(renderToStaticMarkup(createElement(Legend, { legend }))).toContain(`${tick.label} ${legend.unit}`);
    });
  });
}
it("renders categorical definitions as swatches", () => {
  expect(renderToStaticMarkup(createElement(Legend, { legend: { unit: "category", stops: [{ label: "none", color: "blue" }, { label: "heavy", color: "red" }] } }))).not.toContain("linear-gradient");
});
