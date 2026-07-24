import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCanvasLoop } from "./useCanvasLoop.ts";

/**
 * The Signal Lab — the "50% → 95%" claim, running live, twice: this is the
 * production location engine from Dice.tech, rebuilt from scratch as
 * Mileway's location engine. A vehicle drives a five-zone route — open road,
 * urban canyon, tunnel, highway on-ramp, parking structure — each modeling a
 * documented real-world way GPS lies. Four pipeline stages (jitter
 * suppression, spike rejection, IMU fusion, device-tier sampling) are
 * independently toggleable, and a four-bucket distance accumulator —
 * confirmed / reckoned / rejected against ground truth — scores the trip
 * live. Reduced motion gets a single pre-run frame.
 *
 * Runs over a real Leaflet + CARTO dark-tiles basemap (raster <img> tiles,
 * no WebGL, no Web Worker) anchored on Pune, India — Siddharth's real
 * location per profile.ts. An earlier pass tried MapLibre GL JS (vector,
 * WebGL, Worker-based); its worker silently never acknowledged the main
 * thread's setup messages in production despite loading correctly (no
 * error, no tile ever requested) — a WebKit/bundled-worker interaction we
 * couldn't pin down in the time available. Leaflet has no such moving part:
 * tiles are plain images, so this can't hit the same failure mode. The map
 * is non-interactive (no pan/zoom) — the route drawn on the canvas above it
 * is a decorative path, not georeferenced to real streets.
 */

type V = { x: number; y: number };
type Tier = "flagship" | "budget";

const MAP_CENTER: [number, number] = [18.5204, 73.8567]; // Pune, India (lat, lng)
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://carto.com/attributions">CARTO</a>';

// A winding waypoint route (city-block turns, not a smooth ellipse) so the
// simulation reads as a real journey. Normalized to the canvas box; each
// zone below claims a contiguous arc of these points. Catmull-Rom
// interpolation (see trackAt) gives it road-like curved turns.
const WAYPOINTS: [number, number][] = [
  [0.12, 0.28],
  [0.42, 0.2],
  [0.68, 0.28],
  [0.82, 0.42],
  [0.88, 0.58],
  [0.78, 0.7],
  [0.7, 0.82],
  [0.6, 0.9],
  [0.4, 0.92],
  [0.2, 0.86],
  [0.1, 0.68],
  [0.08, 0.5],
  [0.14, 0.38],
];

type Zone = {
  id: string;
  label: string;
  color: string;
  tSpan: number; // fraction of the loop this zone occupies (sums to 1 across all zones)
  durationSec: number; // wall-clock dwell time per lap — short + a big tSpan = high effective speed
  dropoutChance: number; // probability a given GPS tick produces no fix at all
  spikeChance: number; // probability an arriving fix is a multipath spike
  noiseMul: number; // gaussian scatter multiplier for a clean (non-spike) fix
  confirmFidelity: number; // fraction of this tick's true distance credited when a fix is cleanly accepted
  reckonFidelity: number; // fraction credited when IMU fusion coasts through a gap
};

// Five zones in sequence, each modeling one documented failure mode of the
// real engine ("Field users' trip distances were off by large margins from
// urban canyons, tunnels, and OEM-throttled location updates" — the
// gps-accuracy case study). tSpan sums to exactly 1.0.
const ZONES: Zone[] = [
  { id: "open", label: "OPEN ROAD", color: "#8ff0b4", tSpan: 0.2, durationSec: 9, dropoutChance: 0, spikeChance: 0, noiseMul: 1.0, confirmFidelity: 0.99, reckonFidelity: 0.9 },
  { id: "canyon", label: "URBAN CANYON", color: "#f0883e", tSpan: 0.2, durationSec: 8, dropoutChance: 0, spikeChance: 0.42, noiseMul: 1.8, confirmFidelity: 0.97, reckonFidelity: 0.92 },
  { id: "tunnel", label: "TUNNEL", color: "#5ee6ff", tSpan: 0.16, durationSec: 5, dropoutChance: 1.0, spikeChance: 0, noiseMul: 1.0, confirmFidelity: 0.99, reckonFidelity: 0.92 },
  { id: "ramp", label: "HIGHWAY ON-RAMP", color: "#db61ff", tSpan: 0.2, durationSec: 4, dropoutChance: 0, spikeChance: 0.08, noiseMul: 1.0, confirmFidelity: 0.96, reckonFidelity: 0.92 },
  { id: "parking", label: "PARKING STRUCTURE", color: "#ff5c5c", tSpan: 0.24, durationSec: 16, dropoutChance: 0.5, spikeChance: 0.22, noiseMul: 1.4, confirmFidelity: 0.94, reckonFidelity: 0.85 },
];

const SAMPLE_MS_FLAGSHIP = 420;
const SAMPLE_MS_BUDGET = 900; // budget tier = sparser cadence
const LAP_METERS = 1200; // arbitrary trip length for the live odometer, not a claimed real distance
const BASE_NOISE_PX = 9;
const JITTER_OFF_PENALTY = 0.9; // extra fidelity hit on accepted fixes when jitter suppression is off
const BUDGET_CONFIRM_PENALTY = 0.9; // sparser sampling degrades confirmed fixes; reckoning is tier-insensitive
const SPIKE_ACCEPTED_FIDELITY = 0.12; // a spike blindly trusted (rejection off) barely represents real progress
const TRAIL = 60;

// Mulberry32 — deterministic noise so the lab tells the same story every visit.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Catmull-Rom spline through 4 control points — gives the route curved,
// road-like turns at each waypoint instead of sharp polyline corners.
function catmullRom(p0: V, p1: V, p2: V, p3: V, t: number): V {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
  };
}

// Ground truth: a winding waypoint route (city-block turns), parameterized by u ∈ [0,1).
function trackAt(u: number, w: number, h: number): V {
  const uu = ((u % 1) + 1) % 1;
  const n = WAYPOINTS.length;
  const scaled = uu * n;
  const i = Math.floor(scaled);
  const t = scaled - i;
  const at = (k: number) => {
    const p = WAYPOINTS[((k % n) + n) % n];
    return { x: p[0] * w, y: p[1] * h };
  };
  return catmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), t);
}

function zoneAt(u: number): Zone {
  const uu = ((u % 1) + 1) % 1;
  let acc = 0;
  for (const z of ZONES) {
    acc += z.tSpan;
    if (uu < acc) return z;
  }
  return ZONES[ZONES.length - 1];
}

const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);

type Stats = {
  confirmed: number;
  reckoned: number;
  rejected: number;
  truth: number;
  accuracy: number;
  avgRawErr: number;
  avgFilteredErr: number;
};

const ERROR_TRAIL = 80; // ring buffer length for the convergence sparkline, same TRAIL-style pattern as rawTrail/engineTrail

export function SignalLabPane() {
  const [jitter, setJitter] = useState(true);
  const [spikeRejection, setSpikeRejection] = useState(true);
  const [imuFusion, setImuFusion] = useState(true);
  const [tier, setTier] = useState<Tier>("flagship");
  const controlsRef = useRef({ jitter, spikeRejection, imuFusion, tier });
  controlsRef.current = { jitter, spikeRejection, imuFusion, tier };
  const [stats, setStats] = useState<Stats>({
    confirmed: 0,
    reckoned: 0,
    rejected: 0,
    truth: 0,
    accuracy: 0,
    avgRawErr: 0,
    avgFilteredErr: 0,
  });

  // Real, non-interactive Leaflet + CARTO dark-tiles basemap behind the
  // canvas — plain raster <img> tiles, no WebGL/Worker, so this can't hit
  // the failure mode that broke the earlier MapLibre attempt.
  const mapContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    const map = L.map(container, {
      center: MAP_CENTER,
      zoom: 14,
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: true,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: "abcd", maxZoom: 20 }).addTo(map);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, []);

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    const rand = rng(20260724);
    const gauss = () => (rand() + rand() + rand() - 1.5) * 2; // approx N(0,1)

    let u = 0; // loop phase
    let sinceSample = 0;
    let statsAcc = 0;
    let est: V | null = null;
    let vel: V = { x: 0, y: 0 };
    const rawTrail: { p: V; spike: boolean }[] = [];
    const engineTrail: { p: V; gap: boolean }[] = [];
    // Convergence sparkline ring buffer: raw-sample error vs filtered-estimate
    // error against ground truth, one entry per GPS tick that has both.
    const errorTrail: { raw: number; filtered: number }[] = [];

    let confirmed = 0;
    let reckoned = 0;
    let rejected = 0;
    let truth = 0;
    let lastCfg = { ...controlsRef.current };

    const resetBuckets = () => {
      confirmed = 0;
      reckoned = 0;
      rejected = 0;
      truth = 0;
      errorTrail.length = 0;
    };

    const updateStats = () => {
      const accuracy = truth > 0 ? Math.min(100, Math.round(((confirmed + reckoned) / truth) * 100)) : 0;
      const avgRawErr = errorTrail.length ? errorTrail.reduce((s, e) => s + e.raw, 0) / errorTrail.length : 0;
      const avgFilteredErr = errorTrail.length ? errorTrail.reduce((s, e) => s + e.filtered, 0) / errorTrail.length : 0;
      setStats({
        confirmed: Math.round(confirmed),
        reckoned: Math.round(reckoned),
        rejected: Math.round(rejected),
        truth: Math.round(truth),
        accuracy,
        avgRawErr: Math.round(avgRawErr),
        avgFilteredErr: Math.round(avgFilteredErr),
      });
    };

    const step = (dtMs: number) => {
      const dt = Math.min(dtMs, 64) / 1000;
      const cfg = controlsRef.current;
      if (cfg.jitter !== lastCfg.jitter || cfg.spikeRejection !== lastCfg.spikeRejection || cfg.imuFusion !== lastCfg.imuFusion || cfg.tier !== lastCfg.tier) {
        resetBuckets();
        sinceSample = 0;
        lastCfg = { ...cfg };
      }

      const zone = zoneAt(u);
      u = (u + (zone.tSpan / zone.durationSec) * dt) % 1;

      sinceSample += dtMs;
      const sampleMs = cfg.tier === "budget" ? SAMPLE_MS_BUDGET : SAMPLE_MS_FLAGSHIP;
      if (sinceSample >= sampleMs) {
        const dtSec = sampleMs / 1000;
        sinceSample -= sampleMs;

        const { width, height } = getSize();
        const truthPx = trackAt(u, width, height);
        const truthTick = ((zone.tSpan * LAP_METERS) / zone.durationSec) * dtSec;
        truth += truthTick;

        const isDropout = rand() < zone.dropoutChance;
        if (isDropout) {
          if (cfg.imuFusion && est) {
            est = { x: est.x + vel.x * dtSec, y: est.y + vel.y * dtSec };
            vel = { x: vel.x * 0.985, y: vel.y * 0.985 };
            reckoned += truthTick * zone.reckonFidelity;
            engineTrail.push({ p: { ...est }, gap: true });
            if (engineTrail.length > TRAIL) engineTrail.shift();
          }
        } else {
          const isSpike = rand() < zone.spikeChance;
          const noiseAmp = BASE_NOISE_PX * zone.noiseMul;
          let rawPx: V;
          if (isSpike) {
            const ang = rand() * Math.PI * 2;
            const throwPx = noiseAmp * (3.5 + rand() * 3.5);
            rawPx = { x: truthPx.x + Math.cos(ang) * throwPx, y: truthPx.y + Math.sin(ang) * throwPx };
          } else {
            rawPx = { x: truthPx.x + gauss() * noiseAmp, y: truthPx.y + gauss() * noiseAmp };
          }
          rawTrail.push({ p: rawPx, spike: isSpike });
          if (rawTrail.length > TRAIL) rawTrail.shift();

          const predicted = est ? { x: est.x + vel.x * dtSec, y: est.y + vel.y * dtSec } : rawPx;
          const velMag = Math.hypot(vel.x, vel.y);
          const maxJump = 50 + velMag * dtSec * 2.4 + 20;
          const rejectedFix = cfg.spikeRejection && est !== null && dist(rawPx, predicted) > maxJump;

          if (rejectedFix) {
            rejected += truthTick;
            if (cfg.imuFusion) {
              est = predicted;
              vel = { x: vel.x * 0.985, y: vel.y * 0.985 };
              reckoned += truthTick * zone.reckonFidelity;
            }
            if (est) {
              engineTrail.push({ p: { ...est }, gap: true });
              if (engineTrail.length > TRAIL) engineTrail.shift();
            }
          } else {
            const prevRaw = rawTrail[rawTrail.length - 2];
            const sample = cfg.jitter && prevRaw ? { x: (rawPx.x + prevRaw.p.x) / 2, y: (rawPx.y + prevRaw.p.y) / 2 } : rawPx;
            if (!est) {
              est = { ...sample };
            } else {
              const alpha = 0.42;
              const next = { x: est.x + (sample.x - est.x) * alpha, y: est.y + (sample.y - est.y) * alpha };
              vel = { x: (next.x - est.x) / dtSec, y: (next.y - est.y) / dtSec };
              est = next;
            }
            let fidelity = isSpike ? SPIKE_ACCEPTED_FIDELITY : zone.confirmFidelity;
            if (!cfg.jitter) fidelity *= JITTER_OFF_PENALTY;
            if (cfg.tier === "budget") fidelity *= BUDGET_CONFIRM_PENALTY;
            confirmed += truthTick * fidelity;
            engineTrail.push({ p: { ...est }, gap: false });
            if (engineTrail.length > TRAIL) engineTrail.shift();
          }

          // Both a raw sample and the engine's current estimate exist this
          // tick — record how far each sits from ground truth, for the
          // convergence sparkline.
          if (est) {
            errorTrail.push({ raw: dist(rawPx, truthPx), filtered: dist(est, truthPx) });
            if (errorTrail.length > ERROR_TRAIL) errorTrail.shift();
          }
        }
      }

      statsAcc += dtMs;
      if (statsAcc > 500) {
        statsAcc = 0;
        updateStats();
      }
    };

    const draw = () => {
      const { width, height } = getSize();
      ctx.clearRect(0, 0, width, height);

      // zone-colored track, sampled along the loop
      const STEPS = 240;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      let prevZone: Zone | null = null;
      for (let i = 0; i <= STEPS; i++) {
        const uu = i / STEPS;
        const z = zoneAt(uu);
        const p = trackAt(uu, width, height);
        if (z !== prevZone) {
          if (prevZone) ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.strokeStyle = `${z.color}55`;
          prevZone = z;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();

      // dashed centerline
      ctx.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const p = trackAt(i / STEPS, width, height);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "rgba(232, 239, 233, 0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // zone labels, placed radially outside the loop
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      const cx = width * 0.5;
      const cy = height * 0.52;
      let acc = 0;
      for (const z of ZONES) {
        const midU = acc + z.tSpan / 2;
        acc += z.tSpan;
        const p = trackAt(midU, width, height);
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const lx = p.x + (dx / len) * 18;
        const ly = p.y + (dy / len) * 18;
        ctx.textAlign = dx > 10 ? "left" : dx < -10 ? "right" : "center";
        ctx.textBaseline = dy > 10 ? "top" : dy < -10 ? "bottom" : "middle";
        ctx.fillStyle = `${z.color}bb`;
        ctx.fillText(z.label, lx, ly);
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      // raw GPS trail — a jagged connecting line, not just dots, so the
      // "noisy path" reads clearly at a glance against the smooth filtered
      // trail below it (that contrast IS the optimization story).
      if (rawTrail.length > 1) {
        ctx.beginPath();
        rawTrail.forEach((s, i) => (i === 0 ? ctx.moveTo(s.p.x, s.p.y) : ctx.lineTo(s.p.x, s.p.y)));
        ctx.strokeStyle = "rgba(240, 136, 62, 0.45)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      for (const s of rawTrail) {
        ctx.beginPath();
        ctx.arc(s.p.x, s.p.y, s.spike ? 3 : 1.6, 0, Math.PI * 2);
        ctx.fillStyle = s.spike ? "#ff5c5c" : "rgba(240, 136, 62, 0.7)";
        ctx.fill();
      }

      // engine trail (Mileway cyan — the location engine's own visualization)
      if (engineTrail.length > 1) {
        ctx.beginPath();
        engineTrail.forEach((s, i) => (i === 0 ? ctx.moveTo(s.p.x, s.p.y) : ctx.lineTo(s.p.x, s.p.y)));
        ctx.strokeStyle = "#5ee6ff";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(94, 230, 255, 0.55)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
        for (const s of engineTrail) {
          if (!s.gap) continue;
          ctx.beginPath();
          ctx.arc(s.p.x, s.p.y, 2.2, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(94, 230, 255, 0.85)";
          ctx.lineWidth = 1;
          ctx.stroke(); // hollow dots = no trustworthy fix — dead-reckoned or frozen
        }
      }

      // vehicle (ground truth)
      const v = trackAt(u, width, height);
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#e8efe9";
      ctx.fill();

      // convergence inset — raw vs filtered position error over time. Pixel-
      // space magnitudes from the same sim, not a claimed real-world unit.
      const ix = 10;
      const iy = 10;
      const iw = 130;
      const ih = 50;
      ctx.fillStyle = "rgba(5, 7, 10, 0.72)";
      ctx.fillRect(ix, iy, iw, ih);
      ctx.strokeStyle = "rgba(232, 239, 233, 0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

      ctx.font = '8px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = "rgba(232, 239, 233, 0.6)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("error — raw vs filtered (relative)", ix + 5, iy + 4);

      if (errorTrail.length > 1) {
        const plotLeft = ix + 5;
        const plotTop = iy + 16;
        const plotW = iw - 10;
        const plotH = ih - 20;
        let maxErr = 1;
        for (const e of errorTrail) maxErr = Math.max(maxErr, e.raw, e.filtered);
        const plotLine = (key: "raw" | "filtered", color: string) => {
          ctx.beginPath();
          errorTrail.forEach((e, i) => {
            const x = plotLeft + (i / (errorTrail.length - 1)) * plotW;
            const y = plotTop + plotH - (e[key] / maxErr) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.3;
          ctx.stroke();
        };
        plotLine("raw", "rgba(240, 136, 62, 0.9)");
        plotLine("filtered", "#5ee6ff");
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    };

    return { step, draw };
  });

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        At Dice.tech, field users' trip distances were off by large margins — urban canyons, tunnels and
        OEM-throttled location updates all lied to the GPS chip in different ways. The fix was predictive
        dead reckoning, and the same engine got rebuilt from scratch as Mileway's location engine: GPS
        treated as a noisy signal, with jitter suppression, spike detection, IMU (accelerometer) fusion and
        device-tier-adaptive sampling all feeding a four-bucket distance accumulator. Drive the route below —
        five zones, five ways GPS breaks — and flip each stage to watch the accuracy number move.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <div ref={mapContainerRef} className="signal-lab-map absolute inset-0" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 bg-void/35" />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-label="Live GPS journey simulation across five zones, over a map of Pune, India"
          />
          <style>{`
            .signal-lab-map .leaflet-control-attribution { font-size: 9px; opacity: 0.6; background: rgba(5,7,10,0.5); color: #a1a1aa; }
            .signal-lab-map .leaflet-control-attribution a { color: #d4d4d8; }
          `}</style>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={jitter} onChange={(e) => setJitter(e.target.checked)} className="accent-[#3ddc84]" />
            jitter suppression
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={spikeRejection} onChange={(e) => setSpikeRejection(e.target.checked)} className="accent-[#3ddc84]" />
            spike rejection
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={imuFusion} onChange={(e) => setImuFusion(e.target.checked)} className="accent-[#3ddc84]" />
            IMU fusion
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={tier === "budget"} onChange={(e) => setTier(e.target.checked ? "budget" : "flagship")} className="accent-[#3ddc84]" />
            device tier: {tier}
          </label>
          <span className="font-mono text-xs text-zinc-500">
            confirmed {stats.confirmed}m · reckoned {stats.reckoned}m · rejected {stats.rejected}m
          </span>
          <span className="font-mono text-xs text-accent">accuracy {stats.accuracy}%</span>
          <span className="font-mono text-xs text-zinc-500">
            avg error — raw {stats.avgRawErr} · filtered {stats.avgFilteredErr} (relative)
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-500">
            <a href="#work" onClick={() => window.scrollTo({ top: 0 })} className="transition hover:text-accent">
              the full story → Dice.tech
            </a>
            <span className="text-zinc-700">·</span>
            <a href="#project/mileway" onClick={() => window.scrollTo({ top: 0 })} className="transition hover:text-accent">
              rebuilt again at Mileway
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
