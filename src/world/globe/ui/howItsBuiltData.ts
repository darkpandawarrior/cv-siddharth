// LANE V7 (wave 7, "How it's built" panel, Cesium Sandcastle pattern): the
// single source HowItsBuilt.tsx renders from. Every shader string below is
// the literal exported constant a layer compiles (imported, never retyped),
// so drift is structurally impossible; every provenance endpoint/licence
// below is the literal exported constant or builder function the same layer
// calls to fetch, for the same reason (howItsBuiltData.test.ts proves both).
//
// Layers this lane could NOT wire honestly: USGS quakes, EONET, GDACS, SWPC
// space weather and Launch Library all build their fetch URL as a private
// (non-exported) `const` inside HazardLayer.tsx, and CelesTrak's lives the
// same way inside api/_lib/tle-handler.ts — neither file is this lane's to
// edit (ownership is new files plus Inspector.tsx only). Hand-copying those
// URLs as string literals here would be exactly the drift risk this panel
// exists to prevent, so they are left out rather than faked. See this
// lane's report, "needs from integration".
import { GLOBE_RADIUS } from "../geoMath.ts";
import { VERT, ATMO_FRAG, OCEAN_FRAG } from "../layers/sun.ts";
import { CLOUD_FRAG } from "../layers/cloudShader.ts";
import { EARTH_IMAGERY_FRAG, INNER_HAZE_FRAG } from "../layers/earthImageryShader.ts";
import { GIBS_CATALOG, tileUrl } from "../layers/gibsCatalog.ts";
import { dayImageryAttempts, gapFillUrl, reliefUrl, nightLightsUrl, seaIceAttempts, describeImagerySource, type GibsSize } from "../layers/gibs.ts";
import { LIBERTY_STYLE_URL, PANORAMAX_SEARCH_ENDPOINT } from "../streetPhotos.ts";
import { mapsExport } from "../../../data/generated/mapsPlaces.ts";

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
