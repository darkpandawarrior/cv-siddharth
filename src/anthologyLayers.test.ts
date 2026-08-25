import { describe, expect, it } from "vitest";
import { Route } from "./routes/anthology.tsx";
import { anthology } from "./data/anthology.ts";

/**
 * /anthology's layer state lives in the URL now, so the URL is the thing worth
 * testing: every register line the reading page prints is a link into here,
 * and a search parser that throws on a stale param takes the whole page down
 * rather than the one link.
 *
 * The parser is reached through Route.options rather than re-declared, because
 * a copy of validateSearch in a test file is a test of the copy.
 */
// validateSearch's declared type is a union of the several shapes the router
// accepts, only one of which is a plain function, so the narrowing happens
// here rather than the route declaring a looser type for a test's benefit.
const parse = Route.options.validateSearch as (
  search: Record<string, unknown>,
) => { layer?: string; world?: string; at?: number };

describe("anthology layer addressing", () => {
  it("renders the default when the param is absent, unknown, or the default itself", () => {
    // Nothing may throw here. A truncated or hand-typed link still has to hand
    // a stranger the anthology.
    expect(parse({})).toEqual({});
    expect(parse({ layer: "season-2" })).toEqual({});
    expect(parse({ layer: 2 })).toEqual({});
    expect(parse({ layer: null })).toEqual({});
    expect(parse({ layer: "form" })).toEqual({});
  });

  it("addresses every named layer, and never a season number", () => {
    for (const key of ["case", "fire", "map", "tellers"]) {
      expect(parse({ layer: key }).layer, key).toBe(key);
    }
    // Numbers are not vocabulary. `layer=1` is not the form.
    for (const n of [1, 2, 3, "1", "2", "3"]) expect(parse({ layer: n })).toEqual({});
  });

  it("carries the map's arrival coordinates, clamped to the slider's own range", () => {
    expect(parse({ layer: "map", world: "Vœrhan", at: 615 })).toEqual({
      layer: "map",
      world: "Vœrhan",
      at: 615,
    });
    // The slider runs 611..671. An out-of-range arrival lands at the end of
    // the range rather than putting the input in a state it cannot show.
    expect(parse({ layer: "map", at: 1 }).at).toBe(611);
    expect(parse({ layer: "map", at: 99999 }).at).toBe(671);
    expect(parse({ layer: "map", at: "not a number" }).at).toBeUndefined();
    expect(parse({ layer: "map" }).world).toBeUndefined();
  });

  it("drops the map's coordinates on every other layer", () => {
    // Dead weight in a URL is a link that looks like it still means something.
    expect(parse({ layer: "tellers", world: "Vœrhan", at: 615 })).toEqual({ layer: "tellers" });
    expect(parse({ layer: "case", world: "Vœrhan", at: 615 })).toEqual({ layer: "case" });
  });

  it("gives the register's own world links a world the starmap actually names", () => {
    // The season filter is derived from this name and nothing else, so a
    // renamed world silently stops raising a season. These two are the worlds
    // crossnav's fixture links to at a stated count.
    const named = new Set(anthology.starmap.worlds.map((w) => w.n));
    expect(named.has("Vœrhan")).toBe(true);
    expect(anthology.starmap.worlds.find((w) => w.n === "Vœrhan")?.k?.split("-")[0]).toBe("2");
  });
});
