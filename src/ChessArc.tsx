import { chess } from "./data/chess.ts";

type ArcPoint = { readonly t: number; readonly r: number };

export type ArcSeries = {
  readonly platform: string;
  readonly format: string;
  readonly points: readonly ArcPoint[];
};

/**
 * The rating arc as one band per platform, each with its **own** Y scale.
 *
 * This is not a styling choice, it is the only honest projection: the two
 * platforms' rating pools are not comparable. The generated data has lichess
 * blitz peaking ~260 points above chess.com blitz for the same player at
 * roughly the same strength, so a single shared Y-axis would draw a cliff at
 * the platform handoff and read as a collapse in ability that the games do not
 * support. Time (X) *is* comparable, so the X domain is shared across bands —
 * that is what makes the handoff legible without inventing an offset.
 *
 * Plain inline SVG on purpose: this renders on the home route, so it costs no
 * dependency and no WebGL context. Task 7's 3D twin-ribbon scene falls back to
 * this same component under `prefers-reduced-motion`.
 */

/**
 * Series style by first-appearance order of the format, so a format keeps the
 * same colour *and* the same dash pattern in every band. The dash is the point:
 * meaning must not rest on colour alone (WCAG 1.4.1), and each format's range
 * is also written out as text in the legend. #f0883e is already an AA-checked
 * series colour in writingMeta.ts.
 */
const SERIES_STYLE = [
  { colour: "var(--color-accent)", dash: undefined },
  { colour: "var(--color-accent2)", dash: "8 4" },
  { colour: "#f0883e", dash: "2 4" },
];

const style = (i: number) => SERIES_STYLE[i % SERIES_STYLE.length];

// viewBox units. The SVG is stretched to its container with
// preserveAspectRatio="none" and a CSS height, and every stroke carries
// vectorEffect="non-scaling-stroke" so the non-uniform scale can't thin the
// lines or squash the dash patterns. No <text> lives inside the SVG for the
// same reason — labels are HTML, so they don't shrink with the viewport.
const W = 1000;
const VB_H = 100;
const INSET = 6;

const uniq = (xs: readonly string[]) => [...new Set(xs)];

export function ChessArc({
  arcs = chess.arc,
  /** Height of a single platform band, in CSS pixels. */
  height = 84,
}: {
  arcs?: readonly ArcSeries[];
  height?: number;
} = {}) {
  const withPoints = arcs.filter((a) => a.points.length > 1);
  if (!withPoints.length) return null;

  const allT = withPoints.flatMap((a) => a.points.map((p) => p.t));
  const tMin = Math.min(...allT);
  const tMax = Math.max(...allT);
  const tSpan = tMax - tMin || 1;
  const x = (t: number) => INSET + ((t - tMin) / tSpan) * (W - 2 * INSET);

  // Year gridlines are the only shared reference between bands; decorative, so
  // they carry no label inside the SVG — the span is written out below it.
  const firstYear = new Date(tMin).getUTCFullYear();
  const lastYear = new Date(tMax).getUTCFullYear();
  const yearTicks: number[] = [];
  for (let y = firstYear + 1; y <= lastYear; y++) yearTicks.push(Date.UTC(y, 0, 1));

  const formatOrder = uniq(withPoints.map((a) => a.format));

  const bands = uniq(withPoints.map((a) => a.platform)).map((platform) => {
    const series = withPoints.filter((a) => a.platform === platform);
    const ratings = series.flatMap((a) => a.points.map((p) => p.r));
    const rMin = Math.min(...ratings);
    const rMax = Math.max(...ratings);
    const rSpan = rMax - rMin || 1;
    return {
      platform,
      rMin,
      rMax,
      lines: series.map((s) => ({
        format: s.format,
        st: style(formatOrder.indexOf(s.format)),
        min: Math.min(...s.points.map((p) => p.r)),
        max: Math.max(...s.points.map((p) => p.r)),
        d: s.points
          .map((p) => `${x(p.t).toFixed(1)},${(VB_H - ((p.r - rMin) / rSpan) * VB_H).toFixed(1)}`)
          .join(" "),
      })),
    };
  });

  const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

  return (
    <figure className="m-0">
      {bands.map((b) => (
        <div key={b.platform} className="mb-4 last:mb-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-200">
              {b.platform}
            </span>
            <span className="font-mono text-[11px] text-muted">
              own scale · {b.rMin}–{b.rMax}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${W} ${VB_H}`}
            preserveAspectRatio="none"
            style={{ height }}
            className="mt-1.5 w-full rounded-lg border border-line bg-ink"
            aria-hidden
          >
            {yearTicks.map((t) => (
              <line
                key={t}
                x1={x(t)}
                x2={x(t)}
                y1={0}
                y2={VB_H}
                stroke="var(--color-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {b.lines.map((l) => (
              <polyline
                key={l.format}
                points={l.d}
                fill="none"
                stroke={l.st.colour}
                strokeDasharray={l.st.dash}
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {b.lines.map((l) => (
              <span key={l.format} className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
                <svg width="20" height="6" aria-hidden className="shrink-0">
                  <line
                    x1="0"
                    y1="3"
                    x2="20"
                    y2="3"
                    stroke={l.st.colour}
                    strokeDasharray={l.st.dash}
                    strokeWidth="2"
                  />
                </svg>
                {l.format} {l.min}–{l.max}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-3 flex justify-between font-mono text-[11px] text-muted">
        <span>{day(tMin)}</span>
        <span>{day(tMax)}</span>
      </div>

      <figcaption className="mt-2 text-xs leading-relaxed text-muted">
        Each platform sits in its own band on its own vertical scale — lichess and chess.com rating
        pools are not comparable, so a shared axis would draw a decline the games do not support.
        Only the time axis is shared. The ranges above are the weekly-sampled points plotted here;
        the true per-format peaks are on the profile cards below.
      </figcaption>
    </figure>
  );
}
