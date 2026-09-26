// HYG v41 star field: bin loader + local sidereal time + alt/az projection.
// Pure math and I/O only — no React, no DOM. The NightSky render layer
// (P3-02b) turns this into pixels; moon.ts (M41) reuses lst()/raDecToAltAz()
// so the two share one horizon-projection instead of two slightly different
// ones. scripts/gen-starfield.mjs (build-time, manual) writes the bin this
// loader reads (live-data-spec.md#1.3, #4 R6).

const RAD = Math.PI / 180;

/** Row layout: 4 x Int16LE — raHours*1000, decDeg*100, mag*100, ci*1000.
 *  Chosen so every field fits Int16 (RA hours keeps 3 decimal places, about
 *  3.6 arcsec; dec keeps 2, about 36 arcsec — plenty for mag<=5 stars drawn
 *  as points) while the row stays 8 bytes; a 4-byte little-endian row-count
 *  header comes first so a reader never has to infer the count from length. */
const RA_SCALE = 1000;
const DEC_SCALE = 100;
const MAG_SCALE = 100;
const CI_SCALE = 1000;
const HEADER_BYTES = 4;
const BYTES_PER_ROW = 8;

export interface Star {
  raHours: number;
  decDeg: number;
  mag: number;
  ci: number;
}

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Encodes rows in the format above. Exported so gen-starfield.mjs and its
 *  test can both call it without shelling out to node -e. */
export function encodeStarField(stars: Star[]): Buffer {
  const buf = Buffer.alloc(HEADER_BYTES + stars.length * BYTES_PER_ROW);
  buf.writeUInt32LE(stars.length, 0);
  stars.forEach((s, i) => {
    const o = HEADER_BYTES + i * BYTES_PER_ROW;
    buf.writeInt16LE(Math.round(s.raHours * RA_SCALE), o);
    buf.writeInt16LE(Math.round(s.decDeg * DEC_SCALE), o + 2);
    buf.writeInt16LE(Math.round(s.mag * MAG_SCALE), o + 4);
    buf.writeInt16LE(Math.round(s.ci * CI_SCALE), o + 6);
  });
  return buf;
}

/** Reads `public/sky/stars-hyg41-m5.bin` (or any buffer in that layout). */
export function decodeStarField(bytes: ArrayBufferLike): Star[] {
  const view = new DataView(bytes);
  const count = view.getUint32(0, true);
  const stars: Star[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * BYTES_PER_ROW;
    stars[i] = {
      raHours: view.getInt16(o, true) / RA_SCALE,
      decDeg: view.getInt16(o + 2, true) / DEC_SCALE,
      mag: view.getInt16(o + 4, true) / MAG_SCALE,
      ci: view.getInt16(o + 6, true) / CI_SCALE,
    };
  }
  return stars;
}

/** Fetches and decodes the shipped star field (browser runtime only). */
export async function loadStarField(
  url = "/sky/stars-hyg41-m5.bin",
  fetchImpl: typeof fetch = fetch,
): Promise<Star[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(String(res.status));
  return decodeStarField(await res.arrayBuffer());
}

/** Local (apparent) sidereal time in degrees, GMST (Meeus 12.4) plus east
 *  longitude — the UT1/UTC distinction and nutation-in-RA correction both
 *  round to well under a pointing-error a mag<=5 dot needs, so this treats
 *  `d`'s own UTC instant as UT1, matching sky.ts's julianDay/solarFrame
 *  precision elsewhere in this codebase. */
export function lst(d: Date, lonDeg: number): number {
  const jd = d.getTime() / 86_400_000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const gmst =
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T ** 2 - T ** 3 / 38710000;
  return norm360(gmst + lonDeg);
}

export interface AltAz {
  altitudeDeg: number;
  azimuthDeg: number;
}

/** Equatorial (RA in hours, Dec in degrees) to horizon coordinates at
 *  `(latDeg, lonDeg)` and instant `d`. Standard spherical-trig transform,
 *  shared by moon.ts and (once P3-02b renders it) the star field. */
export function raDecToAltAz(raHours: number, decDeg: number, d: Date, latDeg: number, lonDeg: number): AltAz {
  const haDeg = norm360(lst(d, lonDeg) - raHours * 15);
  const ha = haDeg * RAD;
  const lat = latDeg * RAD;
  const dec = decDeg * RAD;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const altitudeDeg = Math.asin(Math.min(1, Math.max(-1, sinAlt))) / RAD;
  const cosAz = (Math.sin(dec) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(altitudeDeg * RAD));
  let azimuthDeg = Math.acos(Math.min(1, Math.max(-1, cosAz))) / RAD;
  if (Math.sin(ha) > 0) azimuthDeg = 360 - azimuthDeg;
  return { altitudeDeg, azimuthDeg };
}
