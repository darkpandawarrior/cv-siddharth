// Pure row formatters shared by the footer, the v1 world ledger, /terminal
// and the v2 ledger (live-data-spec §1.3): every place that renders a live
// reading imports these instead of restating the wording, so "modelled" and
// "not a gauge" read identically everywhere a number like this appears.
import type { Air, River, Season, Weather } from "./sky.ts";
import { WMO_LABEL } from "./sky.ts";

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

function compassFrom(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

/** Open-Meteo's own US AQI bands. */
function aqiBand(usAqi: number): string {
  if (usAqi <= 50) return "good";
  if (usAqi <= 100) return "moderate";
  if (usAqi <= 150) return "unhealthy for sensitive groups";
  if (usAqi <= 200) return "unhealthy";
  if (usAqi <= 300) return "very unhealthy";
  return "hazardous";
}

/** P7's own sun sentence (SkyLine's sr-only text), reused rather than
 *  restated by every other row that wants to say where the sun is. */
export function sunRow(altitudeDeg: number, sunrise: Date, sunset: Date): string {
  const hm = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  return `Sun · altitude ${Math.round(altitudeDeg)}°, computed. Sunrise ${hm(sunrise)}, sunset ${hm(sunset)} IST`;
}

export function weatherRow(w: Weather | null): string {
  if (!w) return "Weather · unavailable right now · Open-Meteo";
  const label = WMO_LABEL[w.code] ?? "unknown";
  return (
    `Weather · ${w.tempC.toFixed(1)} °C, ${label}, cloud ${Math.round(w.cloudPct)}%, ` +
    `wind ${Math.round(w.windKmh)} km/h from ${compassFrom(w.windFromDeg)}, ` +
    `visibility ${(w.visibilityM / 1000).toFixed(1)} km · Open-Meteo · live ${istTime(w.at)} IST`
  );
}

export function airRow(a: Air | null): string {
  if (!a) return "Air · unavailable right now · CAMS via Open-Meteo";
  return (
    `Air · PM2.5 ${Math.round(a.pm25)} µg/m³, US AQI ${Math.round(a.usAqi)} (${aqiBand(a.usAqi)}), modelled · ` +
    `CAMS via Open-Meteo · live ${istTime(a.at)} IST`
  );
}

export function riverRow(r: River | null): string {
  if (!r) return "River · unavailable right now · GloFAS via Open-Meteo, not a gauge";
  return (
    `River · Mula-Mutha ${Math.round(r.dischargeM3s)} m³/s today, ` +
    `modelled (GloFAS 5 km cell, not a gauge) · daily`
  );
}

/** `normalMm` (the 2015-2025 mean for these dates, from the build-time
 *  normals R6 generates) is optional: this lane ships before that file
 *  exists, so a caller without it yet gets the raw total instead of a ratio
 *  it cannot honestly compute. */
export function seasonRow(s: Season | null, normalMm?: number): string {
  if (!s) return "Season · unavailable right now · computed";
  if (normalMm && normalMm > 0) {
    const ratio = (s.sumMm / normalMm).toFixed(1);
    return `Season · last 30 days ${ratio}x the 2015-2025 mean for these dates · computed`;
  }
  return `Season · last 30 days ${Math.round(s.sumMm)} mm · computed`;
}
