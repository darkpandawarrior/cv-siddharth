import { sunTimes, WMO_LABEL } from "../../lib/sky.ts";
import { isDayAt, type LatLon } from "./geoMath.ts";
import { localDate, localTime } from "./exploreMath.ts";
import type { Selection } from "./globeStore.ts";

export interface Place extends LatLon { name: string; country: string; type: string }
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const text = (v: unknown, fallback = "Unknown") => typeof v === "string" && v ? v : fallback;
export function parsePlaces(value: unknown): Place[] {
  const features = record(value).features;
  if (!Array.isArray(features)) throw new Error("Invalid place response");
  return features.slice(0, 5).flatMap((f: unknown) => {
    const feature = record(f), p = record(feature.properties), coordinates = record(feature.geometry).coordinates;
    if (!Array.isArray(coordinates)) return [];
    const [lon, lat] = coordinates;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat + lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    return [{ lat, lon, name: text(p.name, text(p.city, "Unnamed place")), country: text(p.country), type: text(p.type, text(p.osm_value, "place")) }];
  });
}
async function json(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}
export async function searchPlaces(query: string, signal: AbortSignal) {
  return parsePlaces(await json(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`, signal));
}
const coordinates = (p: LatLon) => ({ label: "Lat / lon", value: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` });
export function placeSelection(place: Place, now: Date): Selection {
  return {
    id: `place:${place.lat}:${place.lon}`, kind: "place", title: place.name,
    rows: [{ label: "Country", value: place.country }, { label: "Type", value: place.type }, coordinates(place), { label: "Local time", value: localTime(now, place.lon) }],
    source: "Photon (OpenStreetMap, ODbL)", live: false,
    focus: { kind: "latlon", lat: place.lat, lon: place.lon, distance: place.type === "country" ? 20 : ["state", "region"].includes(place.type) ? 15 : 10 },
  };
}

export async function pointSelection(point: LatLon, now: Date, signal: AbortSignal, simulated = false): Promise<Selection> {
  // Only this explicit point action requests weather. One failure doesn't hide the other source.
  const [reverse, weather] = await Promise.allSettled([
    json(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${point.lat}&longitude=${point.lon}&localityLanguage=en`, signal),
    ...(simulated ? [] : [json(`https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`, signal)]),
  ]);
  const location = reverse.status === "fulfilled" ? record(reverse.value) : {};
  const forecast = weather?.status === "fulfilled" ? record(weather.value) : {};
  const current = record(forecast.current);
  const zone = typeof forecast.timezone === "string" ? forecast.timezone : undefined;
  // Sunrise/sunset belong to today's local calendar date, including DST.
  const day = localDate(now, point.lon, zone);
  const sun = sunTimes(day, point.lat, point.lon);
  const hasWeather = [current.temperature_2m, current.weather_code, current.wind_speed_10m].every(v => typeof v === "number" && Number.isFinite(v));
  return {
    id: `point:${point.lat}:${point.lon}`, kind: "point", title: text(location.city, text(location.locality, "Selected point")),
    rows: [
      { label: "Country", value: text(location.countryName, "Unavailable / ocean") }, coordinates(point),
      { label: simulated ? "Simulated time" : "Local time", value: localTime(now, point.lon, zone) },
      { label: "Sunrise", value: localTime(sun.sunrise, point.lon, zone) }, { label: "Sunset", value: localTime(sun.sunset, point.lon, zone) },
      { label: "Sunlight", value: isDayAt(now, point.lat, point.lon) ? "day" : "night" },
      { label: "Weather", value: simulated ? "Unavailable in time travel" : hasWeather ? `${current.temperature_2m}°C · ${WMO_LABEL[current.weather_code as number] ?? "unknown condition"}` : "Unavailable" },
      { label: "Wind", value: hasWeather ? `${current.wind_speed_10m} km/h` : "Unavailable" },
      { label: "Weather at", value: hasWeather ? text(current.time) : "Unavailable" },
      { label: "Place lookup", value: reverse.status === "fulfilled" && typeof location.countryName === "string" ? "BigDataCloud" : "Unavailable / ocean" },
    ],
    source: "BigDataCloud; Open-Meteo (CC BY 4.0); NOAA solar equations", live: false,
    focus: { kind: "latlon", ...point, distance: 10 },
  };
}
