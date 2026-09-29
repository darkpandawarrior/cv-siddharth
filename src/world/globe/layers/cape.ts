// Open-Meteo hourly CAPE: https://open-meteo.com/en/docs (CC BY 4.0).
export const CAPE_HOST = "https://api.open-meteo.com/v1/forecast";
export type CapeReading = { cape: number; at: number };
export async function fetchCape(lat: number, lon: number, now: Date, fetchImpl: typeof fetch = fetch): Promise<CapeReading | null> {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 || !Number.isFinite(now.getTime())) throw new Error("invalid forecast point");
  const url = `${CAPE_HOST}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=cape&forecast_hours=2&timezone=GMT`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("CAPE feed unreachable");
  return parseCape(await res.json(), now);
}
export function parseCape(json: unknown, now: Date): CapeReading | null {
  const hourly = (json as { hourly?: { time?: unknown[]; cape?: unknown[] } } | null)?.hourly;
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly.cape)) return null;
  let best: CapeReading | null = null;
  for (let i = 0; i < hourly.time.length; i++) {
    const text = hourly.time[i], cape = hourly.cape[i];
    if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) || typeof cape !== "number" || !Number.isFinite(cape) || cape < 0) continue;
    const at = Date.parse(text + "Z"), age = now.getTime() - at;
    if (Number.isFinite(at) && new Date(at).toISOString().slice(0, 16) === text && age >= 0 && age <= 3600000 && (!best || at > best.at)) best = { cape, at };
  }
  return best;
}
export function capeLabel(reading: CapeReading): string {
  return `Thunderstorm potential (CAPE): ${reading.cape.toFixed(0)} J/kg, atmospheric instability proxy, not lightning · Open-Meteo ${new Date(reading.at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
