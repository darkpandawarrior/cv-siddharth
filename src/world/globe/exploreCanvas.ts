import { Raycaster, Sphere, Vector2, Vector3, type Camera, type Scene } from "three";
import { GLOBE_RADIUS, xyzToLatLon, type LatLon } from "./geoMath.ts";
import { sceneHandles } from "./globeStore.ts";

export interface SceneAccess { camera: Camera; scene: Scene; invalidate: () => void }

/** The live scene as GlobeScene's SceneRig publishes it (sceneHandles), for
 * DOM surfaces that cannot call useThree. Read at event time; undefined
 * until the Canvas mounts, or if the handles belong to another canvas. */
export function canvasState(canvas: HTMLCanvasElement): SceneAccess | undefined {
  const { camera, scene, invalidate, canvas: live } = sceneHandles;
  if (!camera || !scene || !invalidate || live !== canvas) return undefined;
  return { camera, scene, invalidate };
}
export function surfacePicker(canvas: HTMLCanvasElement, get: () => { camera: Camera } | undefined) {
  const ray = new Raycaster(), pointer = new Vector2(), hit = new Vector3();
  const earth = new Sphere(new Vector3(), GLOBE_RADIUS);
  return (clientX: number, clientY: number): LatLon | null => {
    const state = get();
    if (!state) return null;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    pointer.set((clientX - box.left) / box.width * 2 - 1, 1 - (clientY - box.top) / box.height * 2);
    ray.setFromCamera(pointer, state.camera);
    return ray.ray.intersectSphere(earth, hit) ? xyzToLatLon(hit) : null;
  };
}

/** LANE V4 (hover readout): desktop-mouse-only pointer tracking, reusing
 * `surfacePicker`'s raycast. Any button held down (dragging/orbiting) or a
 * non-mouse pointer (touch/pen -- "touch keeps today's tap behaviour")
 * reports `null`, the same "hidden" outcome as leaving the canvas or missing
 * the globe entirely, so the caller has one branch for all three. */
export function surfaceHover(canvas: HTMLCanvasElement, pick: ReturnType<typeof surfacePicker>, onMove: (point: (LatLon & { clientX: number; clientY: number }) | null) => void) {
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.buttons) { onMove(null); return; }
    const point = pick(event.clientX, event.clientY);
    onMove(point ? { ...point, clientX: event.clientX, clientY: event.clientY } : null);
  };
  const leave = () => onMove(null);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerleave", leave);
  return () => { canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerleave", leave); };
}

/** Movement is tracked throughout, so dragging away and back isn't a click. */
export function surfaceClicks(canvas: HTMLCanvasElement, pick: ReturnType<typeof surfacePicker>, click: (point: LatLon) => void) {
  let start: { x: number; y: number; id: number } | null = null;
  let dragged = false;
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) { dragged = true; return; }
    start = { x: event.clientX, y: event.clientY, id: event.pointerId }; dragged = false;
  };
  const move = (event: PointerEvent) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) dragged = true; };
  const cancel = () => { start = null; };
  const up = (event: PointerEvent) => {
    if (!start || event.pointerId !== start.id) return;
    move(event);
    const accept = !dragged;
    start = null;
    if (accept) { const point = pick(event.clientX, event.clientY); if (point) click(point); }
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("pointerleave", cancel);
  return () => {
    canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", cancel); canvas.removeEventListener("pointerleave", cancel);
  };
}
