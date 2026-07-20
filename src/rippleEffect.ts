import { Effect } from "postprocessing";
import { Uniform, Vector2 } from "three";

/* Cursor-following liquid ripple — the "mouse flowmap deformation" trick from
 * award-winning WebGL sites, without the full flowmap accumulation-buffer
 * machinery: a single expanding sine ring centered on the pointer, offset via
 * postprocessing's `mainUv` hook so it displaces what's *sampled*, not drawn
 * on top — the ripple bends the scene through it rather than sitting over it. */

const fragmentShader = /* glsl */ `
  uniform vec2 uMouse;
  uniform float uTime;
  uniform float uAspect;

  void mainUv(inout vec2 uv) {
    vec2 delta = uv - uMouse;
    delta.x *= uAspect;
    float dist = length(delta);
    float ripple = sin(dist * 34.0 - uTime * 5.0) * exp(-dist * 5.5) * 0.012;
    vec2 dir = dist > 0.0001 ? delta / dist : vec2(0.0);
    dir.x /= uAspect;
    uv += dir * ripple;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    outputColor = inputColor;
  }
`;

export class RippleEffect extends Effect {
  constructor() {
    super("RippleEffect", fragmentShader, {
      uniforms: new Map<string, Uniform<number | Vector2>>([
        ["uMouse", new Uniform(new Vector2(0.5, 0.5))],
        ["uTime", new Uniform(0)],
        ["uAspect", new Uniform(1)],
      ]),
    });
  }
}
