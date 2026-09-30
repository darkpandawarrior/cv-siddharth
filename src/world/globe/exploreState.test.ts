import { beforeEach, expect, it } from "vitest";
import { useExplore } from "./exploreState.ts";
beforeEach(() => useExplore.setState({ pins: [], points: [], mode: null }));
it("keeps two distinct valid coordinates without silently replacing pins", () => {
  const s = useExplore.getState();
  s.pin({ lat: NaN, lon: 0 }); s.pin({ lat: 91, lon: 0 });
  expect(useExplore.getState().pins).toEqual([]);
  s.pin({ lat: 0, lon: 0 }); s.pin({ lat: 0, lon: 0 }); s.pin({ lat: 10, lon: 20 }); s.pin({ lat: 20, lon: 30 });
  expect(useExplore.getState().pins).toEqual([{ lat: 0, lon: 0 }, { lat: 10, lon: 20 }]);
  s.setMode("measure"); s.addPoint({ lat: 0, lon: 0 });
  expect(useExplore.getState().pins).toHaveLength(2);
  s.removePin(0); expect(useExplore.getState().pins).toEqual([{ lat: 10, lon: 20 }]);
  s.clearPins(); expect(useExplore.getState().pins).toEqual([]);
  expect(useExplore.getState().points).toHaveLength(1);
});
