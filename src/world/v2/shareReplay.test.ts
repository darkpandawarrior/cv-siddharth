import { describe, expect, it } from "vitest";
import { encodePath } from "../../lib/pathShare.ts";
import { ledger } from "./ledger.ts";
import { shareReplay } from "./shareReplay.ts";
import { tourStops } from "./tour.ts";

describe("shared paths through the tour engine", () => {
  it("preserves order, repeated stops and pacing while dropping unknown ids", () => {
    const ids = ["stutter", "unknown", "doori", "portfolio", "doori"];
    const replay = shareReplay(encodePath(ids), ledger);
    expect(replay).toEqual(tourStops(ledger, ids.filter((id) => id !== "unknown").map((id) => ({ kind: "landmark", id }))));
    expect(replay.map(({ id }) => id)).toEqual(["stutter", "doori", "portfolio", "doori"]);
  });

  it("keeps default GRAMMAR stops local to the guided tour", () => {
    expect(shareReplay(encodePath(["deepmal-niche", "bridge", "pr-stone"]), ledger).map(({ id }) => id)).toEqual(["bridge"]);
  });

  it.each([null, undefined, "", "2.ZG9vcmk", "1.!!!", "1." + "x".repeat(5000)])("returns no replay for malformed or absent input %s", (param) => {
    expect(shareReplay(param, ledger)).toEqual([]);
  });
});
