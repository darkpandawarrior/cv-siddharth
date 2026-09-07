import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { usePresence } from "@playhtml/react";
import { heightAt } from "./heightfield.ts";
import { CHASSIS_RESTING_HEIGHT } from "./craftPhysics.ts";
import { telemetry } from "./telemetry.ts";
import { ghostReadlines } from "./ghostReadlines.ts";
import { shortId } from "./ghostId.ts";

/**
 * PHASE 5 — OTHER LIVE VISITORS AS MOVING POINTS OF LIGHT.
 *
 * The one build phase substrate.md's own phase list never landed
 * (substrate:133, substrate:149-156; night-survey:120-124). Every other
 * driver currently on /playground, rendered as a small cart of their own —
 * the same §9 site-inspection cart shape, simplified to one merged static
 * geometry per instanced part rather than Vehicle.tsx's own multi-mesh JSX
 * group, because up to `MAX_GHOSTS` of these need to share one draw call,
 * not one draw call each.
 *
 * Presence, not the visitor ledger: `visitors.ts`'s G-counter is a
 * deliberately anonymous, position-free aggregate (its own doc comment: "no
 * identifiers, no per-person rows"). A moving cart needs a live (x, z,
 * heading) from somewhere, which is exactly what playhtml's `usePresence`
 * exists for — ephemeral, per-tab, gone the moment that tab closes, never
 * persisted into any document. Nothing here adds an identifying signal
 * beyond what a driving visitor's own position already is, and nothing here
 * is kept once they leave.
 */

const CHANNEL = "world-drivers-v1";
// How often THIS tab broadcasts its own position/heading — a moving light a
// few frames stale reads as smooth; a moving light re-broadcast 60x/second
// is a write every open tab pays for on every frame, for no visible gain.
const PUBLISH_MS = 250;
const MAX_GHOSTS = 8;

type GhostPresence = { x: number; z: number; heading: number };

// §9's cart, ~2.4m x 1.5m — Vehicle.tsx's own HALF constants, restated here
// rather than imported: that file's HALF is private, and the two shapes are
// allowed to drift slightly (a ghost never needs the real car's wheel/trim
// detail) without either file having to renegotiate a shared constant.
const CART_HALF = { x: 0.75, y: 0.28, z: 1.2 };

/** One merged, matte-body cart silhouette — a chassis box plus a smaller
 *  cab box, `mergeGeometries` (Pavilions.tsx's own discipline) into ONE
 *  static geometry so every ghost, however many are live, is one instanced
 *  draw call rather than one full JSX car per visitor. No wheels, no trim,
 *  no wake — "matte body", not a second real car. */
function buildCartGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    new THREE.BoxGeometry(CART_HALF.x * 2, CART_HALF.y * 2, CART_HALF.z * 2),
    new THREE.BoxGeometry(CART_HALF.x * 1.3, CART_HALF.y * 1.6, CART_HALF.z * 0.9).translate(0, CART_HALF.y * 1.7, -CART_HALF.z * 0.15),
  ]);
}

/** The "dim tail strip" — a thin box at the rear, its own instanced mesh
 *  because it carries a different (flat, unlit) material from the matte
 *  body — a second draw call, the same trade Vehicle.tsx's own separate
 *  wheel/trim meshes already make. */
function buildTailGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(CART_HALF.x * 1.3, 0.05, 0.04).translate(0, CART_HALF.y * 0.25, -CART_HALF.z - 0.015);
}

const cartGeometry = buildCartGeometry();
const tailGeometry = buildTailGeometry();
const dummy = new THREE.Object3D();
// §8's own numbers — deliberately NOT Vehicle.tsx's own #0d100f body/§9 tail:
// a ghost reads as a dimmer, quieter object than the driver's own car, not a
// second copy of it.
const GHOST_BODY_HEX = "#0a0d0c";
const GHOST_TAIL_HEX = "#5ee6ff";
const GHOST_TAIL_EMISSIVE_INTENSITY = 0.4;

const idTextureCache = new Map<string, THREE.CanvasTexture | null>();

/** A 6-char id billboard, baked once per peer and cached — same "canvas 2D
 *  fillText, bake once, never a live DOM node" discipline as Fixtures.tsx's
 *  own `bakeYearTexture` and terrainPlate.ts's lane-name stencil (both
 *  chose a synchronous canvas rasterisation over an async `<img>` decoding
 *  an SVG data URI, for the identical "no race before first paint" reason —
 *  see either file's own comment). */
function bakeIdTexture(id: string): THREE.CanvasTexture | null {
  if (idTextureCache.has(id)) return idTextureCache.get(id) ?? null;
  if (typeof document === "undefined") {
    idTextureCache.set(id, null);
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    idTextureCache.set(id, null);
    return null;
  }
  ctx.fillStyle = "#5ee6ff";
  ctx.font = "700 40px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(id, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  idTextureCache.set(id, tex);
  return tex;
}

function GhostIdBillboard({ peerKey, x, z }: { peerKey: string; x: number; z: number }): JSX.Element | null {
  const id = shortId(peerKey);
  const tex = bakeIdTexture(id);
  if (!tex) return null;
  const y = heightAt(x, z) + CHASSIS_RESTING_HEIGHT + 1.1;
  return (
    <Billboard position={[x, y, z]}>
      <mesh>
        <planeGeometry args={[1.1, 0.28]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

export function Ghosts(): JSX.Element {
  const { presences, setMyPresence } = usePresence<GhostPresence>(CHANNEL);
  const cartRef = useRef<THREE.InstancedMesh>(null);
  const tailRef = useRef<THREE.InstancedMesh>(null);
  const lastPublish = useRef(0);

  const cartMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: GHOST_BODY_HEX, roughness: 0.6, metalness: 0.2 }), []);
  // §8's own "one dim #5ee6ff tail strip at emissive 0.4" — a low
  // `emissiveIntensity` on a dark base, not a flat unlit colour, so it stays
  // legibly dimmer than the driver's own full-strength read-line under the
  // same ACES tone curve.
  const tailMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#050605", emissive: GHOST_TAIL_HEX, emissiveIntensity: GHOST_TAIL_EMISSIVE_INTENSITY }),
    [],
  );

  // Only entries with a real, already-published (x, z) — a peer's very
  // first frame after joining, before its own `setMyPresence` has ever
  // fired, has neither yet.
  const ghosts = useMemo(
    () =>
      Array.from(presences.entries())
        .filter(([, p]) => !p.isMe && typeof p.x === "number" && typeof p.z === "number" && typeof p.heading === "number")
        .slice(0, MAX_GHOSTS),
    [presences],
  );

  useFrame(() => {
    const now = performance.now();
    if (now - lastPublish.current >= PUBLISH_MS) {
      lastPublish.current = now;
      setMyPresence({ x: telemetry.x, z: telemetry.z, heading: telemetry.heading });
    }

    const cart = cartRef.current;
    const tail = tailRef.current;
    if (cart && tail) {
      for (let i = 0; i < ghosts.length; i++) {
        const [, p] = ghosts[i];
        dummy.position.set(p.x, heightAt(p.x, p.z) + CHASSIS_RESTING_HEIGHT, p.z);
        dummy.rotation.set(0, p.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        cart.setMatrixAt(i, dummy.matrix);
        tail.setMatrixAt(i, dummy.matrix);
      }
      // three.js's own draw-count knob — Fixtures.tsx's chess-bollard window
      // uses the identical trick to shed instances outside a window; here
      // it's "no live peer for this slot" rather than "too far from the car".
      cart.count = ghosts.length;
      tail.count = ghosts.length;
      cart.instanceMatrix.needsUpdate = true;
      tail.instanceMatrix.needsUpdate = true;
    }

    // Terrain.tsx's own uGhostZ reads this every frame — see
    // ghostReadlines.ts's doc comment for why a sibling singleton, not a prop.
    ghostReadlines.z = ghosts.map(([, p]) => p.z);
  });

  return (
    <>
      <instancedMesh ref={cartRef} args={[cartGeometry, cartMaterial, MAX_GHOSTS]} frustumCulled={false} />
      <instancedMesh ref={tailRef} args={[tailGeometry, tailMaterial, MAX_GHOSTS]} frustumCulled={false} />
      {ghosts.map(([peerKey, p]) => (
        <GhostIdBillboard key={peerKey} peerKey={peerKey} x={p.x} z={p.z} />
      ))}
    </>
  );
}
