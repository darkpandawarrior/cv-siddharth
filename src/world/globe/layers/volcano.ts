import type { Volcano } from "../../../../api/_lib/volcano-handler.ts";
import type { EonetEvent } from "./eonet.ts";
export type { Volcano };
export function parseVolcanoResponse(data: unknown): Volcano[] | null {
  if (!data || typeof data !== "object" || !("volcanoes" in data) || !Array.isArray(data.volcanoes)) return null;
  return (data.volcanoes as Volcano[]).filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && Number.isFinite(v.at));
}
export function volcanoGlyphs(rows: Volcano[]): EonetEvent[] {
  return rows.filter((v) => v.lat !== null && v.lon !== null && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Math.abs(v.lat!) <= 90 && Math.abs(v.lon!) <= 180).map((v) => ({ id: `gvp:${v.id}`, title: v.name, category: "volcanoes", dateMs: v.at, lat: v.lat!, lon: v.lon!, track: null, sourceId: "Smithsonian GVP / USGS weekly report", sourceUrl: "https://volcano.si.edu/reports_weekly.cfm" }));
}
