import { describe, expect, test } from "vitest";
import {
  sunBinding,
  volStrength,
  cloudCoverUniform,
  cloudShadeMultiplier,
  rainBinding,
  windBinding,
  fogK,
  mist,
  hazeBinding,
  riverDischargeIst,
  riverBinding,
  seasonWet,
  chessLampBinding,
  kiteAltitudeBinding,
  KITE_FLOOR_M,
  collarState,
  keystoneLampLit,
  repoSlugFromFullName,
  lanternEmissiveFactor,
  DOWNSTREAM_BEARING_DEG,
  ss,
} from "./liveBinding.ts";
import { worldDir } from "../skyFrame.ts";
import { SANGAM_NIGHT_ROW, SANGAM_GOLDEN_ROW } from "./sangamSky.ts";
import { NIGHT_SURVEY } from "../../../lib/nightSurvey.ts";
import type { River } from "../../../lib/sky.ts";
import type { SignalsResponse } from "../../../../api/_lib/signals-handler.ts";

// The real 2026-09-24 03:30 IST sample (R1's own widened fixture,
// e2e/fixtures/weather-2026-09-24.json): dischargeM3s 73.64, next [78.98, 54.46].
const RIVER_FIXTURE: River = { date: "2026-09-24", dischargeM3s: 73.64, next: [78.98, 54.46], range7d: [32.27, 99.46] };

describe("row 1 — sunBinding", () => {
  test("fixture: night altitude -> Night Survey row, sunI unchanged by clear sky", () => {
    const b = sunBinding(-30, DOWNSTREAM_BEARING_DEG, null);
    expect(b.sky).toEqual(SANGAM_NIGHT_ROW);
    expect(b.sunI).toBe(NIGHT_SURVEY.sunI);
  });

  test("fixture: golden altitude -> the v2 §7 row, cloud dims sunI", () => {
    const b = sunBinding(8, DOWNSTREAM_BEARING_DEG, 100);
    expect(b.sky).toEqual(SANGAM_GOLDEN_ROW);
    expect(b.sunI).toBeCloseTo(SANGAM_GOLDEN_ROW.sunI * 0.4, 10); // 1 - 0.6*1
  });

  test("uSunDir is the true-compass worldDir, not a rigid rotation (M4)", () => {
    const b = sunBinding(15, 120, null);
    expect(b.uSunDir).toEqual(worldDir(120, 15));
  });

  test("null cloud never fails (pure math) — behaves as clear", () => {
    const b = sunBinding(8, DOWNSTREAM_BEARING_DEG, null);
    expect(b.sunI).toBe(SANGAM_GOLDEN_ROW.sunI);
  });
});

describe("row 2 — volStrength", () => {
  test("fixture: overcast night -> 0", () => {
    expect(volStrength(-30, 95, 0.5)).toBe(0);
  });
  test("below the lower altitude clamp (-2°)", () => {
    expect(volStrength(-2, 0, 0)).toBe(0);
  });
  test("above the upper altitude clamp (4°), clear/no-haze -> 1", () => {
    expect(volStrength(4, 0, 0)).toBe(1);
  });
  test("null weather -> ss(-2,4,alpha) alone; null haze -> design 0.5", () => {
    expect(volStrength(90, null, null)).toBeCloseTo(0.75, 10); // 1 * 1 * (1-0.5*0.5)
  });
});

describe("row 3 — cloudCoverUniform", () => {
  test("fixture: 95% cloud -> 0.95", () => {
    expect(cloudCoverUniform(95)).toBeCloseTo(0.95, 10);
  });
  test("below the lower clamp (negative input)", () => {
    expect(cloudCoverUniform(-10)).toBe(0);
  });
  test("above the upper clamp (>100)", () => {
    expect(cloudCoverUniform(150)).toBe(1);
  });
  test("null -> 0 (drawn clear)", () => {
    expect(cloudCoverUniform(null)).toBe(0);
  });
});

describe("row 4 — cloudShadeMultiplier", () => {
  test("fixture: code 3 (overcast) -> unchanged", () => {
    expect(cloudShadeMultiplier(3)).toBe(1);
  });
  test("just below the rain threshold (60) -> unchanged", () => {
    expect(cloudShadeMultiplier(60)).toBe(1);
  });
  test("at/above the rain threshold (61) -> ×0.7", () => {
    expect(cloudShadeMultiplier(61)).toBe(0.7);
  });
  test("thunder (95) -> ×0.7", () => {
    expect(cloudShadeMultiplier(95)).toBe(0.7);
  });
  test("null -> unchanged", () => {
    expect(cloudShadeMultiplier(null)).toBe(1);
  });
});

describe("row 5 — rainBinding", () => {
  test("fixture: 2.4 mm/h, tier 1 -> 960 drops", () => {
    const r = rainBinding(2.4, 1);
    expect(r.count).toBe(960);
    expect(r.ringsStrength).toBeCloseTo(0.3, 10);
  });
  test("tier caps the count (the tier's own clamp)", () => {
    expect(rainBinding(2.4, 2).count).toBe(400);
    expect(rainBinding(2.4, 3).count).toBe(0);
  });
  test("above the tier-1 cap (1200)", () => {
    expect(rainBinding(10, 1).count).toBe(1200);
  });
  test("null / zero -> no rain, petals unsuppressed", () => {
    expect(rainBinding(null, 1)).toEqual({ count: 0, ringsStrength: 0, petalFallFactor: 1 });
    expect(rainBinding(0, 1)).toEqual({ count: 0, ringsStrength: 0, petalFallFactor: 1 });
  });
});

describe("row 6 — windBinding", () => {
  test("fixture: 10.3 km/h from 263°", () => {
    const w = windBinding(10.3, 263);
    const ws = 10.3 / 35;
    expect(w.strength).toBeCloseTo(0.05 + 0.95 * ws, 10);
    expect(w.petalDriftMps).toBeCloseTo(0.3 + 3 * ws, 10);
    expect(w.kiteLeanDeg).toBeCloseTo(10 + 25 * ws, 10);
    expect(w.rippleScroll).toBeCloseTo(0.02 + 0.1 * ws, 10);
  });
  test("above the strength clamp (>35 km/h saturates at 1)", () => {
    expect(windBinding(1000, 90).strength).toBeCloseTo(1, 10);
  });
  test("calm (0 km/h) -> the strength floor, not 0", () => {
    expect(windBinding(0, 90).strength).toBeCloseTo(0.05, 10);
  });
  test("null -> strength 0.05, direction downstream (the world's own +Z)", () => {
    const w = windBinding(null, null);
    expect(w.strength).toBeCloseTo(0.05, 10);
    expect(w.dirXZ[0]).toBeCloseTo(0, 10);
    expect(w.dirXZ[1]).toBeCloseTo(1, 10);
  });
});

describe("row 7 — fogK", () => {
  test("fixture: 11,420 m -> 0.0238", () => {
    expect(fogK(11_420)).toBeCloseTo(0.0238, 4);
  });
  test("below the lower clamp (very high visibility) -> the base value", () => {
    expect(fogK(100_000)).toBeCloseTo(0.018, 10);
  });
  test("above the upper clamp (very low visibility) -> ×2.5", () => {
    expect(fogK(500)).toBeCloseTo(0.045, 10);
  });
  test("null -> 0.018 (v2's own design value)", () => {
    expect(fogK(null)).toBe(0.018);
  });
});

describe("row 8 — mist", () => {
  test("fixture: 94% RH -> close to the design ceiling", () => {
    expect(mist(94)).toBeCloseTo(0.35 + 0.65 * ss(60, 95, 94), 12);
  });
  test("below the lower clamp (60%) -> the dry floor", () => {
    expect(mist(50)).toBe(0.35);
  });
  test("above the upper clamp (100%) -> the wet ceiling", () => {
    expect(mist(100)).toBeCloseTo(1.0, 10);
  });
  test("null -> 0.35", () => {
    expect(mist(null)).toBe(0.35);
  });
});

describe("row 9 — hazeBinding", () => {
  test("fixture: PM2.5 29.2 -> hazeN 0.49, ×0.99, Δm 0.73", () => {
    const h = hazeBinding(29.2);
    expect(h.hazeN).toBeCloseTo(0.487, 2);
    expect(h.hazeMul).toBeCloseTo(0.99, 2);
    expect(h.starDeltaM).toBeCloseTo(0.73, 2);
  });
  test("below the lower clamp (PM2.5 0) -> the 0.15 floor", () => {
    expect(hazeBinding(0).hazeN).toBe(0.15);
  });
  test("above the upper clamp (PM2.5 1000) -> 1", () => {
    expect(hazeBinding(1000).hazeN).toBe(1);
  });
  test("null -> hazeN 0.5 (design haze)", () => {
    const h = hazeBinding(null);
    expect(h.hazeN).toBe(0.5);
    expect(h.hazeMul).toBe(1.0);
  });
});

describe("row 10 — riverDischargeIst + riverBinding", () => {
  test("before 05:30 IST, 'today' is river.next[0] (the UTC/IST day-boundary correction)", () => {
    const now = new Date("2026-09-24T03:30:00+05:30");
    expect(riverDischargeIst(now, RIVER_FIXTURE)).toBe(78.98);
  });
  test("at/after 05:30 IST, 'today' is river.dischargeM3s", () => {
    const now = new Date("2026-09-24T12:27:00+05:30");
    expect(riverDischargeIst(now, RIVER_FIXTURE)).toBe(73.64);
  });
  test("null river -> null", () => {
    expect(riverDischargeIst(new Date("2026-09-24T03:30:00+05:30"), null)).toBeNull();
  });

  test("fixture: 78.98 m³/s -> 0.95 m/s, foam 0.66", () => {
    const r = riverBinding(78.98);
    expect(r.flowSpeed).toBeCloseTo(0.95, 2);
    expect(r.foam).toBeCloseTo(0.66, 2);
  });
  test("below the flowSpeed floor (a near-dry reading)", () => {
    expect(riverBinding(1).flowSpeed).toBe(0.2);
    expect(riverBinding(1).foam).toBe(0);
  });
  test("above the flowSpeed ceiling (a flood reading)", () => {
    expect(riverBinding(1_000_000).flowSpeed).toBe(1.6);
    expect(riverBinding(1_000_000).foam).toBe(1);
  });
  test("null discharge -> 0.35 m/s, foam 0", () => {
    expect(riverBinding(null)).toEqual({ flowSpeed: 0.35, foam: 0 });
  });
});

describe("row 11 — seasonWet", () => {
  test("fixture: 140mm over a 100mm normal -> wet", () => {
    expect(seasonWet(140, 100)).toBeCloseTo(0.6, 10);
  });
  test("below the lower clamp (far under the normal) -> 0", () => {
    expect(seasonWet(0, 100)).toBe(0);
  });
  test("above the upper clamp (far over the normal) -> 1", () => {
    expect(seasonWet(1000, 100)).toBe(1);
  });
  test("null sum, or no normal to compare against -> 0 (v2's own monsoon-end look)", () => {
    expect(seasonWet(null, 100)).toBe(0);
    expect(seasonWet(140, 0)).toBe(0);
  });
});

describe("row 16 — chessLampBinding", () => {
  test("fixture: playing now -> 1", () => {
    expect(chessLampBinding({ online: true, playing: true })).toBe(1);
  });
  test("online, not playing -> 0.3", () => {
    expect(chessLampBinding({ online: true, playing: false })).toBe(0.3);
  });
  test("offline -> 0 (unlit clay)", () => {
    expect(chessLampBinding({ online: false, playing: false })).toBe(0);
  });
  test("null -> 'unmeasured', never a guessed 'not playing'", () => {
    expect(chessLampBinding(null)).toBe("unmeasured");
  });
});

describe("row 17 — kiteAltitudeBinding", () => {
  const devto: SignalsResponse["devto"] = [
    { url: "https://dev.to/x/a", reactions: 0, comments: 0, publishedAt: "2026-08-01T00:00:00Z" },
    { url: "https://dev.to/x/b", reactions: 1, comments: 0, publishedAt: "2026-08-01T00:00:00Z" },
  ];
  test("fixture: 0 engagement -> the 18m floor, but measured", () => {
    const k = kiteAltitudeBinding(devto, "https://dev.to/x/a");
    expect(k).toEqual({ altitudeM: 18, measured: true });
  });
  test("fixture: 1 engagement -> 24m", () => {
    const k = kiteAltitudeBinding(devto, "https://dev.to/x/b");
    expect(k.altitudeM).toBeCloseTo(24, 10);
    expect(k.measured).toBe(true);
  });
  test("above the ceiling (60m) for a very high engagement count", () => {
    const huge: SignalsResponse["devto"] = [{ url: "https://dev.to/x/c", reactions: 10_000, comments: 0, publishedAt: "2026-08-01T00:00:00Z" }];
    expect(kiteAltitudeBinding(huge, "https://dev.to/x/c").altitudeM).toBe(60);
  });
  test("no matching URL -> the floor, unmeasured (grey tether)", () => {
    expect(kiteAltitudeBinding(devto, "https://dev.to/x/not-linked")).toEqual({ altitudeM: KITE_FLOOR_M, measured: false });
  });
  test("no link at all -> the floor, unmeasured", () => {
    expect(kiteAltitudeBinding(devto, null)).toEqual({ altitudeM: KITE_FLOOR_M, measured: false });
    expect(kiteAltitudeBinding(devto, undefined)).toEqual({ altitudeM: KITE_FLOOR_M, measured: false });
  });
  test("null devto (whole signal down) -> every lesson at the floor, unmeasured", () => {
    expect(kiteAltitudeBinding(null, "https://dev.to/x/a")).toEqual({ altitudeM: KITE_FLOOR_M, measured: false });
  });
});

const SIGNALS_CI: SignalsResponse["ci"] = {
  doori: { state: "pass", newestAt: "2026-09-24T03:00:00Z", failing: [] },
  gaddi: { state: "pass", newestAt: "2026-09-24T03:00:00Z", failing: [] },
  "paymentslab-kmp": { state: "fail", newestAt: "2026-09-24T03:00:00Z", failing: ["Quality Gate"] },
  "kmp-toolkit": { state: "pass", newestAt: "2026-09-24T03:00:00Z", failing: [] },
  "kmp-build-logic": { state: "none", newestAt: null, failing: [] },
};

describe("row 18 — collarState", () => {
  test("fixture: a passing repo", () => {
    expect(collarState("doori", SIGNALS_CI)).toBe("pass");
  });
  test("a failing repo", () => {
    expect(collarState("paymentslab-kmp", SIGNALS_CI)).toBe("fail");
  });
  test("state 'none' (never run) -> unmeasured, never amber", () => {
    expect(collarState("kmp-build-logic", SIGNALS_CI)).toBe("unmeasured");
  });
  test("a slug with no entry at all (private registry repo) -> unmeasured", () => {
    expect(collarState("candidai", SIGNALS_CI)).toBe("unmeasured");
  });
  test("null ci (whole signal down) -> every collar unmeasured", () => {
    expect(collarState("doori", null)).toBe("unmeasured");
  });
});

describe("row 19 — keystoneLampLit", () => {
  test("fixture: both foundation repos pass -> lit", () => {
    const both: SignalsResponse["ci"] = { ...SIGNALS_CI, "kmp-build-logic": { state: "pass", newestAt: "x", failing: [] } };
    expect(keystoneLampLit(both)).toBe(true);
  });
  test("one fails -> unlit", () => {
    const oneFails: SignalsResponse["ci"] = { ...SIGNALS_CI, "kmp-build-logic": { state: "fail", newestAt: "x", failing: ["x"] } };
    expect(keystoneLampLit(oneFails)).toBe(false);
  });
  test("one never ran -> unlit (SIGNALS_CI's own kmp-build-logic: 'none')", () => {
    expect(keystoneLampLit(SIGNALS_CI)).toBe(false);
  });
  test("null -> unlit", () => {
    expect(keystoneLampLit(null)).toBe(false);
  });
});

describe("row 21 — repoSlugFromFullName", () => {
  test("fixture: an owner/Repo pair, case-folded", () => {
    expect(repoSlugFromFullName("darkpandawarrior/PaymentsLab-KMP")).toBe("paymentslab-kmp");
    expect(repoSlugFromFullName("darkpandawarrior/Doori")).toBe("doori");
  });
  test("no slash -> the whole string, lower-cased", () => {
    expect(repoSlugFromFullName("STANDALONE")).toBe("standalone");
  });
});

describe("row 22 — lanternEmissiveFactor", () => {
  test("fixture: the -2° edge -> 0", () => {
    expect(lanternEmissiveFactor(-2)).toBe(0);
  });
  test("the -10° edge -> 1", () => {
    expect(lanternEmissiveFactor(-10)).toBe(1);
  });
  test("above -2° (daytime) clamps at 0", () => {
    expect(lanternEmissiveFactor(20)).toBe(0);
  });
  test("below -10° (deep night) clamps at 1", () => {
    expect(lanternEmissiveFactor(-40)).toBe(1);
  });
  test("midpoint (-6°) -> 0.5", () => {
    expect(lanternEmissiveFactor(-6)).toBeCloseTo(0.5, 10);
  });
});
