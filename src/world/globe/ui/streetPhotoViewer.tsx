import { useEffect, useRef } from "react";
import * as THREE from "three";
import { formatCaptureDate, type StreetPhoto } from "../streetPhotos.ts";

/** WAVE 2 LANE W3 (street level) owns this file. */

// Drag-to-look, wheel-to-zoom bounds for the 360 sphere viewer's FOV — same
// shape as CameraDirector.tsx's own ground-view drag/wheel handling, restated
// here rather than imported since this viewer runs entirely outside the R3F
// Canvas (a plain DOM `<div>` this lane owns, not a scene component).
const FOV_MIN = 30;
const FOV_MAX = 100;
const DRAG_YAW_SPEED = 0.15; // degrees per pixel dragged
const DRAG_PITCH_SPEED = 0.15;
const PITCH_LIMIT_DEG = 85; // clamps just short of straight up/down

/** An inside-out sphere showing one equirectangular 360 capture. Vanilla
 *  three.js (own scene/camera/renderer), not react-three-fiber: this viewer
 *  is a DOM overlay above the globe's own Canvas, not a layer inside it, so
 *  there is no R3F render loop here to hook into. Fully created on mount and
 *  fully disposed on unmount/URL change — no idle WebGL context left running
 *  once the viewer closes (house perf rule: dispose GPU resources). */
function Panorama360({ url }: { url: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // Radius 500, geometry scaled -1 on X: the standard "view from inside a
    // sphere" flip — without it the texture's winding order faces outward
    // and the visible side of every triangle points away from the camera.
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);
    const texture = new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    let yaw = 0;
    let pitch = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const lookTarget = new THREE.Vector3();

    const applyLook = () => {
      const yawRad = (yaw * Math.PI) / 180;
      const pitchRad = (pitch * Math.PI) / 180;
      lookTarget.set(Math.cos(pitchRad) * Math.sin(yawRad), Math.sin(pitchRad), Math.cos(pitchRad) * Math.cos(yawRad));
      camera.lookAt(lookTarget);
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * DRAG_YAW_SPEED;
      pitch = Math.max(-PITCH_LIMIT_DEG, Math.min(PITCH_LIMIT_DEG, pitch + (e.clientY - lastY) * DRAG_PITCH_SPEED));
      lastX = e.clientX;
      lastY = e.clientY;
      applyLook();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, camera.fov + e.deltaY * 0.05));
      camera.updateProjectionMatrix();
    };

    const el = renderer.domElement;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
  }, [url]);

  return <div ref={mountRef} className="h-full w-full touch-none" data-street-panorama />;
}

/** The panorama/lightbox modal a photo-marker click opens: a three.js
 *  inside-out sphere for a 360 capture, a plain `<img>` lightbox otherwise —
 *  both carrying the same date/author/licence line underneath (house rule:
 *  Panoramax pictures are typically CC-BY-SA, and a photo's licence and
 *  author are never dropped from the page that shows it). */
export default function StreetPhotoViewer({ photo, onClose }: { photo: StreetPhoto; onClose: () => void }) {
  const date = formatCaptureDate(photo.capturedAt);
  return (
    <div
      data-street-photo-viewer
      role="dialog"
      aria-modal="true"
      aria-label={photo.is360 ? "360 street photo" : "Street photo"}
      className="pointer-events-auto absolute inset-0 z-10 flex flex-col glass-panel"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2 font-mono text-xs text-zinc-300">
        <span>{photo.is360 ? "360 photo: drag to look, scroll to zoom" : "Street photo"}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-line px-2 py-1 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Close
        </button>
      </div>
      <div className="relative min-h-0 flex-1 bg-black">
        {photo.is360 ? (
          // sd (fixed 2048px width), not hd: the right size for a WebGL
          // texture — hd is "highest resolution available", often much
          // larger than any screen this viewer renders to.
          <Panorama360 url={photo.sdUrl} />
        ) : (
          <img src={photo.hdUrl} alt="Street-level photo, Panoramax" className="h-full w-full object-contain" />
        )}
      </div>
      <div data-street-photo-credit className="shrink-0 border-t border-line px-3 py-2 font-mono text-xs text-zinc-400">
        {date ? `${date} · ` : ""}
        {photo.author}
        {" · "}
        {photo.licenceUrl ? (
          <a href={photo.licenceUrl} target="_blank" rel="noreferrer" className="underline hover:text-accent">
            {photo.licence}
          </a>
        ) : (
          photo.licence
        )}
      </div>
    </div>
  );
}
