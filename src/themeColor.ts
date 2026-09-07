/**
 * The bridge between CSS theme tokens and everything that cannot read them.
 *
 * canvas 2D `ctx.fillStyle` and anything else that wants a plain colour
 * string take resolved values — `var(--color-signal)` is not a colour to
 * them, it is an unparseable string.
 *
 * Resolve at call time, not module load: tokens change when a theme class is
 * applied to <html>, and a module-scope constant would freeze the boot palette.
 *
 * No `three` import here on purpose: this module is reached from routes that
 * server-render (StoryMap.tsx, blueprintShared.tsx), and importProtection
 * denies `three` from the SSR bundle. The three.js-flavoured helper
 * (readColor, for r3f material/light props) lives in themeColorThree.ts,
 * imported only by the WebGL scene modules that are already client-only.
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
