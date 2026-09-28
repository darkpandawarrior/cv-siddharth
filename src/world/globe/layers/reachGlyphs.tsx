// LANE W6: the "now playing" vinyl and lichess knight glyphs, floating just
// above Pune -- both continuous presence state (reachPresence.ts), never
// drawn while absent ("neither shows when not playing/online"). Mounted at
// T1 only (ReachLayer.tsx), so both are always `animate`-eligible here;
// reduced motion still freezes the vinyl's rotation.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { PUNE } from "../../../lib/sky.ts";
import { readColor } from "../../../themeColorThree.ts";
import { useGlobe } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { chess } from "../../../data/chess.ts";
import type { SpotifyGlyph, LichessGlyph } from "./reachPresence.ts";

const FLOAT_HEIGHT = 0.55; // world units above the surface -- same order as PulseLayer's own PACKET_RISE.
const LATERAL_OFFSET = 0.26;
const VINYL_RADIUS = 0.09;
const ROTATE_SPEED = 0.6; // rad/s -- "slowly turning", "subtle".

// data/chess.ts is committed data, read once at module scope (matches
// globeFacts.ts's own convention of reading data/* directly rather than
// through a hook).
const LICHESS_URL = chess.platforms.find((p) => p.id === "lichess")!.url;

export function ReachGlyphs({ spotify, lichess }: { spotify: SpotifyGlyph | null; lichess: LichessGlyph | null }) {
  const select = useGlobe((s) => s.select);
  const reducedMotion = useReducedMotion();
  const probe = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);
  const warn = useMemo(() => readColor("--color-warn", "#f0883e"), []);

  const normal = useMemo(() => {
    const p = latLonToXyz(PUNE.lat, PUNE.lon);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, []);
  const tangent = useMemo(() => {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3().crossVectors(worldUp, normal);
    return t.lengthSq() > 1e-6 ? t.normalize() : new THREE.Vector3(1, 0, 0);
  }, [normal]);
  const floatBase = useMemo(() => normal.clone().multiplyScalar(GLOBE_RADIUS + FLOAT_HEIGHT), [normal]);
  const vinylPos = useMemo(() => floatBase.clone().addScaledVector(tangent, -LATERAL_OFFSET / 2), [floatBase, tangent]);
  const knightPos = useMemo(() => floatBase.clone().addScaledVector(tangent, LATERAL_OFFSET / 2), [floatBase, tangent]);

  const vinylRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (!spotify || reducedMotion) return;
    const g = vinylRef.current;
    if (g) g.rotation.z += delta * ROTATE_SPEED;
  });

  function pickSpotify() {
    if (!spotify) return;
    select({
      id: "reach-spotify",
      kind: "reach-spotify",
      title: spotify.track,
      rows: [
        { label: "track", value: spotify.track },
        { label: "artist", value: spotify.artist },
      ],
      source: "Spotify via /api/spotify",
      live: true,
    });
  }

  function pickLichess() {
    if (!lichess) return;
    select({
      id: "reach-lichess",
      kind: "reach-lichess",
      title: "lichess.org",
      rows: [
        { label: "status", value: lichess.label },
        { label: "link", value: LICHESS_URL },
      ],
      source: "lichess.org via /api/signals",
      live: true,
    });
  }

  return (
    <group>
      {spotify && (
        <group ref={vinylRef} position={vinylPos} onClick={pickSpotify}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[VINYL_RADIUS, VINYL_RADIUS * 0.16, 8, 24]} />
            <meshBasicMaterial color={probe} toneMapped={false} transparent opacity={0.85} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[VINYL_RADIUS * 0.22, 16]} />
            <meshBasicMaterial color={probe} toneMapped={false} transparent opacity={0.55} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {lichess && (
        <group position={knightPos} onClick={pickLichess}>
          {/* A simple two-box "L" silhouette -- a knight-icon abstraction,
              never an emoji or imported chess art. */}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.05, 0.16, 0.05]} />
            <meshBasicMaterial color={warn} toneMapped={false} />
          </mesh>
          <mesh position={[0.045, 0.12, 0]}>
            <boxGeometry args={[0.14, 0.055, 0.05]} />
            <meshBasicMaterial color={warn} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
