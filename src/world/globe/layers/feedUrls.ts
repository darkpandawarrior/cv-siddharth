// LANE V5 (wave 7, lane 5): the feed URL literals `HazardLayer.tsx` fetches,
// pulled out into named, exported constants (no behaviour change -- every
// call site below still fetches the exact same string). This exists so a
// later provenance panel (wave 7 lane 7, "How it's built") can cite the
// exact URL a layer reaches without copying strings out of HazardLayer.tsx
// by hand -- the same "import the real constant, never restate it" rule
// that lane already uses for `ATMO_FRAG`/`CLOUD_FRAG`.
export const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
export const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30";
export const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
export const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
export const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
export const LAUNCHES_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10";

export const NHC_MAPSERVER_BASE =
  "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";

// The 15 "Forecast Cone" sub-layers under NHC_tropical_weather (AT1-5,
// EP1-5, CP1-5 -- Atlantic, East Pacific, Central Pacific, five storm slots
// each). Verified live 2026-09-29 via `${NHC_MAPSERVER_BASE}/layers?f=json`:
// each storm slot is a fixed +26-layer block and "Forecast Cone" always
// sits at slot-base+4, so a new season reusing these slots never needs a
// new id here -- only a live storm occupying an existing, currently-empty
// slot (an inactive slot's own query already answers an empty
// FeatureCollection, not an error).
export const NHC_CONE_LAYER_IDS = [8, 34, 60, 86, 112, 138, 164, 190, 216, 242, 268, 294, 320, 346, 372] as const;

/** `where=1=1` (every feature in the layer) is deliberate: a cone layer
 *  holds at most one active storm's cone at a time, so there is nothing to
 *  filter by. Verified live 2026-09-29: 200, `application/geo+json`, CORS
 *  echoes the request Origin with credentials. */
export function nhcConeUrl(layerId: number): string {
  return `${NHC_MAPSERVER_BASE}/${layerId}/query?where=1%3D1&outFields=*&f=geojson`;
}

export const ADSB_URL = "https://api.adsb.lol/v2/point/18.5316/73.8603/60";
export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
