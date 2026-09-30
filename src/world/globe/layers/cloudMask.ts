// Linear RGB thresholds: sRGB imagery is decoded by three before sampling.
// ponytail: colour cannot distinguish all snow from cloud; subtract static
// Blue Marble whiteness until a daily scientific cloud product is available.
export const CLOUD_LOW = 0.22;
export const CLOUD_HIGH = 0.68;
export const CLOUD_SAT_LOW = 0.12;
export const CLOUD_SAT_HIGH = 0.38;
export const CLOUD_HEIGHT = 0.012;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function cloudWhiteness(r: number, g: number, b: number): number {
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  return smooth(CLOUD_LOW, CLOUD_HIGH, lo) * (1 - smooth(CLOUD_SAT_LOW, CLOUD_SAT_HIGH, (hi - lo) / Math.max(hi, 0.001)));
}

export const CLOUD_MASK_GLSL = `
float cloudWhite(vec3 c) {
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  return smoothstep(${CLOUD_LOW}, ${CLOUD_HIGH}, lo)
    * (1.0 - smoothstep(${CLOUD_SAT_LOW}, ${CLOUD_SAT_HIGH}, (hi-lo)/max(hi, 0.001)));
}
float cloudMask(vec2 uv) {
  // Keep permanent snow/ice on the ground; feather rather than threshold.
  return cloudWhite(texture2D(uDay, uv).rgb)
    * (1.0 - cloudWhite(texture2D(uBase, uv).rgb));
}
`;
