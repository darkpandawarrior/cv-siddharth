import { Color } from "three";

/**
 * The bridge between CSS theme tokens and everything that cannot read them.
 *
 * react-three-fiber props (`<pointLight color=`, `emissive=`) and canvas 2D
 * `ctx.fillStyle` take resolved colour strings — `var(--color-signal)` is not a
 * colour to them, it is an unparseable string. That is the whole reason the
 * scenes were hardcoded, and the whole reason a theme swap never reached them.
 *
 * Resolve at call time, not module load: tokens change when a theme class is
 * applied to <html>, and a module-scope constant would freeze the boot palette.
 */

/** Raw token value, e.g. "#3ddc84". For canvas ctx and CSS string props. */
export function readToken(varName: string, fallback: string): string {
  // ponytail: no cache. getComputedStyle is cheap next to a WebGL frame, and a
  // cache would need invalidating on every theme change — that is the bug we
  // are fixing, reintroduced one layer up.
  if (typeof document === "undefined") return fallback; // SSR / test env
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

/** Token as a three.js Color. For r3f material and light props. */
export function readColor(varName: string, fallback: string): Color {
  return new Color(readToken(varName, fallback));
}
