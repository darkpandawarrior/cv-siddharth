import type { Buoy } from "../../../../api/_lib/buoys-handler.ts";
export type { Buoy };
export function parseBuoyResponse(data: unknown): Buoy[] | null {
  if (!data || typeof data !== "object" || !("buoys" in data) || !Array.isArray(data.buoys)) return null;
  const rows = data.buoys as Buoy[];
  return rows.filter((b) => b && typeof b.id === "string" && Number.isFinite(b.at) && Number.isFinite(b.lat) && Math.abs(b.lat) <= 90 && Number.isFinite(b.lon) && Math.abs(b.lon) <= 180).slice(0, 200);
}
