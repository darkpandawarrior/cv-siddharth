import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { chess } from "../data/chess.ts";

/* ── Clock Burn ──────────────────────────────────────────────────────────
 * The clock thesis as one chart: mean fraction of the starting clock still
 * on it, by decile of game progress, split by how the game ended. The two
 * curves are indistinguishable through the opening and separate from about
 * a fifth of the way in — the time goes in the early middlegame, not on a
 * late blunder.
 *
 * Every number here comes from chess.thesis, which the generator derives
 * from per-move PGN clock annotations. Nothing is typed in by hand — the
 * sample size on the chart included.
 *
 * ponytail: SVG, not canvas. Ten points and a marker line do not need a
 * render loop, and an SVG chart is keyboard- and screen-reader-reachable
 * without a parallel text rendering.
 */

const { deciles, sampleSize, decidedOnClock, lossesOnTime, winsOnTime } = chess.thesis;

const PEAK = deciles.reduce((a, b) => (b.gap > a.gap ? b : a));

const W = 640;
const H = 260;
const PAD = { top: 18, right: 18, bottom: 34, left: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Deciles are buckets 0-9; plot each at the centre of its band. */
const xAt = (bucket: number) => PAD.left + ((bucket + 0.5) / deciles.length) * PLOT_W;
const yAt = (fraction: number) => PAD.top + (1 - fraction) * PLOT_H;

const path = (pick: (d: (typeof deciles)[number]) => number) =>
  deciles.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(d.bucket).toFixed(1)},${yAt(pick(d)).toFixed(1)}`).join(" ");

const WIN_PATH = path((d) => d.win);
const LOSS_PATH = path((d) => d.loss);
/** The divergence itself: down the win curve, back along the loss curve. */
const GAP_PATH = `${WIN_PATH} ${[...deciles]
  .reverse()
  .map((d) => `L${xAt(d.bucket).toFixed(1)},${yAt(d.loss).toFixed(1)}`)
  .join(" ")} Z`;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pts = (x: number) => `${(x * 100).toFixed(1)} pts`;
const band = (bucket: number) => `${bucket * 10}–${bucket * 10 + 10}%`;

export function ClockLab() {
  const [bucket, setBucket] = useState<number>(PEAK.bucket);
  const here = deciles[bucket];
  const markerX = xAt(bucket);

  const summary =
    `At ${band(bucket)} through the game he has ${pct(here.win)} of his clock left in games he won ` +
    `and ${pct(here.loss)} in games he lost — a gap of ${pts(here.gap)}.`;

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        {pct(decidedOnClock)} of his decided games end on the clock rather than on the board, and{" "}
        {pct(lossesOnTime)} of his losses are flags against {pct(winsOnTime)} of his wins. This is
        where it happens. Both curves track the mean share of the starting clock still remaining,
        by decile of game progress — they sit on top of each other through the opening and come
        apart in the early middlegame, peaking at {pts(PEAK.gap)} around {band(PEAK.bucket)} in.
        Drag the scrubber to read any point.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="px-5 pt-5">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Mean clock remaining by decile of game progress, wins versus losses, over ${sampleSize.toLocaleString("en-US")} games. ${summary}`}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={yAt(g)}
                  y2={yAt(g)}
                  stroke="rgba(148,163,184,0.16)"
                  strokeWidth="1"
                />
                <text x={PAD.left - 8} y={yAt(g) + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
                  {g * 100}%
                </text>
              </g>
            ))}

            <path d={GAP_PATH} fill="rgba(94,230,255,0.10)" />

            <path d={LOSS_PATH} fill="none" stroke="#5ee6ff" strokeWidth="2" strokeDasharray="6 4" />
            <path d={WIN_PATH} fill="none" stroke="#3ddc84" strokeWidth="2" />

            {deciles.map((d) => (
              <g key={d.bucket}>
                <circle cx={xAt(d.bucket)} cy={yAt(d.win)} r={d.bucket === bucket ? 4 : 2.5} fill="#3ddc84" />
                <circle cx={xAt(d.bucket)} cy={yAt(d.loss)} r={d.bucket === bucket ? 4 : 2.5} fill="#5ee6ff" />
              </g>
            ))}

            <line x1={markerX} x2={markerX} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />

            <text x={PAD.left} y={H - 10} fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              start of game
            </text>
            <text x={W - PAD.right} y={H - 10} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              last move
            </text>

            {/* Sample size lives on the chart, not only in the prose. */}
            <text x={PAD.left + 6} y={PAD.top + PLOT_H - 8} fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              n = {sampleSize.toLocaleString("en-US")} games with per-move clocks
            </text>
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <label className="flex items-center gap-2 font-mono text-xs text-muted">
            game progress
            <input
              type="range"
              min={0}
              max={deciles.length - 1}
              value={bucket}
              onChange={(e) => setBucket(Number(e.target.value))}
              className="h-1 w-40 accent-[#3ddc84]"
              aria-label="Game progress decile"
              aria-valuetext={summary}
            />
            <span className="text-zinc-400">{band(bucket)}</span>
          </label>
          <span className="font-mono text-xs">
            <span className="text-[#3ddc84]">won — {pct(here.win)} left</span>
            <span className="text-muted"> · </span>
            <span className="text-[#5ee6ff]">lost (dashed) — {pct(here.loss)} left</span>
            <span className="text-muted"> · gap {pts(here.gap)}</span>
          </span>
          <Link to="/chess" className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent">
            the full clock thesis → the chess room
          </Link>
        </div>
      </div>
      <p className="mt-3 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
        Scope: the {sampleSize.toLocaleString("en-US")} games whose PGN carried per-move clock
        annotations — not the whole {chess.totals.games.toLocaleString("en-US")}-game archive.
      </p>
    </div>
  );
}
