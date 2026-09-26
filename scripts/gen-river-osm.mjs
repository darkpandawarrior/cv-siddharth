#!/usr/bin/env node
// Manual generator, never run by the build (G13). `npm run gen:river`.
//
// POSTs the Overpass query for the real Mula/Mutha rivers to a fixed mirror
// list, one mirror at a time, 10 s apart, and bakes the committed snapshot
// src/data/osm/mutha.json (open-data-spec.md §3 A3). On total mirror failure
// it leaves the committed file untouched, prints "kept committed snapshot"
// and exits 0 -- the build must never block on a flaky third party.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEFAULT_OUT = join(ROOT, "src/data/osm/mutha.json");

export const QUERY =
  '[out:json][timeout:60];way["waterway"="river"]["name"~"Mula|Mutha",i](18.40,73.60,18.65,74.05);out geom;';

export const DEFAULT_MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// world-v2's drawn river axis extent (valley.ts, not owned by this lane) --
// pinned as a constant here so `scale` (world m per real m) is self-contained.
const BASIN_CHORD_M = 620;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromMirrors(mirrors, backoffMs) {
  for (let i = 0; i < mirrors.length; i++) {
    if (i > 0) await sleep(backoffMs);
    try {
      const res = await fetch(mirrors[i], {
        method: "POST",
        body: `data=${encodeURIComponent(QUERY)}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }
  return null;
}

// ---- geometry ----

const R_EARTH = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const EPS_DEG = 1e-6;

function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

function bearingDeg(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const samePoint = (a, b) => Math.abs(a.lat - b.lat) < EPS_DEG && Math.abs(a.lon - b.lon) < EPS_DEG;

// Joins way geometries that share an endpoint into one ordered polyline.
// OSM `out geom` gives ways in query order, not path order, and either
// direction, so this chases shared endpoints rather than assuming order.
export function chainSegments(segments) {
  const remaining = segments.map((s) => s.slice());
  let chain = remaining.shift();
  while (remaining.length) {
    const chainStart = chain[0];
    const chainEnd = chain[chain.length - 1];
    let joined = false;
    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const segStart = seg[0];
      const segEnd = seg[seg.length - 1];
      if (samePoint(chainEnd, segStart)) {
        chain = chain.concat(seg.slice(1));
      } else if (samePoint(chainEnd, segEnd)) {
        chain = chain.concat(seg.slice().reverse().slice(1));
      } else if (samePoint(chainStart, segEnd)) {
        chain = seg.slice(0, -1).concat(chain);
      } else if (samePoint(chainStart, segStart)) {
        chain = seg.slice().reverse().slice(0, -1).concat(chain);
      } else {
        continue;
      }
      joined = true;
      remaining.splice(i, 1);
      break;
    }
    if (!joined) break; // disjoint segment -- shouldn't happen for real river data
  }
  return chain;
}

function toEastNorth(pt, origin) {
  const north = toRad(pt.lat - origin.lat) * R_EARTH;
  const east = toRad(pt.lon - origin.lon) * R_EARTH * Math.cos(toRad(origin.lat));
  return [east, north];
}

function perpendicularDistance(pt, a, b) {
  const [x, y] = pt;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
}

// Douglas-Peucker on 2D points (meters), epsilon in meters.
export function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

// Least-squares quadratic fit y = a*x^2 + b*x + c.
function fitQuadratic(xs, ys) {
  const n = xs.length;
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i];
    const x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
    t0 += y; t1 += x * y; t2 += x2 * y;
  }
  // solve the 3x3 normal-equations system [s4 s3 s2 | t2; s3 s2 s1 | t1; s2 s1 s0 | t0]
  const M = [
    [s4, s3, s2, t2],
    [s3, s2, s1, t1],
    [s2, s1, s0, t0],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) continue;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
    }
  }
  const a = M[0][3] / (M[0][0] || 1);
  const b = M[1][3] / (M[1][1] || 1);
  const c = M[2][3] / (M[2][2] || 1);
  return { a, b, c };
}

function walkToDistance(chain, targetM) {
  let acc = 0;
  for (let i = 1; i < chain.length; i++) {
    const segLen = haversineM(chain[i - 1], chain[i]);
    if (acc + segLen >= targetM) {
      const t = segLen === 0 ? 0 : (targetM - acc) / segLen;
      return {
        lat: chain[i - 1].lat + t * (chain[i].lat - chain[i - 1].lat),
        lon: chain[i - 1].lon + t * (chain[i].lon - chain[i - 1].lon),
      };
    }
    acc += segLen;
  }
  return chain[chain.length - 1];
}

export function buildMuthaJson(overpassData) {
  const elements = (overpassData.elements || []).filter(
    (e) => e.type === "way" && e.tags?.waterway === "river" && /Mula|Mutha/i.test(e.tags?.name || ""),
  );
  const ways = [...new Set(elements.map((e) => e.id))].sort((a, b) => a - b);

  const muthaSegs = elements.filter((e) => /^Mutha$/i.test(e.tags.name)).map((e) => e.geometry);
  const outflowEl = elements.find((e) => /Mula-Mutha|Mutha-Mula/i.test(e.tags.name));
  if (!muthaSegs.length || !outflowEl) {
    throw new Error("Overpass response is missing the Mutha or Mula-Mutha ways");
  }

  let muthaChain = chainSegments(muthaSegs);
  let outflowChain = chainSegments([outflowEl.geometry]);

  // orient the Mutha chain so it ends at the confluence (the outflow way's start)
  const nearEnd = haversineM(muthaChain[muthaChain.length - 1], outflowChain[0]);
  const nearStart = haversineM(muthaChain[0], outflowChain[0]);
  if (nearStart < nearEnd) muthaChain = muthaChain.slice().reverse();

  const confluence = { lat: outflowChain[0].lat, lon: outflowChain[0].lon };
  // snap the chain's last vertex onto the confluence node exactly
  muthaChain = muthaChain.slice(0, -1).concat([confluence]);

  const upstreamStart = muthaChain[0];
  const chordBearingDeg = bearingDeg(upstreamStart, confluence);
  const chordM = haversineM(upstreamStart, confluence);
  const chordKm = chordM / 1000;

  let muthaLengthM = 0;
  for (let i = 1; i < muthaChain.length; i++) muthaLengthM += haversineM(muthaChain[i - 1], muthaChain[i]);
  const muthaLengthKm = muthaLengthM / 1000;
  const sinuosity = muthaLengthKm / chordKm;

  // orient the outflow chain to start at the confluence
  if (haversineM(outflowChain[outflowChain.length - 1], confluence) < haversineM(outflowChain[0], confluence)) {
    outflowChain = outflowChain.slice().reverse();
  }
  const outflowTarget = walkToDistance(outflowChain, 2000);
  const outflowBearingDeg = bearingDeg(confluence, outflowTarget);

  // project the Mutha chain onto its chord, in local ENU meters
  const p0EN = toEastNorth(upstreamStart, confluence); // confluence is the origin
  const downstream = [-p0EN[0] / chordM, -p0EN[1] / chordM];
  const perp = [downstream[1], -downstream[0]];

  const raw = muthaChain.map((pt) => {
    const [e, n] = toEastNorth(pt, confluence);
    const vx = e - p0EN[0];
    const vy = n - p0EN[1];
    const along = vx * downstream[0] + vy * downstream[1];
    const lateral = vx * perp[0] + vy * perp[1];
    return { s: along / chordM, lateral };
  });

  const { a, b, c } = fitQuadratic(raw.map((r) => r.s), raw.map((r) => r.lateral));
  const detrended = raw.map((r) => r.lateral - (a * r.s * r.s + b * r.s + c));
  const first = detrended[0];
  const last = detrended[detrended.length - 1];
  const pinned = raw.map((r, i) => detrended[i] - (first + r.s * (last - first)));

  const dpInput = raw.map((r, i) => [r.s * chordM, pinned[i]]);
  const simplified = douglasPeucker(dpInput, 25);
  const bends = simplified.map(([sM, lateral]) => [
    Number((sM / chordM).toFixed(5)),
    Number(lateral.toFixed(1)),
  ]);
  // the detrend pins both ends to 0; DP always keeps the endpoints
  bends[0][1] = 0;
  bends[bends.length - 1][1] = 0;

  const scale = Number((BASIN_CHORD_M / chordM).toFixed(5));

  return {
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    osmBase: overpassData.osm3s?.timestamp_osm_base ?? null,
    ways,
    confluence: { lat: confluence.lat, lon: confluence.lon },
    chordBearingDeg: Number(chordBearingDeg.toFixed(1)),
    outflowBearingDeg: Number(outflowBearingDeg.toFixed(1)),
    muthaLengthKm: Number(muthaLengthKm.toFixed(2)),
    chordKm: Number(chordKm.toFixed(2)),
    sinuosity: Number(sinuosity.toFixed(3)),
    scale,
    bends,
  };
}

function parseArgs(argv) {
  const args = { mirrors: DEFAULT_MIRRORS, backoffMs: 10_000, fixture: null, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fixture") args.fixture = argv[++i];
    else if (argv[i] === "--mirrors") args.mirrors = argv[++i].split(",").filter(Boolean);
    else if (argv[i] === "--backoff-ms") args.backoffMs = Number(argv[++i]);
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let data;
  if (args.fixture) {
    data = JSON.parse(readFileSync(args.fixture, "utf8"));
  } else {
    data = await fetchFromMirrors(args.mirrors, args.backoffMs);
    if (!data) {
      console.log("kept committed snapshot");
      process.exit(0);
      return;
    }
  }
  const result = buildMuthaJson(data);
  writeFileSync(args.out, JSON.stringify(result, null, 2) + "\n");
  console.log(`wrote ${args.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
