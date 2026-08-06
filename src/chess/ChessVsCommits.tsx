import { useState } from "react";
import type { Corpus } from "../lib/useCorpus.ts";

/* ── Chess hours against commit hours ────────────────────────────────────
 * Two 24-hour distributions on one time axis, each normalised to its own
 * busiest hour. That normalisation is the whole reason the chart is
 * readable: ~18.7k games against a 1,000-commit sample on one raw scale
 * would press the commit curve flat into the axis and the overlay would say
 * nothing.
 *
 * Two caveats ride on the chart itself rather than in a footnote, because
 * both of them change what the picture is allowed to mean:
 *
 *  1. The commit series is a capped sample. GitHub's commit-search API
 *     returns at most 1,000 results for a query, and the generator ships the
 *     real numbers in `commitSample` — read, never typed, because they move
 *     every time the generator runs.
 *  2. Commit timestamps carry author timezone offsets that are not
 *     consistent across this history, so they are normalised to IST. An
 *     hour-of-day claim resting on unchecked offsets is exactly the quietly
 *     wrong number that gets caught later.
 *
 * ponytail: SVG, no animation. 24 points and two paths do not need a render
 * loop, and a static chart has nothing for prefers-reduced-motion to honour.
 */

const GAMES = "#3ddc84";
const COMMITS = "#5ee6ff";
const WINRATE = "#E8C874";

const W = 680;
const H = 322;
// Deep bottom padding on purpose: the two caveats live under the plot, in
// the frame, at a size that fits the viewBox without clipping or colliding.
const PAD = { top: 22, right: 52, bottom: 68, left: 46 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const HOURS = 24;
/** Plot each hour at the centre of its band, so 0 and 23 are not stuck to
 *  the frame and the two series line up over the same tick. */
const xAt = (hour: number) => PAD.left + ((hour + 0.5) / HOURS) * PLOT_W;
const yAt = (fraction: number) => PAD.top + (1 - fraction) * PLOT_H;

const line = (points: { hour: number; v: number }[]) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(p.hour).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(" ");

const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function ChessVsCommits({ hours }: { hours: Corpus["hours"] }) {
  const { chess: games, commits, commitSample } = hours;
  const [hour, setHour] = useState(() => games.reduce((a, b) => (b.n > a.n ? b : a), games[0]).hour);

  const gameMax = Math.max(...games.map((h) => h.n));
  const commitMax = Math.max(...commits.map((h) => h.n));
  const gameTotal = games.reduce((s, h) => s + h.n, 0);

  // Win rate gets its own axis: on a 0-100% scale the whole series would be a
  // flat line through the middle. Rounded out to the nearest 5% so the bounds
  // are readable rather than exactly the extremes of the sample.
  const rates = games.map((h) => h.winRate).filter((r): r is number => typeof r === "number");
  const wrLo = Math.floor(Math.min(...rates) * 20) / 20;
  const wrHi = Math.ceil(Math.max(...rates) * 20) / 20;
  const wrAt = (r: number) => yAt((r - wrLo) / (wrHi - wrLo));

  /* An hour holding a twentieth of the busiest hour's games swings its win
   * rate on almost nothing, so those points are drawn hollow and the cutoff
   * is stated. Derived from the data, not chosen. */
  const thinCut = Math.round(gameMax * 0.05);

  const gamePath = line(games.map((h) => ({ hour: h.hour, v: h.n / gameMax })));
  const commitPath = line(commits.map((h) => ({ hour: h.hour, v: h.n / commitMax })));
  const wrPath = games
    .filter((h) => typeof h.winRate === "number")
    .map((h, i) => `${i === 0 ? "M" : "L"}${xAt(h.hour).toFixed(1)},${wrAt(h.winRate).toFixed(1)}`)
    .join(" ");

  const peakGames = games.reduce((a, b) => (b.n > a.n ? b : a), games[0]);
  const peakCommits = commits.reduce((a, b) => (b.n > a.n ? b : a), commits[0]);

  const here = games.find((h) => h.hour === hour) ?? games[0];
  const hereCommits = commits.find((h) => h.hour === hour)?.n ?? 0;
  const readout =
    `At ${hh(hour)} IST: ${here.n.toLocaleString("en-US")} games ` +
    `(${pct(here.n / gameMax)} of his busiest hour) and ${hereCommits.toLocaleString("en-US")} commits ` +
    `(${pct(hereCommits / commitMax)} of theirs)` +
    (typeof here.winRate === "number" ? `, winning ${pct(here.winRate)} of them` : "") +
    ".";

  return (
    <>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
        When the games happen against when the commits happen, over the same clock. Chess peaks at{" "}
        {hh(peakGames.hour)} with {peakGames.n.toLocaleString("en-US")} games; the commits peak at{" "}
        {hh(peakCommits.hour)}. Each curve is drawn as a share of its own busiest hour —{" "}
        {gameTotal.toLocaleString("en-US")} games against a {commitSample.n.toLocaleString("en-US")}
        -commit sample on one raw scale would flatten the commit curve into the axis and the overlay
        would say nothing.
      </p>

      <div className="card-elevated mt-4 overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="overflow-x-auto px-5 pt-5">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[520px]"
            role="img"
            aria-label={
              `Two 24-hour distributions on a shared axis, each normalised to its own busiest hour: ` +
              `${gameTotal.toLocaleString("en-US")} chess games peaking at ${hh(peakGames.hour)} IST, and a ` +
              `capped sample of ${commitSample.n.toLocaleString("en-US")} of ${commitSample.total.toLocaleString("en-US")} ` +
              `matching commits since ${commitSample.from}, peaking at ${hh(peakCommits.hour)}. ` +
              `Win rate per hour runs on a second axis from ${pct(wrLo)} to ${pct(wrHi)}. ${readout}`
            }
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
                <text
                  x={PAD.left - 8}
                  y={yAt(g) + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94a3b8"
                  fontFamily="ui-monospace, monospace"
                >
                  {g * 100}%
                </text>
              </g>
            ))}

            {/* Right-hand axis: win rate only. */}
            {[wrLo, (wrLo + wrHi) / 2, wrHi].map((r) => (
              <text
                key={r}
                x={W - PAD.right + 8}
                y={wrAt(r) + 4}
                fontSize="10"
                fill={WINRATE}
                fontFamily="ui-monospace, monospace"
              >
                {pct(r)}
              </text>
            ))}

            <path d={`${gamePath} L${xAt(23)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`} fill="rgba(61,220,132,0.12)" />
            <path d={gamePath} fill="none" stroke={GAMES} strokeWidth="2" />
            <path d={commitPath} fill="none" stroke={COMMITS} strokeWidth="2" strokeDasharray="6 4" />
            <path d={wrPath} fill="none" stroke={WINRATE} strokeWidth="1.5" opacity="0.85" />

            {games.map((h) => {
              const thin = h.n < thinCut;
              return typeof h.winRate === "number" ? (
                <circle
                  key={h.hour}
                  cx={xAt(h.hour)}
                  cy={wrAt(h.winRate)}
                  r={h.hour === hour ? 4 : 2.6}
                  fill={thin ? "none" : WINRATE}
                  stroke={WINRATE}
                  strokeWidth="1.2"
                />
              ) : null;
            })}

            <line
              x1={xAt(hour)}
              x2={xAt(hour)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {[0, 6, 12, 18, 23].map((t) => (
              <text
                key={t}
                x={xAt(t)}
                y={H - 50}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
                fontFamily="ui-monospace, monospace"
              >
                {hh(t)}
              </text>
            ))}

            {/* Both caveats live on the chart. Neither is a footnote, because
                neither is optional to reading it correctly. Two lines rather
                than one: at this font a single sentence runs off the viewBox. */}
            <text x={PAD.left} y={H - 32} fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              hours are IST — commit author offsets are not consistent across this history, so they are
              normalised
            </text>
            <text x={PAD.left} y={H - 18} fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              {/* The cap itself is not in the corpus, so it is described
                  rather than quoted — the two numbers that ARE in the corpus
                  say how much of the history this curve covers. */}
              commits: a capped sample of {commitSample.n.toLocaleString("en-US")} of{" "}
              {commitSample.total.toLocaleString("en-US")} matching commits since {commitSample.from}
            </text>
            <text x={PAD.left} y={H - 4} fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              (GitHub&apos;s search API limits how many results one query can return)
            </text>
            <text
              x={W - PAD.right}
              y={PAD.top - 8}
              textAnchor="end"
              fontSize="10"
              fill="#94a3b8"
              fontFamily="ui-monospace, monospace"
            >
              hollow: under {thinCut.toLocaleString("en-US")} games that hour
            </text>
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex items-center gap-2 font-mono text-xs text-muted">
            hour
            <input
              type="range"
              min={0}
              max={HOURS - 1}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="h-1 w-40 accent-signal"
              aria-label="Hour of day, IST"
              aria-valuetext={readout}
            />
            <span className="text-zinc-400">{hh(hour)}</span>
          </label>
          <span className="font-mono text-xs">
            <span style={{ color: GAMES }}>games {here.n.toLocaleString("en-US")}</span>
            <span className="text-muted"> · </span>
            <span style={{ color: COMMITS }}>commits (dashed) {hereCommits.toLocaleString("en-US")}</span>
            {typeof here.winRate === "number" && (
              <>
                <span className="text-muted"> · </span>
                <span style={{ color: WINRATE }}>win rate {pct(here.winRate)}</span>
              </>
            )}
          </span>
        </div>
      </div>

      <p className="mt-3 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
        Scope: every one of the {gameTotal.toLocaleString("en-US")} games in the corpus against{" "}
        {commitSample.n.toLocaleString("en-US")} of the {commitSample.total.toLocaleString("en-US")}{" "}
        commits matching the same search since {commitSample.from}. The commit half is a sample and the
        two windows are not the same length, so the shapes are comparable and the volumes are not.
      </p>
    </>
  );
}
