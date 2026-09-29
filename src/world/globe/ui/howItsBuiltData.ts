// LANE V7 (wave 7, "How it's built" panel, Cesium Sandcastle pattern): the
// single source HowItsBuilt.tsx renders from. Every shader string below is
// the literal exported constant a layer compiles (imported, never retyped),
// so drift is structurally impossible; every provenance endpoint/licence
// below is the literal exported constant or builder function the same layer
// calls to fetch, for the same reason (howItsBuiltData.test.ts proves both).
//
// The hazard and space-weather feeds are cited through layers/feedUrls.ts,
// the constants HazardLayer.tsx itself fetches (lane V5 moved them there for
// this panel). CelesTrak is the one feed still left out: its URL lives as a
// private const inside api/_lib/tle-handler.ts, a server file, and
// hand-copying it here would be exactly the drift this panel exists to
// prevent.
import { GLOBE_RADIUS } from "../geoMath.ts";
import { VERT, ATMO_FRAG, OCEAN_FRAG } from "../layers/sun.ts";
import { CLOUD_FRAG } from "../layers/cloudShader.ts";
import { EARTH_IMAGERY_FRAG, INNER_HAZE_FRAG } from "../layers/earthImageryShader.ts";
import { GIBS_CATALOG, tileUrl } from "../layers/gibsCatalog.ts";
import { dayImageryAttempts, gapFillUrl, reliefUrl, nightLightsUrl, seaIceAttempts, describeImagerySource, type GibsSize } from "../layers/gibs.ts";
import { LIBERTY_STYLE_URL, PANORAMAX_SEARCH_ENDPOINT } from "../streetPhotos.ts";
import { mapsExport } from "../../../data/generated/mapsPlaces.ts";
import { QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL, LAUNCHES_URL, NHC_CONE_LAYER_IDS, nhcConeUrl } from "../layers/feedUrls.ts";

export interface ShaderSource {
  name: string;
  code: string;
}

export interface Provenance {
  label: string;
  endpoint: string;
  fetchedAt?: string;
  licence: string;
}

export interface HowItsBuiltEntry {
  id: string;
  title: string;
  shaders: ShaderSource[];
  provenance: Provenance[];
}

// The same 2048x1024 request size EarthImagery.tsx's own T2/T3 texture load
// uses (its T1 hi-res upgrade is 4096x2048) -- close enough for an honest
// illustrative endpoint; the exact pixel size never changes the URL's host,
// path or TIME segment, which is what the test below actually checks.
const SIZE: GibsSize = { width: 2048, height: 1024 };

function gibsProvenance(id: string, now: Date): Provenance {
  const entry = GIBS_CATALOG[id];
  return { label: entry.title, endpoint: tileUrl(entry, 0, 0, 0, now), licence: entry.attribution };
}

/** `now` defaults live so the panel always shows today's real GIBS date
 *  segment; the test below freezes it to prove the SAME functions produce
 *  the SAME strings, not to pin one date forever. */
export function buildHowItsBuiltEntries(now: Date = new Date()): HowItsBuiltEntry[] {
  const day = dayImageryAttempts(now, SIZE)[0];
  const ice = seaIceAttempts(now, SIZE)[0];
  const src = describeImagerySource(now);

  return [
    {
      id: "keyless-ocean-volcano-sun",
      title: "Ocean observations, weekly volcanic reports and solar disc",
      shaders: [],
      provenance: [
        { label: "NOAA NDBC latest observations (sampled 200 stations maximum, 10 min cache)", endpoint: "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt", licence: "NOAA NWS public domain; https://www.weather.gov/disclaimer" },
        { label: "Smithsonian GVP / USGS weekly report (6 hour cache, report week shown)", endpoint: "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml", licence: "US government employee product; https://volcano.si.edu/gvp_termsofuse.cfm" },
        { label: "Helioviewer / NASA SDO AIA 171 (256 px PNG, 30 min cache)", endpoint: "https://api.helioviewer.org/v2/takeScreenshot/", licence: "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams; https://sdo.gsfc.nasa.gov/data/rules.php" },
      ],
    },
    {
      id: "earth-imagery",
      title: `Earth imagery (photoreal earth style, radius ${GLOBE_RADIUS} world units = 6,371 km)`,
      shaders: [
        { name: "vertex (shared with every earth style)", code: VERT },
        { name: "fragment", code: EARTH_IMAGERY_FRAG },
      ],
      provenance: [
        { label: "Day imagery", endpoint: day.url, fetchedAt: src.date, licence: "NASA GIBS / VIIRS SNPP Corrected Reflectance, US government, public domain" },
        { label: "Gap fill (swath holes, polar night)", endpoint: gapFillUrl(SIZE), licence: "NASA GIBS / Blue Marble Next Generation, public domain" },
        { label: "Relief (land hillshade)", endpoint: reliefUrl(SIZE), licence: "NASA GIBS / ASTER GDEM, public domain" },
        { label: "Night lights (city glow)", endpoint: nightLightsUrl(SIZE), licence: "NASA GIBS / VIIRS Black Marble, public domain" },
        { label: "Sea ice (polar no-data fill)", endpoint: ice.url, fetchedAt: ice.detail, licence: "NASA GIBS / GHRSST L4 MUR, public domain" },
      ],
    },
    {
      id: "clouds",
      title: "Cloud shell",
      shaders: [{ name: "fragment", code: CLOUD_FRAG }],
      provenance: [{ label: "Cloud mask, cut from the same day-imagery texture above", endpoint: day.url, fetchedAt: src.date, licence: "NASA GIBS / VIIRS SNPP Corrected Reflectance, public domain" }],
    },
    {
      id: "ocean",
      title: "Ocean (dot-matrix earth style)",
      shaders: [{ name: "fragment", code: OCEAN_FRAG }],
      provenance: [],
    },
    {
      id: "atmosphere",
      title: "Atmosphere: twilight limb + inner haze",
      shaders: [
        { name: "fragment (outer shell, Rayleigh limb reddening)", code: ATMO_FRAG },
        { name: "fragment (inner haze)", code: INNER_HAZE_FRAG },
      ],
      provenance: [
        {
          label: "Rayleigh scattering coefficients (reference constants, no code taken)",
          endpoint: "https://github.com/ebruneton/precomputed_atmospheric_scattering",
          licence: "BSD-3-Clause",
        },
      ],
    },
    {
      id: "hazards",
      title: "Earth events and space weather (live feeds, fetched in the browser)",
      shaders: [],
      provenance: [
        { label: "Earthquakes, last 24 hours", endpoint: QUAKES_URL, licence: "USGS, US government, public domain" },
        { label: "Natural events (fires, storms, volcanoes)", endpoint: EONET_URL, licence: "NASA EONET, US government, public domain" },
        { label: "Disaster alerts", endpoint: GDACS_URL, licence: "GDACS (UN and European Commission), shown with attribution under its terms" },
        { label: "Aurora oval", endpoint: OVATION_URL, licence: "NOAA SWPC OVATION, US government, public domain" },
        { label: "Planetary Kp index", endpoint: KP_URL, licence: "NOAA SWPC, US government, public domain" },
        { label: "Upcoming launches", endpoint: LAUNCHES_URL, licence: "The Space Devs Launch Library 2, free tier (15 requests an hour), with attribution" },
        { label: `Hurricane forecast cones (${NHC_CONE_LAYER_IDS.length} NHC slots, one query each)`, endpoint: nhcConeUrl(NHC_CONE_LAYER_IDS[0]), licence: "NOAA National Hurricane Center, US government, public domain" },
      ],
    },
    {
      id: "deep-zoom-base",
      title: "Deep-zoom base (maximum zoom)",
      shaders: [],
      provenance: [gibsProvenance("s2cloudless", now)],
    },
    {
      id: "street-level",
      title: "Street level (My Maps places' street-level entry point)",
      shaders: [],
      provenance: [
        { label: "Basemap tiles", endpoint: LIBERTY_STYLE_URL, licence: "OpenFreeMap / OpenStreetMap contributors, ODbL" },
        { label: "Street-level photos", endpoint: PANORAMAX_SEARCH_ENDPOINT, licence: "Panoramax, CC BY-SA" },
      ],
    },
    {
      id: "guide-places",
      title: "My Maps places (Local Guide contributions)",
      shaders: [],
      provenance: [
        {
          label: "Places, reviews, photos",
          endpoint: "local snapshot, no live endpoint (a data build step, not a browser fetch)",
          fetchedAt: mapsExport,
          licence: "Google Maps Takeout, owner export, city level, years only",
        },
      ],
    },
  ];
}
