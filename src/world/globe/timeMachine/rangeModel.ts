/** Minutes match globeStore's contract; snapping is deliberately separate from
 *  the continuous scale so pointer motion has an exact, reversible mapping. */
export const MIN_OFFSET_MIN = -30 * 1440;
export const MAX_OFFSET_MIN = 2 * 1440;

// Half the past track covers six hours, the next quarter three days. The
// future has no day-scale segment because its entire horizon is two days.
const PAST = [0, 360, 4320, 43200] as const;
const FUTURE = [0, 360, 2880] as const;
const PAST_POS = [0, 0.5, 0.75, 1] as const;
const FUTURE_POS = [0, 0.5, 1] as const;

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Time must be finite");
  return value;
}

function interpolate(value: number, from: readonly number[], to: readonly number[]): number {
  const x = Math.min(value, from[from.length - 1]);
  let i = 1;
  while (x > from[i]) i++;
  return to[i - 1] + (x - from[i - 1]) / (from[i] - from[i - 1]) * (to[i] - to[i - 1]);
}

/** Unequal horizons keep now centred while reserving fine control nearby.
 *  Finite inputs outside the slider clamp; NaN cannot enter simulated time. */
export function sliderToOffset(position: number): number {
  const p = finite(position);
  return p < 0 ? -interpolate(-p, PAST_POS, PAST) : interpolate(p, FUTURE_POS, FUTURE);
}

/** Inverse on the supported interval, without quantization drift on playback. */
export function offsetToSlider(minutes: number): number {
  const m = finite(minutes);
  return m < 0 ? -interpolate(-m, PAST, PAST_POS) : interpolate(m, FUTURE, FUTURE_POS);
}

/** Coarse distant steps avoid pretending a day-scale thumb has minute precision. */
export function snapStepMinutes(minutes: number): number {
  const distance = Math.abs(finite(minutes));
  return distance <= 360 ? 15 : distance <= 4320 ? 60 : 1440;
}

/** Round ties away from now on both halves; clamp after rounding at the ends. */
export function snapOffset(minutes: number): number {
  const step = snapStepMinutes(minutes);
  const rounded = Math.sign(minutes) * Math.round(Math.abs(minutes) / step) * step;
  return Math.max(MIN_OFFSET_MIN, Math.min(MAX_OFFSET_MIN, rounded)) || 0;
}

/** Explicit UTC calendar labels keep replay copy consistent with GIBS dates.
 *  The caller supplies real now so this pure function never reads a clock. */
export function labelOffset(minutes: number, realNowMs: number): string {
  finite(minutes);
  finite(realNowMs);
  const target = new Date(realNowMs + minutes * 60_000);
  const iso = target.toISOString();
  const distance = Math.abs(minutes);
  if (distance < 1) return "now";
  const relative = (value: number, unit: string) => minutes < 0 ? `${value} ${unit} ago` : `in ${value} ${unit}`;
  if (distance < 60) return relative(Math.round(distance), "min");
  if (distance <= 360) return relative(Math.round(distance / 60), "h");
  const dayDelta = Math.floor(target.getTime() / 86_400_000) - Math.floor(realNowMs / 86_400_000);
  if (dayDelta === -1) return `yesterday ${iso.slice(11, 16)}`;
  if (dayDelta === 1) return `tomorrow ${iso.slice(11, 16)}`;
  if (distance < 1440) return relative(Math.round(distance / 60), "h");
  const days = Math.round(distance / 1440);
  return relative(days, days === 1 ? "day" : "days");
}
