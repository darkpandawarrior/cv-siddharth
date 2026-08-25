import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ROUTE,
  ROUTE_LENGTH_M,
  ZONES,
  toLatLng,
  type LatLng,
  type XY,
  type ZoneId,
} from "./signalRoute.ts";
import {
  CADENCE_S,
  STAGES,
  configForStages,
  ladder,
  runPipeline,
  simulate,
  type Tier,
} from "./signalEngine.ts";
import { Link } from "@tanstack/react-router";
import { readToken } from "../themeColor";
import { useSectionNav } from "../lib/navigation.ts";

/**
 * The Signal Lab — the "trip distances were off by large margins" bug from
 * Dice.tech, rebuilt as Mileway's location engine, running live over the real
 * roads it would have run on.
 *
 * What it demonstrates is a DISTANCE claim, so distance is what it measures:
 * raw GPS inflates a 17.4 km drive to roughly 40 km, because every jitter adds
 * length to the polyline. Switch the pipeline on a stage at a time and watch
 * that come back to within a few percent. Every number on screen is summed
 * haversine over the positions a stage actually accepted — src/labs/
 * signalEngine.ts holds the whole engine as a pure function, and
 * signalEngine.test.ts asserts these headlines so they cannot quietly rot.
 *
 * Rendering: the canvas sits over a Leaflet basemap and every point is
 * projected through Leaflet's own projection, so the track is georeferenced —
 * it pans and zooms with the map rather than floating above it. `isolate` on
 * the map container keeps Leaflet's internal pane z-indexes (400, and 800+ for
 * controls) inside that subtree; on the wrapper they outrank the sibling
 * canvas and the whole track paints underneath the tiles.
 */

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://carto.com/attributions">CARTO</a> · route &copy; OpenStreetMap contributors';

/** Named seeds — the same engine, different luck. */
const SCENARIOS = [
  { seed: 20260726, label: "run A" },
  { seed: 8814, label: "run B" },
  { seed: 175523, label: "run C" },
] as const;

const PLAYBACK_SECONDS = 26; // how long a full run takes to draw, regardless of length

const fmtKm = (m: number) => `${(m / 1000).toFixed(2)} km`;
const fmtPct = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;

export function SignalLabPane() {
  const [stages, setStages] = useState(STAGES.length);
  const [tier, setTier] = useState<Tier>("flagship");
  const [laps, setLaps] = useState(1);
  const [scenario, setScenario] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [playhead, setPlayhead] = useState(1);
  // The two footer links leave this lab, so they go through the router rather
  // than a bare <a>: a document navigation from here would tear down and
  // remount the whole app, and #work in particular has to survive the home
  // chunk still loading, which is exactly what goToSection's mount-wait does.
  const { goToSection } = useSectionNav();

  /* ── The engine run. Pure, memoised, and the single source of every number
   *    and every pixel below. */
  const run = useMemo(() => {
    const samples = simulate({
      seed: SCENARIOS[scenario].seed,
      tier,
      distanceM: ROUTE_LENGTH_M * laps,
    });
    const engine = runPipeline(samples, configForStages(stages), tier);
    const rawPath = runPipeline(samples, configForStages(0), tier);
    // `ladder` measures ground truth the same way, so take its value rather
    // than computing a second one that could drift from the table's.
    const { truthM, rows } = ladder(samples, tier);
    return { samples, truthM, rows, engine, rawPath };
  }, [scenario, tier, laps, stages]);

  const total = run.samples.length;

  /* ── Playback ─────────────────────────────────────────────────────────── */
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) setPlaying(false);
  }, []);

  useEffect(() => {
    setPlayhead(reduced.current ? total : 1);
  }, [total]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const perMs = total / (PLAYBACK_SECONDS * 1000);
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setPlayhead((p) => (p >= total ? 1 : Math.min(total, p + dt * perMs)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  /* ── Map ──────────────────────────────────────────────────────────────── */
  const mapHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [, setProjectionTick] = useState(0);

  useEffect(() => {
    const host = mapHostRef.current;
    if (!host) return;
    const map = L.map(host, {
      zoomControl: false,
      attributionControl: true,
      // Scroll must keep scrolling the PAGE — a map that swallows the wheel
      // traps a visitor halfway down a long room. Same reasoning for dragging
      // on touch, where a one-finger drag is how you scroll: panning is worth
      // having with a mouse, and not worth stealing the page scroll for.
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      doubleClickZoom: true,
      keyboard: false,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: "abcd", maxZoom: 20 }).addTo(map);
    map.fitBounds(L.latLngBounds(ROUTE.map((p) => L.latLng(p[0], p[1]))), { padding: [24, 24] });
    mapRef.current = map;

    const reproject = () => setProjectionTick((t) => t + 1);
    map.on("move zoom resize", reproject);
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      reproject();
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      map.off("move zoom resize", reproject);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Draw ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !map || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Everything is drawn through Leaflet's projection, so the track sits on
    // the actual roads at any zoom.
    const project = (ll: LatLng) => map.latLngToContainerPoint(L.latLng(ll[0], ll[1]));
    const projectXY = (p: XY) => project(toLatLng(p));

    const head = Math.floor(playhead);

    // 1. Ground truth, coloured by zone — the road actually driven.
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const zone of ZONES) {
      const from = Math.floor(zone.from * (ROUTE.length - 1));
      const to = Math.ceil(zone.to * (ROUTE.length - 1));
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const pt = project(ROUTE[i]);
        if (i === from) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = `${zone.color}44`;
      ctx.stroke();
    }

    // 2. Raw GPS — the jagged mess that reads as 40 km.
    const raw = run.rawPath.path;
    ctx.beginPath();
    let started = false;
    for (const pp of raw) {
      if (pp.i > head) break;
      const pt = projectXY(pp.p);
      if (!started) { ctx.moveTo(pt.x, pt.y); started = true; } else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = "rgba(240, 136, 62, 0.5)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 3. The engine's track. Dashed where it is coasting on the IMU with no
    //    satellites at all — the tunnel is visible as a dashed run.
    const path = run.engine.path;
    const drawRun = (bridged: boolean) => {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < path.length; i++) {
        if (path[i].i > head) break;
        const pt = projectXY(path[i].p);
        const match = path[i].bridged === bridged;
        if (match && !pen) { ctx.moveTo(pt.x, pt.y); pen = true; }
        else if (match) ctx.lineTo(pt.x, pt.y);
        else pen = false;
      }
      ctx.setLineDash(bridged ? [4, 4] : []);
      ctx.strokeStyle = bridged ? "rgba(94, 230, 255, 0.85)" : readToken("--color-probe", "#5ee6ff");
      ctx.lineWidth = bridged ? 1.8 : 2.4;
      ctx.shadowColor = "rgba(94, 230, 255, 0.5)";
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    };
    drawRun(false);
    drawRun(true);

    // 4. The vehicle, at ground truth.
    const here = run.samples[Math.min(head, total - 1)];
    if (here) {
      const pt = projectXY(here.truth);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = readToken("--color-text", "#e8efe9");
      ctx.fill();
      ctx.strokeStyle = "rgba(5,7,10,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 5. The magnifier. At city zoom a 13 m scatter is two pixels wide, so the
    //    headline ("raw GPS reads 40 km") is true but invisible. This window
    //    follows the vehicle at ~9x and is where the claim becomes something
    //    you can see: orange thrashing either side of the road, cyan riding
    //    down the middle of it.
    if (here) {
      const IW = Math.min(210, rect.width * 0.34);
      const IH = Math.min(150, rect.height * 0.36);
      const IX = rect.width - IW - 12;
      const IY = 12;
      const SPAN_M = 130; // metres across the window
      const k = IW / SPAN_M;
      const c = here.truth;
      const toInset = (p: XY) => ({
        x: IX + IW / 2 + (p.x - c.x) * k,
        y: IY + IH / 2 - (p.y - c.y) * k, // canvas y grows downward, north does not
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(IX, IY, IW, IH);
      ctx.fillStyle = "rgba(5, 7, 10, 0.86)";
      ctx.fill();
      ctx.clip();

      const strokeThrough = <T,>(items: T[], pt: (t: T) => XY, style: string, width: number) => {
        ctx.beginPath();
        let pen = false;
        for (const it of items) {
          const q = toInset(pt(it));
          if (!pen) { ctx.moveTo(q.x, q.y); pen = true; } else ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.stroke();
      };

      // Only the samples near the playhead, or the window is a smear.
      const from = Math.max(0, head - 90);
      const near = run.samples.slice(from, head + 1);
      strokeThrough(near, (s) => s.truth, "rgba(232, 239, 233, 0.30)", 7);
      strokeThrough(
        near.filter((s) => s.fix),
        (s) => s.fix as XY,
        "rgba(240, 136, 62, 0.9)",
        1.4,
      );
      const nearPath = path.filter((pp) => pp.i >= from && pp.i <= head);
      strokeThrough(nearPath, (pp) => pp.p, "#5ee6ff", 2.2);

      const v = toInset(here.truth);
      ctx.beginPath();
      ctx.arc(v.x, v.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = readToken("--color-text", "#e8efe9");
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(232, 239, 233, 0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(IX + 0.5, IY + 0.5, IW - 1, IH - 1);
      ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(232, 239, 233, 0.62)";
      ctx.fillText(`${SPAN_M} m across · raw vs engine`, IX + 6, IY + 5);
    }

    // 6. Zone labels, on the road they belong to.
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const zone of ZONES) {
      const mid = ROUTE[Math.floor(((zone.from + zone.to) / 2) * (ROUTE.length - 1))];
      const pt = project(mid);
      ctx.fillStyle = "rgba(5,7,10,0.75)";
      const w = ctx.measureText(zone.label).width + 8;
      ctx.fillRect(pt.x - w / 2, pt.y - 7, w, 14);
      ctx.fillStyle = `${zone.color}dd`;
      ctx.fillText(zone.label, pt.x, pt.y);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });

  /* ── Numbers ──────────────────────────────────────────────────────────── */
  const engineErrPct = ((run.engine.distanceM - run.truthM) / run.truthM) * 100;
  const rawErrPct = ((run.rawPath.distanceM - run.truthM) / run.truthM) * 100;
  const zoneTruth = (id: ZoneId) => {
    const z = ZONES.find((x) => x.id === id)!;
    return (z.to - z.from) * ROUTE_LENGTH_M * laps;
  };

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        At Dice.tech, field users' trip distances were off by large margins. Urban canyons, tunnels and
        OEM-throttled location updates each lie to the GPS chip in a different way. This is that bug and its
        fix, rebuilt from scratch as Mileway's location engine and running over a real 17.4 km loop through
        Pune. Raw GPS reads the drive as roughly <span className="text-warn">40 km</span>, because noise
        adds length to every single segment. Switch the pipeline on one stage at a time and watch it come
        back. Every figure below is summed geodesic distance over the points a stage actually kept, no
        fidelity factors, and the tests assert these exact headlines.
      </p>

      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[380px] sm:h-[460px]">
          <div ref={mapHostRef} className="signal-lab-map absolute inset-0 isolate" />
          <div className="pointer-events-none absolute inset-0 bg-void/30" />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            role="img"
            aria-label={`Live GPS pipeline over a real ${(ROUTE_LENGTH_M / 1000).toFixed(1)} km driving loop in Pune, India`}
          />
          <style>{`
            /* Opaque, not faded. opacity:0.65 over a 55%-alpha panel composited
               this strip down to ~1.3:1 against the map tiles — 9px text nobody
               could read. It is the OpenStreetMap credit, which is required to
               be visible, so it is the last thing that should be ghosted.
               Solid ground + #d4d4d8 clears AA at this size. */
            .signal-lab-map .leaflet-control-attribution { font-size: 9px; background: #05070a; color: #d4d4d8; padding: 1px 5px; }
            .signal-lab-map .leaflet-control-attribution a { color: #f4f4f5; text-decoration: underline; }
          `}</style>
        </div>

        {/* Headline: the three distances, side by side. */}
        <div className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-3">
          <Figure label="raw GPS" value={fmtKm(run.rawPath.distanceM)} sub={fmtPct(rawErrPct)} tone="bad" />
          <Figure label="engine" value={fmtKm(run.engine.distanceM)} sub={fmtPct(engineErrPct)} tone="good" />
          <Figure label="ground truth" value={fmtKm(run.truthM)} sub="the road actually driven" tone="neutral" />
        </div>

        {/* The ladder. */}
        <div className="border-t border-line px-5 py-4">
          <p className="kicker mb-3">
            the pipeline, one stage at a time
          </p>
          <div className="space-y-1.5">
            {run.rows.map((row, i) => {
              const on = i <= stages;
              const active = i === stages;
              const mag = Math.min(100, Math.abs(row.errorPct));
              return (
                <button
                  key={row.label}
                  onClick={() => setStages(i)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition ${
                    active ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-surface"
                  }`}
                >
                  <span className={`w-44 shrink-0 font-mono text-xs ${on ? "text-zinc-200" : "text-muted"}`}>
                    {row.label}
                  </span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      style={{
                        width: `${mag}%`,
                        background: mag > 40 ? "#f0883e" : mag > 12 ? "#db61ff" : "#3ddc84",
                      }}
                    />
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right font-mono text-xs ${
                      Math.abs(row.errorPct) < 12 ? "text-accent" : "text-warn"
                    }`}
                  >
                    {fmtPct(row.errorPct)}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] text-muted sm:block">
                    RMSE {row.rmseM.toFixed(0)}m
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
            {stages === 0
              ? "Unfiltered. Every fix is trusted, so every jitter becomes distance."
              : STAGES[stages - 1].blurb}
            {" · "}
            <span className="text-muted">
              {run.engine.rejected} fixes rejected · {run.engine.bridged} dead-reckoned · {run.engine.resets} divergence
              {run.engine.resets === 1 ? " reset" : " resets"} · worst drift {run.engine.maxDriftM.toFixed(0)}m
            </span>
          </p>
        </div>

        {/* Where the error lives. */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-5 py-3 font-mono text-[11px]">
          <span className="text-muted">per zone</span>
          {ZONES.map((z) => {
            const got = run.engine.perZoneM[z.id];
            const want = zoneTruth(z.id);
            const pct = ((got - want) / want) * 100;
            return (
              <span key={z.id} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: z.color }} />
                <span className="text-muted">{z.label.toLowerCase()}</span>
                <span className={Math.abs(pct) < 15 ? "text-accent" : "text-warn"}>{fmtPct(pct)}</span>
              </span>
            );
          })}
        </div>

        {/* Controls. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-5 py-4 font-mono text-xs">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full border border-line px-3 py-1 text-zinc-300 transition hover:border-accent hover:text-accent"
          >
            {playing ? "❚❚ pause" : "▶ play"}
          </button>

          <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={tier === "budget"}
              onChange={(e) => setTier(e.target.checked ? "budget" : "flagship")}
              className="accent-signal"
            />
            budget device
            <span className="text-muted">({CADENCE_S[tier]}s fixes)</span>
          </label>

          <span className="flex items-center gap-2 text-muted">
            laps
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setLaps(n)}
                className={`rounded px-1.5 transition ${laps === n ? "text-accent" : "text-muted hover:text-zinc-200"}`}
              >
                {n}
              </button>
            ))}
          </span>

          <span className="flex items-center gap-2 text-muted">
            seed
            {SCENARIOS.map((s, i) => (
              <button
                key={s.seed}
                onClick={() => setScenario(i)}
                className={`rounded px-1.5 transition ${scenario === i ? "text-accent" : "text-muted hover:text-zinc-200"}`}
              >
                {s.label}
              </button>
            ))}
          </span>

          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {/* py-1 lifts these two to the 24px touch minimum. The row is 11px
                  text, so the bare line box was about 17px and Lighthouse
                  scored /lab at 96 on target-size. Padding rather than a
                  layout change keeps them inline in the sentence. */}
              <button type="button" onClick={() => goToSection("work")} className="inline-block py-1 transition hover:text-accent">
              the full story → Dice.tech
            </button>
            <span className="text-muted">·</span>
            <Link to="/project/$slug" params={{ slug: "mileway" }} className="inline-block py-1 transition hover:text-accent">
              rebuilt again at Mileway
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-accent" : tone === "bad" ? "text-warn" : "text-zinc-200";
  return (
    <div className="bg-void/70 px-5 py-3">
      <p className="kicker">{label}</p>
      <p className={`font-display text-xl font-bold ${color}`}>{value}</p>
      <p className="font-mono text-[11px] text-muted">{sub}</p>
    </div>
  );
}
