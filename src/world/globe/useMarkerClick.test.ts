import * as THREE from "three";
import { fleet } from "../../data/store.ts";
import { PUNE } from "../../lib/sky.ts";
import { latLonToXyz } from "./geoMath.ts";
import { APP_RING_RADIUS, buildAppRing } from "./layers/reachApps.ts";
import { SURFACE_EPS } from "./layers/reachAppRing.tsx";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { claimGuideClick, GUIDE_CLICK_RADIUS_PX, nearestScreenPointIndex, nearestGuideClickTarget, registerGuideClickTargets, useMarkerClick } from "./useMarkerClick.ts";

it("selects a single marker tap but leaves a nearby double tap to canvas zoom", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let click!: ReturnType<typeof useMarkerClick>;
    renderToString(createElement(() => { click = useMarkerClick(); return null; }));
    const select = vi.fn();
    click({ clientX: 20, clientY: 30 }, select);
    vi.advanceTimersByTime(350);
    expect(select).toHaveBeenCalledTimes(1);
    click({ clientX: 20, clientY: 30 }, select);
    vi.advanceTimersByTime(100);
    click({ clientX: 21, clientY: 31 }, select);
    vi.advanceTimersByTime(350);
    expect(select).toHaveBeenCalledTimes(1);
    click({ clientX: 20, clientY: 30 }, select);
    vi.advanceTimersByTime(100);
    click({ clientX: 100, clientY: 100 }, select);
    vi.advanceTimersByTime(350);
    expect(select).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it("curated targets win only within the screen radius and unregister on unmount", () => {
  const review = { x: 20, y: 30, priority: 1, select: vi.fn() };
  const city = { x: 21, y: 30, select: vi.fn() };
  const detach = registerGuideClickTargets(() => [review, city]);
  try {
    expect(nearestGuideClickTarget([review], { clientX: 20 + GUIDE_CLICK_RADIUS_PX, clientY: 30 })).toBe(review);
    expect(nearestGuideClickTarget([review, city], { clientX: 20, clientY: 30 })).toBe(review);
    // Touchscreen integer rounding must not promote a city over its review.
    expect(nearestGuideClickTarget([city, review], { clientX: 21, clientY: 30 })).toBe(review);
    expect(claimGuideClick({ clientX: 20, clientY: 30 })).toBe(true);
    expect(review.select).toHaveBeenCalledOnce();
    expect(city.select).not.toHaveBeenCalled();
    expect(claimGuideClick({ clientX: 21 + GUIDE_CLICK_RADIUS_PX + 1, clientY: 30 })).toBe(false);
  } finally { detach(); }
  expect(claimGuideClick({ clientX: 20, clientY: 30 })).toBe(false);
});

it("a half-pixel pointer offset still selects the same dense-ring app", () => {
  const entries = buildAppRing(fleet), top = entries[0];
  const size = { width: 1440, height: 845 };
  const camera = new THREE.PerspectiveCamera(42, size.width / size.height);
  const start = latLonToXyz(PUNE.lat + 12, PUNE.lon);
  camera.position.set(start.x, start.y, start.z).multiplyScalar(26);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const normal = latLonToXyz(PUNE.lat, PUNE.lon), up = new THREE.Vector3(normal.x, normal.y, normal.z);
  const group = new THREE.Group();
  group.position.copy(up).multiplyScalar(6 + SURFACE_EPS);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  group.updateMatrixWorld(true);
  const projected = group.localToWorld(new THREE.Vector3(APP_RING_RADIUS, top.height / 2, 0)).project(camera);
  const point = { x: (projected.x * 0.5 + 0.5) * size.width, y: (-projected.y * 0.5 + 0.5) * size.height };
  const points = entries.map(entry => {
    const p = group.localToWorld(new THREE.Vector3(Math.cos(entry.angle) * APP_RING_RADIUS, entry.height / 2, Math.sin(entry.angle) * APP_RING_RADIUS)).project(camera);
    return { x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height };
  });
  expect(top.name).toBe("SmartBike");
  for (const dx of [-0.5, 0, 0.5]) {
    expect(entries[nearestScreenPointIndex(points, { ...point, x: point.x + dx })]?.id).toBe(top.id);
  }
});
