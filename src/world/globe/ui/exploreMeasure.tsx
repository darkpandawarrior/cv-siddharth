import { useEffect } from "react";
import { Line2, LineGeometry, LineMaterial } from "three-stdlib";
import { readColor } from "../../../themeColorThree.ts";
import { canvasState } from "../exploreCanvas.ts";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { greatCircle } from "../exploreMath.ts";
import { useExplore } from "../exploreState.ts";

// LANE P1 (wave 7): swapped plain THREE.Line/LineBasicMaterial for the same
// Line2/LineMaterial pair drei's own <Line> wraps (already used declaratively
// at layers/SatelliteLayer.tsx) -- a browser's raw WebGL line is clamped to
// ~1px everywhere regardless of devicePixelRatio, so the measurement arc read
// as a fuzzy hairline on a retina display; LineMaterial draws screen-space
// quads instead, crisp at any resolution. This component mounts OUTSIDE the
// R3F tree (a DOM sibling in ExploreBar.tsx, not JSX inside Canvas), so it
// uses the imperative three-stdlib classes directly rather than drei's own
// JSX <Line> (which needs R3F's reconciler/useThree), and tracks canvas
// resize itself instead of reading R3F's reactive `size` state.
const LINE_WIDTH_PX = 2;

/** Imperative scene attachment from the DOM mount keeps this independent
 * of the countries toggle. No frame loop, no per-frame allocation. */
export default function ExploreMeasure({ canvas, tier }: { canvas: HTMLCanvasElement | null; tier: 1 | 2 | 3 }) {
  const points = useExplore(s => s.points);
  useEffect(() => {
    if (!canvas || points.length !== 2) return;
    const state = canvasState(canvas);
    if (!state) return;
    const positions = greatCircle(points[0], points[1], tier === 1 ? 128 : tier === 2 ? 64 : 32);
    // A small lift prevents long segment chords dipping into the earth.
    for (let i = 0; i < positions.length; i++) positions[i] *= GLOBE_RADIUS + 0.04;
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    // `color` set as a property, not a constructor param: three-stdlib's own
    // .d.ts types the constructor's `color` as a bare hex number, but the
    // runtime setter (and drei's own <Line>) assigns a real THREE.Color --
    // the property setter is typed correctly, so it takes `readColor`'s
    // Color instance with no cast.
    const material = new LineMaterial({ toneMapped: false, linewidth: LINE_WIDTH_PX });
    material.color = readColor("--color-probe", "#5ee6ff");
    material.resolution.set(canvas.clientWidth, canvas.clientHeight);
    const line = new Line2(geometry, material);
    line.name = "P1 measurement (Line2)";
    state.scene.add(line); state.invalidate();
    const onResize = () => { material.resolution.set(canvas.clientWidth, canvas.clientHeight); state.invalidate(); };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);
    return () => { resizeObserver.disconnect(); state.scene.remove(line); geometry.dispose(); material.dispose(); state.invalidate(); };
  }, [canvas, points, tier]);
  return null;
}
