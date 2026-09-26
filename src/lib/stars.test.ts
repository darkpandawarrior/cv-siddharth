import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodeStarField, decodeStarField, lst, raDecToAltAz, type Star } from "./stars.ts";
import { PUNE } from "./sky.ts";

const BIN_PATH = fileURLToPath(new URL("../../public/sky/stars-hyg41-m5.bin", import.meta.url));

describe("lst", () => {
  it("reads GMST = 18.697374558h x 15 at J2000.0, then +73.8567 for Pune", () => {
    const j2000 = new Date("2000-01-01T12:00:00Z");
    const gmstDeg = 18.697374558 * 15;
    expect(lst(j2000, 0)).toBeCloseTo(gmstDeg, 2);
    expect(lst(j2000, 73.8567)).toBeCloseTo((gmstDeg + 73.8567) % 360, 2);
  });
});

describe("raDecToAltAz", () => {
  it("puts Polaris (RA 2.5303h, Dec 89.2642deg) at 18.5 +/- 0.7deg from Pune at 2026-09-24 21:00 IST", () => {
    const d = new Date("2026-09-24T21:00:00+05:30");
    const { altitudeDeg } = raDecToAltAz(2.5303, 89.2642, d, PUNE.lat, PUNE.lon);
    expect(Math.abs(altitudeDeg - 18.5)).toBeLessThanOrEqual(0.7);
  });
});

describe("encodeStarField / decodeStarField", () => {
  it("round-trips through the Int16 row layout", () => {
    const stars: Star[] = [
      { raHours: 6.7525, decDeg: -16.7161, mag: -1.44, ci: 0.009 }, // Sirius
      { raHours: 0, decDeg: -90, mag: 5, ci: 3 },
    ];
    const decoded = decodeStarField(encodeStarField(stars).buffer);
    expect(decoded.length).toBe(2);
    expect(decoded[0].raHours).toBeCloseTo(6.7525, 2);
    expect(decoded[0].decDeg).toBeCloseTo(-16.7161, 1);
    expect(decoded[0].mag).toBeCloseTo(-1.44, 2);
    expect(decoded[0].ci).toBeCloseTo(0.009, 3);
  });
});

describe("the shipped star field", () => {
  const bytes = readFileSync(BIN_PATH);
  const stars = decodeStarField(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

  it("has a row count matching its header, every row mag <= 5.0, and Sirius present", () => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(stars.length).toBe(view.getUint32(0, true));
    expect(stars.every((s) => s.mag <= 5.0)).toBe(true);
    const sirius = stars.find(
      (s) => Math.abs(s.raHours - 6.7525) < 0.01 && Math.abs(s.decDeg - -16.7161) < 0.1,
    );
    expect(sirius).toBeDefined();
    expect(sirius!.mag).toBeLessThan(-1.3);
  });

  it("is at most 16,384 bytes (live-data-spec.md#4 R6 budget)", () => {
    expect(bytes.byteLength).toBeLessThanOrEqual(16_384);
  });
});
