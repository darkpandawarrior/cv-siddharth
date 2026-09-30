import type { WindResponse } from "../../../../api/_lib/wind-handler.ts";
import { sunPosition } from "../../../lib/sky.ts";
import { localTime } from "../exploreMath.ts";
import type { LatLon } from "../geoMath.ts";
import { activeShowers, meteorShowerLine, radiantRiseTime } from "../layers/meteors.ts";
import { parseQuakes, quakesAtTime } from "../layers/quake.ts";
import { buildWindField, sampleWind } from "../layers/windField.ts";
import { nearestQuakeWithin, windLabel } from "./hoverReadout.ts";

export interface PinnedValue { label: string; value: string; source: string; time: string }
export const utc = (at: number | string | null | undefined) => {
  const instant = typeof at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(at) ? at + "Z" : at;
  const date = new Date(instant ?? NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "Observation time unavailable";
};
export function pinnedValues(point: LatLon, at: Date, wind: WindResponse | null, rawQuakes: unknown, windFailed = false, quakeFailed = false): PinnedValue[] {
  const sun = sunPosition(at, point.lat, point.lon);
  const computedTime = `Computed for ${utc(at.getTime())}`;
  const values: PinnedValue[] = [
    { label: "Local solar time", value: localTime(at, point.lon), source: "Computed from longitude, approximate", time: computedTime },
    { label: "Sun position", value: `${sun.altitudeDeg.toFixed(1)}° altitude · ${sun.azimuthDeg.toFixed(1)}° azimuth`, source: "Computed, NOAA solar equations", time: computedTime },
  ];
  const validWind = !windFailed && wind?.connected && wind.grid && Object.values(wind.grid).every(Number.isFinite) && Number.isInteger(wind.grid.latCount) && Number.isInteger(wind.grid.lonCount) && wind.grid.latCount > 0 && wind.grid.lonCount > 0 && wind.grid.latStep > 0 && wind.grid.lonStep > 0 && wind.modelTime && Number.isFinite(Date.parse(wind.modelTime)) && Array.isArray(wind.u) && Array.isArray(wind.v) && wind.u.length === wind.grid.latCount * wind.grid.lonCount && wind.v.length === wind.u.length && wind.u.every(Number.isFinite) && wind.v.every(Number.isFinite);
  let windValue = "Unavailable";
  if (validWind && wind?.grid) {
    const sampled = sampleWind(buildWindField(wind.grid, wind.u, wind.v), point.lat, point.lon);
    const { speed, compass } = windLabel(sampled.u, sampled.v);
    windValue = compass === "calm" ? "Calm (0.0 m/s)" : `${speed.toFixed(1)} m/s toward ${compass}`;
  }
  values.push({ label: "Wind", value: windValue, source: `Open-Meteo (CC BY 4.0), sampled model grid${wind?.stale || windFailed ? ", stale or failed" : ", snapshot"}`, time: `Model time: ${utc(wind?.modelTime)}` });
  let quakes = null;
  try { quakes = quakeFailed ? null : parseQuakes(rawQuakes); } catch { /* Malformed feed stays unavailable. */ }
  const nearest = nearestQuakeWithin(quakes ? quakesAtTime(quakes.filter(q => [q.lat, q.lon, q.mag, q.timeMs].every(Number.isFinite)), at.getTime()) : null, point);
  values.push({ label: "Nearest quake", value: nearest ? `M${nearest.quake.mag.toFixed(1)} · ${Math.round(nearest.km)} km away` : quakes ? "Unavailable: no event within 300 km at this time" : "Unavailable: feed not loaded or failed", source: "USGS all-day feed, observed event; distance computed", time: nearest ? `Observed ${utc(nearest.quake.timeMs)}` : "Observation time unavailable" });
  return values;
}
export function pinnedMeteors(point: LatLon, at: Date): PinnedValue {
  const lines = activeShowers(at).map(shower => meteorShowerLine(shower, radiantRiseTime(shower.raHours, shower.decDeg, point.lat, point.lon, at), point.lon));
  return { label: "Meteor showers", value: lines.join("; ") || "Unavailable: no active shower in the calendar", source: "IMO calendar, computed radiant (approximate)", time: `Computed for ${utc(at.getTime())}` };
}
/** Preserve the model period before the hover's existing parsers discard it. */
export function modelObservationTime(raw: unknown): string | null {
  const data = raw as { current?: { time?: unknown }; daily?: { time?: unknown[] } } | null;
  const current = data?.current?.time;
  if (typeof current === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(current)) {
    const value = utc(current + "Z");
    return value === "Observation time unavailable" || new Date(current + "Z").toISOString().slice(0, current.length) !== current ? null : value;
  }
  const daily = data?.daily?.time?.[0];
  return typeof daily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(daily) && Number.isFinite(Date.parse(daily)) && new Date(daily).toISOString().slice(0, 10) === daily ? `${daily} UTC (daily model period)` : null;
}
