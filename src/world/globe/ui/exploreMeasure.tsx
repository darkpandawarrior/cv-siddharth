import { useEffect } from "react";
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial } from "three";
import { readColor } from "../../../themeColorThree.ts";
import { canvasState } from "../exploreCanvas.ts";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { greatCircle } from "../exploreMath.ts";
import { useExplore } from "../exploreState.ts";

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
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({ color: readColor("--color-probe", "#5ee6ff"), toneMapped: false });
    const line = new Line(geometry, material);
    line.name = "W11 measurement";
    state.scene.add(line); state.invalidate();
    return () => { state.scene.remove(line); geometry.dispose(); material.dispose(); state.invalidate(); };
  }, [canvas, points, tier]);
  return null;
}
