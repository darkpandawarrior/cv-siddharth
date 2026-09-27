import { useEffect, useMemo, useRef } from "react";

const GAUGE_R = 26;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;
const DEFAULT_SPARK_D = "M2,20 L14,16 L26,18 L38,10 L50,12 L62,4";

function parseMetricValue(raw: string): { num: number; suffix: string } | null {
  const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(raw.trim());
  return m ? { num: parseFloat(m[1]), suffix: m[2] } : null;
}

/** Draws a REAL trend line from a real series (chess rating over time, a
 *  lane's monthly counts, ...) instead of the decorative default path — same
 *  64x24 viewBox and draw-in mechanic, just fed real numbers when the metric
 *  actually has a history. Fewer than 2 points falls back to the default
 *  path rather than drawing a "trend" out of one number. Exported for a
 *  focused unit test. */
export function sparkPathFrom(values: number[]): string {
  if (values.length < 2) return DEFAULT_SPARK_D;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 60 / (values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(2 + i * step).toFixed(1)},${(20 - ((v - min) / span) * 16).toFixed(1)}`)
    .join(" ");
}

/**
 * One metric tile: count-up on scroll-into-view (reduced-motion → instant
 * final value) plus a live micro-viz — a circular gauge for percentages, an
 * ascending sparkline otherwise. Shared by the homepage metrics band and
 * every project detail page so "career/project as a running system-monitor"
 * read is one implementation, not a copy per page.
 *
 * `viz="none"` (bare mode): count-up only, no gauge, no sparkline — for a
 * metric that would otherwise force a fabricated trend onto a number that
 * has none. `spark`: a real series to draw instead of the decorative default
 * line, when one actually exists. Both are additive — every existing call
 * site (`metric` only) renders exactly as before.
 */
export function AnimatedMetric({
  metric,
  viz = "auto",
  spark,
  className = "flex items-center gap-4 px-4 py-3",
}: {
  metric: { value: string; label: string; detail?: string };
  viz?: "auto" | "none";
  spark?: number[];
  /** Overrides the root's layout classes for embedding inside a caller's own
   *  card (padding/flex already applied there). Defaults to the original
   *  standalone tile layout, unchanged for every existing call site. */
  className?: string;
}) {
  const parsed = useMemo(() => parseMetricValue(metric.value), [metric.value]);
  const isGauge = viz !== "none" && !!parsed && parsed.suffix.trim().startsWith("%");
  const showSpark = viz !== "none" && !isGauge;
  const sparkD = useMemo(() => (spark && spark.length >= 2 ? sparkPathFrom(spark) : DEFAULT_SPARK_D), [spark]);
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const gaugeRef = useRef<SVGCircleElement>(null);
  const sparkRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!showSpark || !sparkRef.current) return;
    const len = sparkRef.current.getTotalLength();
    sparkRef.current.style.strokeDasharray = String(len);
    sparkRef.current.style.strokeDashoffset = String(len);
  }, [showSpark, sparkD]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !parsed) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveal = () => {
      if (valueRef.current) valueRef.current.textContent = metric.value;
      if (isGauge && gaugeRef.current) {
        gaugeRef.current.style.strokeDashoffset = String(GAUGE_CIRC * (1 - Math.min(parsed.num, 100) / 100));
      } else if (showSpark && sparkRef.current) {
        sparkRef.current.style.strokeDashoffset = "0";
      }
    };

    if (reduced) {
      reveal();
      return;
    }

    // The markup ships the real value so crawlers, LLM screeners and
    // no-JS readers get the number. Zero it here instead, so the count-up
    // still starts from 0 for anyone who will actually see it animate.
    if (valueRef.current) valueRef.current.textContent = `0${parsed.suffix}`;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 1000;
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - (1 - t) ** 3;
          const current = parsed.num * eased;
          if (valueRef.current) {
            valueRef.current.textContent = `${Number.isInteger(parsed.num) ? Math.round(current) : current.toFixed(1)}${parsed.suffix}`;
          }
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        // Kick the gauge/spark draw-in one frame later so the CSS transition
        // actually fires (it needs an initial style to transition *from*).
        requestAnimationFrame(reveal);
      },
      { threshold: 0.4 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [metric.value, parsed, isGauge, showSpark]);

  return (
    <div ref={rootRef} className={className}>
      <div className="min-w-0">
        <p className="font-display text-metric font-bold text-accent">
          <span ref={valueRef}>{metric.value}</span>
        </p>
        {metric.label && <p className="mt-1 text-sm font-medium text-zinc-200">{metric.label}</p>}
        {metric.detail && <p className="mt-1 text-xs leading-snug text-muted">{metric.detail}</p>}
      </div>
      {viz !== "none" && (
        <div className="ml-auto shrink-0">
          {isGauge ? (
            <svg className="metric-gauge h-12 w-12 -rotate-90 sm:h-14 sm:w-14" viewBox="0 0 60 60" aria-hidden>
              <circle cx="30" cy="30" r={GAUGE_R} fill="none" stroke="var(--color-line)" strokeWidth="5" />
              <circle
                ref={gaugeRef}
                className="metric-gauge-fill"
                cx="30"
                cy="30"
                r={GAUGE_R}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={GAUGE_CIRC}
                strokeDashoffset={GAUGE_CIRC}
              />
            </svg>
          ) : (
            <svg className="metric-spark h-9 w-14 sm:h-10 sm:w-16" viewBox="0 0 64 24" fill="none" aria-hidden>
              <path
                ref={sparkRef}
                className="metric-spark-line"
                d={sparkD}
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="62" cy="4" r="2.5" fill="var(--color-accent)" className="gps-pulse" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
