// LANE X4: the one great-circle arc buildStory() ever draws -- school to the
// first role with a known city (storyModel.ts's own comment: "the one
// journey the data can draw honestly"). Reuses arcGeo.ts's pure sphere math
// (ArcLayer.tsx's own dependency) rather than re-deriving slerp/apex/tube
// sampling for a single arc.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { readColor } from "../../../themeColorThree.ts";
import { GLOBE_RADIUS, latLonToXyz } from "../geoMath.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useStoryChapterState } from "../ui/storyChapterState.ts";
import { arcApexHeight, arcPoint, centralAngleDeg, sampleArc } from "./arcGeo.ts";

const DASH_SPEED = 0.2; // full traversals/second -- a slower, narrative pace than ArcLayer's live dashes

export default function StoryArc({ tier }: { tier: 1 | 2 | 3 }) {
  const chapter = useStoryChapterState((s) => s.chapter);
  const reducedMotion = useReducedMotion();
  const color = useMemo(() => readColor("--color-accent", "#f2a13d"), []);
  const dashRef = useRef<THREE.Mesh>(null);

  // Off by design at T3 (living-ledger tier budgets: "T3 minimal or off"),
  // and whenever the current chapter has no arc of its own.
  const arc = tier === 3 ? undefined : chapter?.arcs[0];

  const built = useMemo(() => {
    if (!arc) return null;
    const from = latLonToXyz(arc.from.lat, arc.from.lon);
    const to = latLonToXyz(arc.to.lat, arc.to.lon);
    const apex = arcApexHeight(centralAngleDeg(from, to));
    const segments = tier === 1 ? 48 : 24;
    const pts = sampleArc(from, to, apex, segments).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    return {
      from, to, apex,
      tube: new THREE.TubeGeometry(curve, segments, 0.02, 6, false),
      glow: new THREE.TubeGeometry(curve, segments, 0.05, 6, false),
    };
    // arc.from/to are STORY_GEO's own frozen literals (stable identity), so
    // the chapter id is the real change signal -- cheaper than a deep
    // compare of two {name,lat,lon} objects every chapter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id, tier]);

  useEffect(() => () => { built?.tube.dispose(); built?.glow.dispose(); }, [built]);

  useFrame(({ clock }) => {
    const mesh = dashRef.current;
    if (!mesh || !built) return;
    // Reduced motion parks the dash mid-arc instead of travelling -- same
    // rule ArcLayer.tsx's own live dashes follow.
    const t = reducedMotion ? 0.5 : (clock.elapsedTime * DASH_SPEED) % 1;
    const p = arcPoint(built.from, built.to, t, built.apex);
    mesh.position.set(p.x, p.y, p.z);
  });

  if (!arc || !built) return null;

  return (
    <group>
      {/* e2e-only DOM probe, ArcLayer.tsx's own pattern: no other lane's
          click handlers exist in this worktree to observe a Three.js scene
          directly, so a hidden data attribute is the real seam. */}
      <Html style={{ display: "none" }}>
        <div data-story-arc aria-hidden />
      </Html>
      <mesh geometry={built.glow}>
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <mesh geometry={built.tube}>
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <mesh ref={dashRef}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      {[arc.from, arc.to].map((place) => {
        const u = latLonToXyz(place.lat, place.lon);
        return (
          <group key={place.name} position={[u.x * GLOBE_RADIUS, u.y * GLOBE_RADIUS, u.z * GLOBE_RADIUS]}>
            <mesh>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            <Html center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
              <span
                data-story-arc-label={place.name}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "#e8efe9",
                  whiteSpace: "nowrap",
                  textShadow: "0 0 3px rgba(0,0,0,0.7)",
                  transform: "translateY(12px)",
                }}
              >
                {place.name}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
