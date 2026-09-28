import type { LatLon } from "./geoMath.ts";

export type Ring = [number, number][];
export interface Country { name: string; iso: string; polygons: Ring[][] }
export interface CountryIndex { countries: Country[]; grid: number[][]; parseMs: number }

/** Natural Earth splits rings at ±180. Preserve those splits and holes. */
export function pointInRing(point: LatLon, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [u, v] = ring[j];
    const cross = (point.lon - x) * (v - y) - (point.lat - y) * (u - x);
    if (Math.abs(cross) < 1e-9 && point.lon >= Math.min(x, u) && point.lon <= Math.max(x, u) && point.lat >= Math.min(y, v) && point.lat <= Math.max(y, v)) return true;
    if ((y > point.lat) !== (v > point.lat) && point.lon < (u - x) * (point.lat - y) / (v - y) + x) inside = !inside;
  }
  return inside;
}
export function inCountry(point: LatLon, country: Country): boolean {
  return country.polygons.some(([outer, ...holes]) => pointInRing(point, outer) && !holes.some(hole => pointInRing(point, hole)));
}
const column = (lon: number) => Math.max(0, Math.min(71, Math.floor((lon + 180) / 5)));
const row = (lat: number) => Math.max(0, Math.min(35, Math.floor((lat + 90) / 5)));
export function countryAt(index: CountryIndex, point: LatLon): number {
  if (!Number.isFinite(point.lat + point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return -1;
  return index.grid[row(point.lat) * 72 + column(point.lon)].find(i => inCountry(point, index.countries[i])) ?? -1;
}

/** Run once in the module worker, including JSON parsing and the 5° grid. */
export function parseCountries(source: string): CountryIndex {
  const start = performance.now();
  const raw: unknown = JSON.parse(source);
  if (!Array.isArray(raw) || !raw.length || raw.length > 300) throw new Error("Invalid country data");
  const countries: Country[] = raw.map((value: unknown) => {
    const c = value as Country;
    if (!c || typeof c.name !== "string" || typeof c.iso !== "string" || !Array.isArray(c.polygons)) throw new Error("Invalid country");
    return { name: c.name, iso: c.iso, polygons: c.polygons.map(polygon => {
      if (!Array.isArray(polygon) || !polygon.length) throw new Error("Invalid polygon");
      return polygon.map(ring => {
        if (!Array.isArray(ring) || ring.length < 4) throw new Error("Invalid ring");
        return ring.map(pair => {
          if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite) || Math.abs(pair[0]) > 18000 || Math.abs(pair[1]) > 9000) throw new Error("Invalid coordinate");
          return [pair[0] / 100, pair[1] / 100] as [number, number];
        });
      });
    }) };
  });
  const grid: number[][] = Array.from({ length: 72 * 36 }, () => []);
  countries.forEach((country, i) => country.polygons.forEach(([outer]) => {
    let west = 180, east = -180, south = 90, north = -90;
    for (const [lon, lat] of outer) { west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat); }
    for (let y = row(south); y <= row(north); y++) for (let x = column(west); x <= column(east); x++) {
      const cell = grid[y * 72 + x];
      if (!cell.includes(i)) cell.push(i);
    }
  }));
  return { countries, grid, parseMs: performance.now() - start };
}
