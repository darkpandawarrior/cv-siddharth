/**
 * Ground truth for the Signal Lab: a real 17.6 km driving loop through central
 * Pune — Deccan Gymkhana → Shivajinagar → Pune Station → Camp → Swargate and
 * back — snapped to actual roads by OSRM, simplified with Douglas–Peucker
 * (186 points, 17,564 m vs the router's 17,548 m: 0.09% off) and baked in as a
 * constant.
 *
 * Baked, not fetched: the lab has no runtime and no build-time network
 * dependency, and the route can never change under a visitor mid-session.
 * The provenance is a one-off authoring fetch, recorded here so it is
 * reproducible:
 *
 *   https://router.project-osrm.org/route/v1/driving/
 *     73.8384,18.5158;73.8478,18.5308;73.8620,18.5314;73.8743,18.5286;
 *     73.8790,18.5150;73.8700,18.5010;73.8580,18.5011;73.8450,18.5060;
 *     73.8384,18.5158
 *     ?overview=full&geometries=geojson&continue_straight=true
 *
 * FUTURE: promote this to a generated artefact — a `scripts/gen-route.mjs`
 * that re-runs the query above and rewrites this file, the way gen-galleries
 * and gen-system-prompt already work. That buys a refreshable route (and
 * multiple cities) at the cost of a build-time network call, which is why it
 * is deliberately not the starting point.
 *
 * Every coordinate below is [lat, lng]. The loop is closed: last === first.
 */

/** The route, as [lat, lng] pairs. Closed loop. */
export const ROUTE: readonly (readonly [number, number])[] = [
  [18.51578,73.8384], [18.51564,73.83917], [18.51604,73.83926], [18.51598,73.8399],
  [18.51569,73.84188], [18.51574,73.84202], [18.51757,73.84159], [18.51991,73.84119],
  [18.52187,73.84094], [18.52256,73.84091], [18.52287,73.84094], [18.52483,73.8414],
  [18.52622,73.84182], [18.52819,73.84287], [18.52831,73.84298], [18.53128,73.84459],
  [18.53137,73.8446], [18.53155,73.84479], [18.5309,73.8473], [18.53082,73.84743],
  [18.53025,73.84979], [18.5298,73.85129], [18.52983,73.85141], [18.52951,73.85255],
  [18.52948,73.85282], [18.52951,73.85301], [18.52973,73.85339], [18.53015,73.85384],
  [18.53025,73.85418], [18.5303,73.85501], [18.53027,73.8551], [18.53035,73.85534],
  [18.53026,73.85543], [18.52987,73.8572], [18.52963,73.85791], [18.52955,73.8583],
  [18.52953,73.85847], [18.52956,73.85876], [18.52973,73.85946], [18.52975,73.85971],
  [18.52972,73.8617], [18.52978,73.86237], [18.5309,73.86226], [18.52978,73.86237],
  [18.52979,73.86309], [18.52985,73.86331], [18.52854,73.86339], [18.52795,73.86346],
  [18.52775,73.86356], [18.5274,73.86402], [18.52558,73.86748], [18.52602,73.86838],
  [18.52793,73.87292], [18.52809,73.87322], [18.52833,73.87357], [18.52837,73.8737],
  [18.52848,73.87383], [18.52859,73.8742], [18.52865,73.87497], [18.52804,73.87561],
  [18.52817,73.87631], [18.52498,73.87675], [18.52488,73.87683], [18.52479,73.87682],
  [18.52473,73.87676], [18.52443,73.87672], [18.52337,73.87638], [18.52249,73.87625],
  [18.52228,73.87623], [18.52221,73.87625], [18.52214,73.87621], [18.52213,73.87613],
  [18.51962,73.87544], [18.51834,73.87965], [18.51718,73.87959], [18.51685,73.8796],
  [18.51593,73.87966], [18.51367,73.87988], [18.51362,73.87969], [18.51359,73.87935],
  [18.5136,73.8788], [18.51596,73.87883], [18.51593,73.87966], [18.51367,73.87988],
  [18.51343,73.87995], [18.51068,73.88016], [18.51052,73.88015], [18.50789,73.87946],
  [18.50735,73.87933], [18.50701,73.87932], [18.50672,73.88073], [18.50656,73.8817],
  [18.50494,73.88229], [18.50449,73.88137], [18.50421,73.8809], [18.50377,73.88031],
  [18.50303,73.87942], [18.50276,73.87858], [18.50268,73.87812], [18.50223,73.87621],
  [18.50218,73.87612], [18.50188,73.87477], [18.50184,73.87321], [18.50176,73.87255],
  [18.50171,73.87122], [18.50169,73.87092], [18.50155,73.87015], [18.49988,73.87023],
  [18.49987,73.86983], [18.49988,73.87023], [18.50155,73.87015], [18.50126,73.86884],
  [18.5011,73.86831], [18.50059,73.86706], [18.50036,73.8664], [18.50007,73.86579],
  [18.49989,73.86493], [18.49983,73.86432], [18.49986,73.86342], [18.50005,73.86195],
  [18.50021,73.8611], [18.50036,73.85983], [18.50046,73.85843], [18.50056,73.85844],
  [18.50066,73.85821], [18.50069,73.85802], [18.5015,73.8572], [18.50087,73.85705],
  [18.50105,73.85615], [18.50106,73.85584], [18.50131,73.85465], [18.50128,73.85425],
  [18.50134,73.85407], [18.50093,73.85401], [18.50016,73.854], [18.49968,73.8539],
  [18.49909,73.85211], [18.49898,73.85157], [18.49897,73.85139], [18.49902,73.85112],
  [18.49915,73.85091], [18.4996,73.85036], [18.50022,73.84946], [18.5007,73.84869],
  [18.50116,73.84702], [18.50117,73.84668], [18.50115,73.84583], [18.50114,73.84568],
  [18.50109,73.84557], [18.50319,73.84523], [18.50325,73.84525], [18.504,73.84515],
  [18.50446,73.84503], [18.50545,73.84471], [18.5056,73.84525], [18.50632,73.84504],
  [18.50625,73.84461], [18.50549,73.84481], [18.50545,73.84471], [18.50825,73.84398],
  [18.50921,73.84361], [18.50954,73.84353], [18.51009,73.84332], [18.51056,73.84319],
  [18.51124,73.84316], [18.51137,73.84318], [18.51156,73.84327], [18.51196,73.8436],
  [18.51228,73.84376], [18.5126,73.84378], [18.51272,73.84374], [18.51295,73.8435],
  [18.51427,73.84246], [18.51434,73.8423], [18.51433,73.84219], [18.51377,73.84158],
  [18.51385,73.8415], [18.514,73.8406], [18.51417,73.83858], [18.5141,73.83821],
  [18.5145,73.83814], [18.51494,73.83811], [18.51533,73.83814], [18.51557,73.83818],
  [18.51579,73.83834], [18.51578,73.8384],
];

export type LatLng = readonly [number, number];

const EARTH_R = 6371008.8; // IUGG mean radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. The only distance function in the lab —
 *  every number the UI shows is a sum of these, never a fudge factor. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ── Local ENU frame ──────────────────────────────────────────────────────
 * The filter needs to add, scale and difference positions; doing that in
 * degrees is wrong (a degree of longitude is not a degree of latitude, and
 * neither is a metre). So the engine works in a local east/north metre frame
 * centred on the route, and only converts back to lat/lng for drawing.
 * Equirectangular is exact enough here: the route spans ~4 km, where the
 * projection's error against the ellipsoid is well under a metre. */

export const ORIGIN: LatLng = ROUTE[0];
const COS_LAT = Math.cos(rad(ORIGIN[0]));

export interface XY { x: number; y: number }

/** lat/lng → metres east/north of ORIGIN. */
export function toXY(p: LatLng): XY {
  return { x: rad(p[1] - ORIGIN[1]) * EARTH_R * COS_LAT, y: rad(p[0] - ORIGIN[0]) * EARTH_R };
}

/** metres east/north of ORIGIN → lat/lng. */
export function toLatLng(p: XY): LatLng {
  return [
    ORIGIN[0] + (p.y / EARTH_R) * (180 / Math.PI),
    ORIGIN[1] + (p.x / (EARTH_R * COS_LAT)) * (180 / Math.PI),
  ];
}

export const distXY = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

/** Cumulative distance along the route, and its total length. */
export const CUMULATIVE: readonly number[] = (() => {
  const out = [0];
  for (let i = 1; i < ROUTE.length; i++) out.push(out[i - 1] + haversine(ROUTE[i - 1], ROUTE[i]));
  return out;
})();

export const ROUTE_LENGTH_M = CUMULATIVE[CUMULATIVE.length - 1];

/** Position at `metres` along the route, interpolated between vertices. */
export function pointAtDistance(metres: number): LatLng {
  const total = ROUTE_LENGTH_M;
  let d = metres % total;
  if (d < 0) d += total;
  // binary search the cumulative table
  let lo = 0;
  let hi = CUMULATIVE.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (CUMULATIVE[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = CUMULATIVE[hi] - CUMULATIVE[lo];
  const t = seg > 0 ? (d - CUMULATIVE[lo]) / seg : 0;
  return [
    ROUTE[lo][0] + (ROUTE[hi][0] - ROUTE[lo][0]) * t,
    ROUTE[lo][1] + (ROUTE[hi][1] - ROUTE[lo][1]) * t,
  ];
}

/* ── Zones ────────────────────────────────────────────────────────────────
 * Five contiguous stretches of the loop, each modelling one documented way
 * GPS lies. `from`/`to` are fractions of route length, so the zones follow
 * real geography: the canyon is the dense Shivajinagar–Station stretch, the
 * ramp is the fast Camp–Swargate run.
 *
 * `sigmaM` is the 1σ scatter of a clean fix; `accuracyM` is what the chipset
 * REPORTS. They differ on purpose — a receiver in a canyon is confidently
 * wrong, which is exactly why an accuracy gate alone cannot save you. */
export type ZoneId = "open" | "canyon" | "tunnel" | "ramp" | "parking";

export interface Zone {
  id: ZoneId;
  label: string;
  color: string;
  from: number;
  to: number;
  speedMps: number;
  sigmaM: number;
  accuracyM: number;
  dropoutChance: number;
  spikeChance: number;
}

// ponytail: five arbitrary hexes, not the site's two-channel amber/cyan
// system — a deliberate local exception, same footing as index.css's
// --lab-gold. Five zones model five physically distinct, simultaneously-
// visible GPS failure modes on one legend; collapsing them onto two hues via
// opacity would make adjacent zones (e.g. canyon vs. parking, both "GPS
// confidently wrong") indistinguishable at a glance, which is worse than an
// off-token palette for a legend whose whole job is telling zones apart.
export const ZONES: readonly Zone[] = [
  { id: "open",    label: "OPEN ROAD",         color: "#8ff0b4", from: 0,    to: 0.28, speedMps: 14, sigmaM: 4,  accuracyM: 5,  dropoutChance: 0,    spikeChance: 0    },
  { id: "canyon",  label: "URBAN CANYON",      color: "#f0883e", from: 0.28, to: 0.52, speedMps: 9,  sigmaM: 13, accuracyM: 9,  dropoutChance: 0,    spikeChance: 0.30 },
  { id: "tunnel",  label: "TUNNEL",            color: "#5ee6ff", from: 0.52, to: 0.60, speedMps: 14, sigmaM: 4,  accuracyM: 6,  dropoutChance: 1,    spikeChance: 0    },
  { id: "ramp",    label: "HIGHWAY ON-RAMP",   color: "#db61ff", from: 0.60, to: 0.94, speedMps: 20, sigmaM: 5,  accuracyM: 6,  dropoutChance: 0,    spikeChance: 0.05 },
  { id: "parking", label: "PARKING STRUCTURE", color: "#ff5c5c", from: 0.94, to: 1,    speedMps: 5,  sigmaM: 12, accuracyM: 18, dropoutChance: 0.35, spikeChance: 0.15 },
];

export function zoneAtFraction(f: number): Zone {
  const ff = ((f % 1) + 1) % 1;
  for (const z of ZONES) if (ff < z.to) return z;
  return ZONES[ZONES.length - 1];
}
