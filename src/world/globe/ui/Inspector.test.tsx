import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useGlobe } from "../globeStore.ts";
import Inspector from "./Inspector.tsx";

vi.mock("../globeStore.ts", async (original) => {
  const actual = await original<typeof import("../globeStore.ts")>();
  return { ...actual, useGlobe: Object.assign((selector: (state: ReturnType<typeof actual.useGlobe.getState>) => unknown) => selector(actual.useGlobe.getState()), actual.useGlobe) };
});

afterEach(() => useGlobe.getState().select(null));

it("renders frequency buckets as zero-based bars and preserves time-series lines", () => {
  const selection = { id: "test", kind: "guide-place", title: "Public activity", rows: [], source: "GitHub public events", live: false, spark: [0, 2, 4], sparkLabel: "IST hours" };
  useGlobe.getState().select({ ...selection, sparkKind: "histogram" });
  const histogram = renderToStaticMarkup(<Inspector tier={1} />);
  expect(histogram.match(/<rect /g)).toHaveLength(3);
  expect(histogram).toContain('height="0"');
  expect(histogram).toContain('height="12"');
  expect(histogram).toContain('height="24"');
  expect(histogram).not.toContain("<polyline");
  useGlobe.getState().select(selection);
  const line = renderToStaticMarkup(<Inspector tier={1} />);
  expect(line).toContain("<polyline");
  expect(line).not.toContain("<rect");
});
