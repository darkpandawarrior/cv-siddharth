import { Vector3, type Camera } from "three";
import { subsolarPoint } from "../../lib/sky.ts";
import { GLOBE_RADIUS, latLonToXyz } from "./geoMath.ts";

/** Retained by SceneRig's ref: vectors, projection closure and buffer never
 * allocate in the frame loop. Time-dependent math runs only on clock ticks. */
export function createSceneProbe() {
  const sun = new Vector3();
  const scratch = new Vector3();
  const screen = [0, 0];
  const project = (camera: Camera, size: { width: number; height: number }) => {
    scratch.project(camera);
    screen[0] = (scratch.x + 1) * size.width / 2;
    screen[1] = (1 - scratch.y) * size.height / 2;
  };
  return {
    time(now: Date) {
      const sub = subsolarPoint(now);
      const p = latLonToXyz(sub.lat, sub.lon);
      sun.set(p.x, p.y, p.z).multiplyScalar(GLOBE_RADIUS);
    },
    update(dataset: DOMStringMap, camera: Camera, size: { width: number; height: number }) {
      scratch.copy(sun); project(camera, size);
      const x = screen[0], y = screen[1];
      scratch.set(0, 0, 0); project(camera, size);
      const cx = screen[0], cy = screen[1];
      scratch.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(GLOBE_RADIUS); project(camera, size);
      const dx = x - cx, dy = y - cy;
      dataset.subsolarX = String(Math.round(x));
      dataset.subsolarY = String(Math.round(y));
      dataset.globeX = String(Math.round(cx));
      dataset.globeY = String(Math.round(cy));
      dataset.globeR = String(Math.round(Math.abs(screen[0] - cx)));
      dataset.daySide = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
    },
  };
}
