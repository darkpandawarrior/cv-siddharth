import { expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { createSceneProbe } from "./sceneProbe.ts";
import { GLOBE_RADIUS, latLonToXyz } from "./geoMath.ts";
import { subsolarPoint } from "../../lib/sky.ts";

it("keeps the projection correct across camera movement, resizing and clock ticks", () => {
  const probe = createSceneProbe();
  const camera = new PerspectiveCamera(42, 1, 0.1, 1000);
  const el = { dataset: {} as DOMStringMap };
  for (const [width, height, z, iso] of [[1440, 900, 26, "2026-09-27T12:00:00Z"], [390, 844, 30, "2026-09-27T18:00:00Z"]] as const) {
    camera.position.set(4, 2, z); camera.lookAt(0, 0, 0);
    camera.aspect = width / height; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const now = new Date(iso);
    probe.time(now); probe.update(el.dataset, camera, { width, height });
    const sub = subsolarPoint(now), p = latLonToXyz(sub.lat, sub.lon);
    const sun = new Vector3(p.x, p.y, p.z).multiplyScalar(GLOBE_RADIUS).project(camera);
    expect(el.dataset.subsolarX).toBe(String(Math.round((sun.x + 1) * width / 2)));
    expect(el.dataset.subsolarY).toBe(String(Math.round((1 - sun.y) * height / 2)));
    expect(Number(el.dataset.globeR)).toBeGreaterThan(0);
    const first = { ...el.dataset };
    probe.update(el.dataset, camera, { width, height });
    expect(el.dataset).toEqual(first);
  }
});
