/**
 * THE BOW LANTERN — this lane's own task list (idea-atlas.md SYS-6: "the
 * bow lantern's flame flickers on a slow beat only while `isPlaying`");
 * world-v2-spec.md §4.2's own spawn shot already puts a `brass_diya_lantern`
 * on the hodi's bow. No GLB is mounted for that lantern yet (Hodi.tsx's own
 * hull is still a box placeholder, per its own doc comment), so this layer
 * carries a small flame billboard + point light of its own rather than
 * waiting on a kit that hasn't landed.
 *
 * Reads `/api/spotify` directly through the SAME `useLiveSignal` bus
 * `useNowModel.ts` already polls (one store per URL — a second caller here
 * costs no second fetch, that file's own doc comment), rather than pulling
 * in the whole `useNowModel` aggregate (sky/weather/activity/ops/aircraft/
 * tle/presence) for one boolean this layer doesn't otherwise need.
 *
 * ponytail: mirrors `layers/Echo.tsx`'s own parallel deterministic
 * simulation of the live hull's position (see that file's module doc for
 * why — `Hodi.tsx` isn't in this lane's `owns`, so nothing outside it can
 * read the real boat's live ref). Duplicated here rather than factored into
 * a shared hook: `layers.ts` mounts every layer with no shared context, and
 * two ~6-line simulations are a smaller diff than a new cross-layer seam
 * for one field.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { spawnState, step, type HodiState } from "../driveSpline.ts";
import { valleyZ } from "../valley.ts";
import { input } from "../../input.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import type { SpotifyNow } from "../../../../api/_lib/spotify-handler.ts";
import hullProfile from "../hullProfile.json" with { type: "json" };

export const layer = { id: "bow-lantern", order: 45 };

const MAX_DT = 1 / 20;
/** hullProfile.ts's own note: t in [-1, 1], bow at the negative end. Half
 *  the hull length places the lantern right at the bow tip. */
const BOW_OFFSET_M: number = hullProfile.length / 2;
const LANTERN_HEIGHT_M = 1.1;
const FLAME_COLOR = "#f2a13d"; // world-v2-spec §0 rule 3: amber = fire/light.
const IDLE_INTENSITY = 1.1;
const FLICKER_HZ = 2.4; // "a slow beat"

export default function BowLantern() {
  const reducedMotion = useReducedMotion();
  const { data: radio } = useLiveSignal<SpotifyNow>("/api/spotify");
  const isPlaying = radio?.isPlaying ?? false;

  const liveStateRef = useRef<HodiState>(spawnState(valleyZ("2023-02")));
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const flameMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: FLAME_COLOR, toneMapped: false }), []);
  useEffect(() => () => flameMaterial.dispose(), [flameMaterial]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DT);
    const before = liveStateRef.current;
    const next = step(before, { steer: input.steer, throttle: input.throttle }, dt, { reducedMotion });
    liveStateRef.current = next;

    const group = groupRef.current;
    if (group) {
      group.position.set(next.x + Math.sin(next.heading) * BOW_OFFSET_M, LANTERN_HEIGHT_M, next.z + Math.cos(next.heading) * BOW_OFFSET_M);
      group.rotation.y = next.heading;
    }

    const light = lightRef.current;
    if (light) {
      if (isPlaying && !reducedMotion) {
        // A slow beat, not a strobe — one soft sine on top of the idle
        // level, the same "ramped, never a bare .value=" discipline
        // audio.ts's own updateEngine uses for its own continuous values.
        const beat = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * FLICKER_HZ * Math.PI * 2);
        light.intensity = IDLE_INTENSITY * (0.7 + 0.5 * beat);
      } else {
        light.intensity = IDLE_INTENSITY;
      }
    }
  });

  return (
    <group ref={groupRef} name="bow-lantern">
      <pointLight ref={lightRef} color={FLAME_COLOR} intensity={IDLE_INTENSITY} distance={6} decay={2} />
      <mesh material={flameMaterial}>
        <coneGeometry args={[0.09, 0.22, 8]} />
      </mesh>
      {/* G11: WebGL pixels are asserted only through data-* attributes, never
       *  pixel probes — this is the one DOM surface a verifier reads. */}
      <Html style={{ display: "none" }}>
        <div aria-hidden="true" data-bow-lantern-playing={isPlaying} />
      </Html>
    </group>
  );
}
