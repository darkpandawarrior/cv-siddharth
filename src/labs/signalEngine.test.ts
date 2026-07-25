import { describe, expect, it } from "vitest";
import {
  CUMULATIVE,
  ROUTE,
  ROUTE_LENGTH_M,
  ZONES,
  haversine,
  pointAtDistance,
  toLatLng,
  toXY,
} from "./signalRoute.ts";
import {
  ALL_OFF,
  STAGES,
  configForStages,
  gainsFor,
  ladder,
  runPipeline,
  simulate,
  truthDistance,
} from "./signalEngine.ts";

/**
 * The Signal Lab claims a number on a page headed "Don't take the numbers on
 * faith". These are the tests that make that line honest: every headline the
 * UI prints is asserted here against the engine that produces it.
 */

describe("route", () => {
  it("is a closed loop of real road geometry", () => {
    expect(ROUTE.length).toBeGreaterThan(100);
    expect(ROUTE[0]).toEqual(ROUTE[ROUTE.length - 1]);
  });

  it("is the length OSRM reported, within simplification tolerance", () => {
    // The router returned 17,548 m for this query; Douglas-Peucker must not
    // have moved that by more than a rounding error.
    expect(ROUTE_LENGTH_M).toBeGreaterThan(17_400);
    expect(ROUTE_LENGTH_M).toBeLessThan(17_700);
    expect(CUMULATIVE.length).toBe(ROUTE.length);
  });

  it("stays inside Pune", () => {
    for (const [lat, lng] of ROUTE) {
      expect(lat).toBeGreaterThan(18.49);
      expect(lat).toBeLessThan(18.54);
      expect(lng).toBeGreaterThan(73.83);
      expect(lng).toBeLessThan(73.89);
    }
  });

  it("covers the loop exactly once with contiguous zones", () => {
    expect(ZONES[0].from).toBe(0);
    expect(ZONES[ZONES.length - 1].to).toBe(1);
    for (let i = 1; i < ZONES.length; i++) expect(ZONES[i].from).toBe(ZONES[i - 1].to);
  });
});

describe("geodesy", () => {
  it("measures a known distance", () => {
    // One degree of latitude is ~111.2 km anywhere on the globe.
    expect(haversine([18.5, 73.8], [19.5, 73.8])).toBeCloseTo(111_195, -2);
  });

  it("round-trips through the local ENU frame", () => {
    for (const p of [ROUTE[0], ROUTE[40], ROUTE[120]]) {
      const back = toLatLng(toXY(p));
      expect(back[0]).toBeCloseTo(p[0], 6);
      expect(back[1]).toBeCloseTo(p[1], 6);
    }
  });

  it("walks the route by distance", () => {
    expect(pointAtDistance(0)).toEqual([...ROUTE[0]]);
    const quarter = pointAtDistance(ROUTE_LENGTH_M * 0.25);
    expect(haversine(ROUTE[0], quarter)).toBeGreaterThan(500);
    // wraps rather than running off the end
    const wrapped = toXY(pointAtDistance(ROUTE_LENGTH_M + 100));
    const start = toXY(pointAtDistance(100));
    expect(Math.hypot(wrapped.x - start.x, wrapped.y - start.y)).toBeLessThan(1);
  });
});

describe("simulation", () => {
  it("is deterministic for a seed", () => {
    const a = simulate({ seed: 7 });
    const b = simulate({ seed: 7 });
    expect(a.length).toBe(b.length);
    expect(a[500].fix).toEqual(b[500].fix);
  });

  it("produces different noise for different seeds", () => {
    const a = simulate({ seed: 1 });
    const b = simulate({ seed: 2 });
    expect(a[500].fix).not.toEqual(b[500].fix);
  });

  it("drives approximately the route length", () => {
    const truth = truthDistance(simulate());
    expect(truth).toBeGreaterThan(ROUTE_LENGTH_M * 0.97);
    expect(truth).toBeLessThan(ROUTE_LENGTH_M * 1.01);
  });

  it("blacks out completely in the tunnel", () => {
    const tunnel = simulate().filter((s) => s.zone === "tunnel");
    expect(tunnel.length).toBeGreaterThan(20);
    expect(tunnel.every((s) => s.fix === null)).toBe(true);
  });
});

describe("adaptive gain", () => {
  it("takes less of a measurement the worse that measurement claims to be", () => {
    expect(gainsFor(5).alpha).toBeGreaterThan(gainsFor(20).alpha);
    expect(gainsFor(20).alpha).toBeGreaterThan(gainsFor(60).alpha);
  });

  it("stays critically damped", () => {
    for (const acc of [3, 8, 15, 30, 90]) {
      const { alpha, beta } = gainsFor(acc);
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      expect(beta).toBeCloseTo((alpha * alpha) / (2 - alpha), 10);
      expect(beta).toBeLessThan(4 - 2 * alpha); // alpha-beta stability bound
    }
  });
});

describe("the claim: raw GPS over-counts trip distance", () => {
  const samples = simulate();
  const truth = truthDistance(samples);

  it("inflates distance by a large margin when unfiltered", () => {
    const raw = runPipeline(samples, ALL_OFF);
    // This is the Dice.tech bug report, reproduced: noise adds length to every
    // segment, so the trip reads far longer than it was.
    expect(raw.distanceM / truth).toBeGreaterThan(1.5);
  });

  it("lands close to truth once the whole pipeline runs", () => {
    const full = runPipeline(samples, configForStages(STAGES.length));
    const errPct = Math.abs((full.distanceM - truth) / truth) * 100;
    expect(errPct).toBeLessThan(15);
  });

  it("improves by an order of magnitude from raw to filtered", () => {
    const { rows } = ladder(samples);
    const rawErr = Math.abs(rows[0].errorPct);
    const finalErr = Math.abs(rows[rows.length - 1].errorPct);
    expect(finalErr).toBeLessThan(rawErr / 10);
  });

  it("holds across seeds, not just the shipped one", () => {
    for (const seed of [1, 99, 12345, 777777]) {
      const s = simulate({ seed });
      const t = truthDistance(s);
      const raw = runPipeline(s, ALL_OFF).distanceM;
      const full = runPipeline(s, configForStages(STAGES.length)).distanceM;
      expect(raw / t).toBeGreaterThan(1.4);
      expect(Math.abs((full - t) / t) * 100).toBeLessThan(20);
    }
  });

  it("holds on a longer, multi-lap run", () => {
    const s = simulate({ distanceM: ROUTE_LENGTH_M * 3 });
    const t = truthDistance(s);
    const full = runPipeline(s, configForStages(STAGES.length)).distanceM;
    expect(Math.abs((full - t) / t) * 100).toBeLessThan(20);
  });
});

describe("regression: the filter must not diverge", () => {
  /**
   * The first version of this lab shipped an innovation gate with no
   * divergence reset. Once the estimate drifted, every genuine fix looked like
   * a spike, so it was rejected, so the estimate coasted further — it locked
   * into 100% rejection within two laps and the drawn track left the map,
   * while the headline still read "90% accuracy". These are the assertions
   * that would have caught that.
   */
  const samples = simulate({ distanceM: ROUTE_LENGTH_M * 4 });
  const full = runPipeline(samples, configForStages(STAGES.length));

  it("never rejects everything", () => {
    const withFix = samples.filter((s) => s.fix).length;
    expect(full.rejected / withFix).toBeLessThan(0.6);
  });

  it("keeps the estimate on the map over a long run", () => {
    // The route spans ~4 km, and the worst moment includes coasting blind
    // through a 1.4 km tunnel, so some drift is legitimate. The old engine
    // sat 750-1500 m off the road CONTINUOUSLY, on every lap.
    expect(full.maxDriftM).toBeLessThan(900);
  });

  it("recovers rather than coasting forever, and says how often", () => {
    expect(full.resets).toBeGreaterThan(0); // it does hit trouble
    expect(full.bridged).toBeGreaterThan(0); // and it does bridge dropouts
  });

  it("position error does not grow without bound", () => {
    const one = runPipeline(simulate({ distanceM: ROUTE_LENGTH_M }), configForStages(STAGES.length));
    const four = runPipeline(samples, configForStages(STAGES.length));
    // Four laps must not be dramatically worse than one — that is what
    // divergence looks like in a number.
    expect(four.rmseM).toBeLessThan(one.rmseM * 2 + 50);
  });
});

describe("stages are cumulative and measured", () => {
  it("configForStages turns them on in order", () => {
    expect(configForStages(0)).toEqual(ALL_OFF);
    expect(configForStages(1).accuracyGate).toBe(true);
    expect(configForStages(1).jitter).toBe(false);
    expect(configForStages(STAGES.length)).toEqual({
      accuracyGate: true, jitter: true, spikeRejection: true, imuFusion: true,
    });
  });

  it("reports a row per stage plus raw", () => {
    const { rows, truthM } = ladder(simulate());
    expect(rows).toHaveLength(STAGES.length + 1);
    expect(truthM).toBeGreaterThan(0);
    expect(rows[0].label).toBe("raw GPS");
  });

  it("accumulates distance per zone that sums to the total", () => {
    const r = runPipeline(simulate(), configForStages(STAGES.length));
    const summed = Object.values(r.perZoneM).reduce((a, b) => a + b, 0);
    expect(summed).toBeCloseTo(r.distanceM, 3);
  });

  it("dead reckoning is what rescues position accuracy", () => {
    const s = simulate();
    const withoutImu = runPipeline(s, configForStages(3));
    const withImu = runPipeline(s, configForStages(4));
    expect(withImu.rmseM).toBeLessThan(withoutImu.rmseM);
    expect(withImu.bridged).toBeGreaterThan(0);
  });
});
