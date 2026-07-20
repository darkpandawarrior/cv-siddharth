import { BlendFunction, Effect } from "postprocessing";
import { Color, Uniform } from "three";

/* A real-time ASCII/terminal postprocessing effect: no bitmap font texture,
 * the "glyphs" are generated procedurally per screen cell from a signed-
 * distance ramp keyed to that cell's sampled luminance — the same approach
 * Codrops' "Efecto" piece describes. Runs as one extra fragment-shader pass
 * inside the existing EffectComposer, so it's cheap: no render targets, no
 * extra draw calls beyond the composite. */

const fragmentShader = /* glsl */ `
  uniform float uCellSize;
  uniform vec3 uColor;

  float glyphMask(vec2 cellUv, float lum) {
    vec2 p = cellUv - 0.5;
    float d = length(p);
    // Cross/plus shape reads as "denser" than a circle at the same radius —
    // gives mid tones a more character-like silhouette than a plain dot ramp.
    float cross = min(abs(p.x), abs(p.y));
    if (lum > 0.82) return 1.0;
    if (lum > 0.6) return step(d, 0.46);
    if (lum > 0.4) return step(cross, 0.14);
    if (lum > 0.22) return step(d, 0.16);
    if (lum > 0.08) return step(d, 0.07);
    return 0.0;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 cells = resolution / uCellSize;
    vec2 cellUv = fract(uv * cells);
    vec2 sampleUv = (floor(uv * cells) + 0.5) / cells;
    vec4 src = texture2D(inputBuffer, sampleUv);
    float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    float glyph = glyphMask(cellUv, lum);
    outputColor = vec4(uColor * glyph, 1.0);
  }
`;

export class AsciiEffect extends Effect {
  constructor({ cellSize = 9, color = "#3ddc84" }: { cellSize?: number; color?: string } = {}) {
    super("AsciiEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uCellSize", new Uniform(cellSize)],
        ["uColor", new Uniform(new Color(color))],
      ]),
    });
  }
}
