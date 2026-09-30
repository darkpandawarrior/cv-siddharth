// The Moon's geocentric distance, standing alone from src/lib/moon.ts on
// purpose: that file's own header says "Distance ... is dropped: nothing
// here needs the Moon's distance, only its direction" (M41), and its
// D/M/M'/F mean-anomaly terms are computed inside a private, unexported
// `moonEcliptic` - not reusable from outside that file. This lane's
// inspector row wants a real number ("true distance km"), so the same
// three low-order mean-anomaly polynomials (Meeus, Astronomical Algorithms
// ch. 47) are re-derived here, and paired with the top four terms BY
// AMPLITUDE of Table 47.A's r column (the SAME table moon.ts's own
// L_TERMS/B_TERMS are truncated from, just its distance column instead of
// its longitude/latitude ones) - the same "truncate to the dominant terms"
// call moon.ts already makes for phase and position. Good to a few hundred
// km against the full ~60-term series, comfortably inside what a rounded
// "384,000 km"-style UI row needs.
const RAD = Math.PI / 180;

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Geocentric Earth-Moon distance in km at `d`. */
export function moonDistanceKm(d: Date): number {
  const jd = d.getTime() / 86_400_000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  // Table 47.A's argument is [D, M, M', F]; the top 4 r-terms below only
  // ever use D and M' (the Sun's own mean anomaly M drops out at this
  // truncation depth), so it is never computed here.
  const D = norm360(297.8501921 + 445267.1114034 * T) * RAD;
  const Mp = norm360(134.9633964 + 477198.8675055 * T) * RAD;
  return (
    385000.56 -
    20905.355 * Math.cos(Mp) -
    3699.111 * Math.cos(2 * D - Mp) -
    2955.968 * Math.cos(2 * D) -
    569.925 * Math.cos(2 * Mp)
  );
}
