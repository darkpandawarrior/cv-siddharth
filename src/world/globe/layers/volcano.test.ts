import { expect, it } from "vitest";
import { parseVolcanoResponse, volcanoGlyphs } from "./volcano";
it("keeps unlocated reports in the feed but excludes them from the globe", () => {
  const rows = parseVolcanoResponse({ volcanoes: [{ id: "a", name: "A", at: 1, lat: null, lon: null }, { id: "b", name: "B", at: 1, lat: 1, lon: 2 }] });
  expect(rows).toHaveLength(2); expect(volcanoGlyphs(rows!)).toHaveLength(1);
});
