import { expect, it } from "vitest";
import { parseBuoyResponse } from "./buoys";
it("rejects malformed feed and impossible station coordinates", () => {
  expect(parseBuoyResponse(null)).toBeNull();
  expect(parseBuoyResponse({ buoys: [{ id: "x", at: 1, lat: 91, lon: 1 }] })).toEqual([]);
});
