import { latLonToXyz, type LatLon } from "./geoMath.ts";

const RAD = Math.PI / 180;
export function distanceAndBearing(a: LatLon, b: LatLon) {
  const p = a.lat * RAD, q = b.lat * RAD, d = (b.lon - a.lon) * RAD;
  const h = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(d / 2) ** 2;
  const km = 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  const y = Math.sin(d) * Math.cos(q), x = Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(d);
  // Coincident and antipodal points have no unique initial bearing.
  const bearing = Math.hypot(x, y) < 1e-12 ? null : (Math.atan2(y, x) / RAD + 360) % 360;
  return { km, nauticalMiles: km / 1.852, bearing };
}

/** Fixed vertex cap: 129/65/33 points at T1/T2/T3, rebuilt only on clicks. */
export function greatCircle(a: LatLon, b: LatLon, segments: number): Float32Array {
  const u = latLonToXyz(a.lat, a.lon), v = latLonToXyz(b.lat, b.lon);
  const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y + u.z * v.z));
  const angle = Math.acos(dot);
  let x = v.x - dot * u.x, y = v.y - dot * u.y, z = v.z - dot * u.z;
  let length = Math.hypot(x, y, z);
  if (length < 1e-10) {
    // Deterministic orthogonal direction for the non-unique antipodal arc.
    [x, y, z] = Math.abs(u.y) < 0.9 ? [-u.z, 0, u.x] : [0, u.z, -u.y];
    length = Math.hypot(x, y, z);
  }
  const points = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const c = Math.cos(angle * i / segments), s = Math.sin(angle * i / segments) / length;
    points.set([u.x * c + x * s, u.y * c + y * s, u.z * c + z * s], i * 3);
  }
  return points;
}

/** Longitude yields solar time, not a political timezone; always label it. */
export function localTime(date: Date, lon: number, timezone?: string): string {
  if (!Number.isFinite(date.getTime())) return "No sunrise/sunset (polar day or night)";
  if (timezone) {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) + ` (${timezone})`;
    } catch { /* Invalid upstream zone falls back to labelled solar time. */ }
  }
  const solar = new Date(date.getTime() + lon * 240_000);
  return solar.toISOString().slice(11, 16) + " solar (approx.)";
}

/** UTC midnight representing the point's calendar date, for sunTimes. */
export function localDate(date: Date, lon: number, timezone?: string): Date {
  if (timezone) {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date).map(p => [p.type, p.value]));
      return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    } catch { /* Fall back to the point's solar calendar if the zone is invalid. */ }
  }
  return new Date(Math.floor((date.getTime() + lon * 240_000) / 86_400_000) * 86_400_000);
}

export function rateLimit(interval: number) {
  let last = -Infinity;
  return (now = Date.now()) => {
    if (now - last < interval) return false;
    last = now;
    return true;
  };
}

/** A trailing debounce also spaces request starts by at least delay ms. */
export function debounce<T>(run: (value: T) => void, delay = 350) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(value: T) { clearTimeout(timer); timer = setTimeout(() => run(value), delay); },
    cancel() { clearTimeout(timer); },
  };
}
