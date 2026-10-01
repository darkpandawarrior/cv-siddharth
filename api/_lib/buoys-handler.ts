import { proxyFeed } from "./proxy-feed.js";
export type Buoy = { id: string; lat: number; lon: number; at: number; wave: number | null; period: number | null; wind: number | null; direction: number | null; water: number | null };
// NOAA NWS public domain: https://www.weather.gov/disclaimer
export function parseBuoys(text: string): Buoy[] {
  if (!text.startsWith("#STN")) throw new Error("invalid NDBC header");
  const rows: Buoy[] = [];
  const number = (v: string) => v === "MM" || !v ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#") || !line.trim()) continue;
    const c = line.trim().split(/\s+/);
    const lat = number(c[1]), lon = number(c[2]);
    const date = c.slice(3, 8).map(Number);
    const at = Date.UTC(date[0], date[1] - 1, date[2], date[3], date[4]);
    if (date[1] < 1 || date[1] > 12 || date[2] < 1 || date[2] > 31 || date[3] > 23 || date[4] > 59) continue;
    if (!/^[a-z0-9]{3,8}$/i.test(c[0]) || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(at)) continue;
    rows.push({ id: c[0], lat, lon, at, direction: number(c[8]), wind: number(c[9]), wave: number(c[11]), period: number(c[12]), water: number(c[18]) });
  }
  // Deterministic newest-first sample, keeping the JSON under 40 KB.
  return rows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, 200);
}
export async function handleBuoys(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  const result = await proxyFeed("buoys", () => fetch("https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt", { signal: AbortSignal.timeout(8000) }), parseBuoys,
    { minIntervalMs: 600000, maxStaleMs: 3600000, maxBytes: 300000, cooldownMs: 600000, maxCooldownMs: 3600000 });
  if (result.value === null) return Response.json({ error: "NOAA NDBC unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  const body = JSON.stringify({ buoys: result.value, fetchedAt: result.at, stale: result.stale, ageMs: result.ageMs, source: "NOAA NDBC", sampled: true });
  if (new TextEncoder().encode(body).length > 40000) return Response.json({ error: "buoy response too large" }, { status: 502 });
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": `public, max-age=0, s-maxage=${result.stale ? 30 : Math.max(1, Math.ceil((600000 - (result.ageMs ?? 0)) / 1000))}` } });
}
