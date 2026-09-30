// LANE X4 (base arc), extended by LANE C3 (progressive draw for the life
// journey film): the great-circle arc(s) the story can draw honestly --
// either "My story"'s own single school-to-role arc, or, while the film
// plays, the current film chapter's incoming arc, growing from origin to
// destination over that chapter's own dwell time instead of appearing fully
// formed. Reuses arcGeo.ts's pure sphere math (ArcLayer.tsx's own
// dependency) rather than re-deriving slerp/apex/tube sampling.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { readColor } from "../../../themeColorThree.ts";
import { GLOBE_RADIUS, latLonToXyz } from "../geoMath.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useStoryChapterState } from "../ui/storyChapterState.ts";
import { useStoryFilmState } from "../ui/storyFilmState.ts";
import { arcApexHeight, arcPoint, centralAngleDeg, sampleArc } from "./arcGeo.ts";

const DASH_SPEED = 0.2; // full traversals/second -- a slower, narrative pace than ArcLayer's live dashes

export default function StoryArc({ tier }: { tier: 1 | 2 | 3 }) {
  const storyChapter = useStoryChapterState((s) => s.chapter);
  const filmChapter = useStoryFilmState((s) => s.chapter);
  const filmProgress = useStoryFilmState((s) => s.progress);
  // The film and "My story" can never both be open (ui/StoryPlayer.tsx's own
  // mutual exclusion), so whichever has an active chapter wins; this file
  // never has to reconcile two chapters at once.
  const chapter = filmChapter ?? storyChapter;
  const reducedMotion = useReducedMotion();
  // living-ledger's own Colour rule: claim/live things use one of the four
  // globe semantic tokens, never a brand token -- --color-accent is the
  // site-wide UI amber (buttons, focus rings), not a globe-scene colour.
  // --color-alt marks this as the one narrative arc, distinct from
  // ArcLayer's live --color-probe visitor arcs.
  const color = useMemo(() => readColor("--color-alt", "#db61ff"), []);
  const dashRef = useRef<THREE.Mesh>(null);

  // Off by design at T3 (living-ledger tier budgets: "T3 minimal or off"),
  // and whenever the current chapter has no arc of its own.
  const arc = tier === 3 ? undefined : chapter?.arcs[0];
  // Outside the film (or under reduced motion, "flights become cuts") the
  // arc is fully formed the instant it appears -- exactly the pre-C3 look.
  const drawProgress = filmChapter && !reducedMotion ? filmProgress : 1;

  const built = useMemo(() => {
    if (!arc) return null;
    const from = latLonToXyz(arc.from.lat, arc.from.lon);
    const to = latLonToXyz(arc.to.lat, arc.to.lon);
    const apex = arcApexHeight(centralAngleDeg(from, to));
    const segments = tier === 1 ? 48 : 24;
    const full = sampleArc(from, to, apex, segments);
    // At least 2 points so the curve stays valid; never more than every
    // sampled point, so this can't overshoot the finished arc mid-flight.
    const shown = Math.max(2, Math.round(full.length * drawProgress));
    const pts = full.slice(0, shown).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    return {
      from, to, apex,
      tube: new THREE.TubeGeometry(curve, Math.max(1, shown - 1), 0.02, 6, false),
      glow: new THREE.TubeGeometry(curve, Math.max(1, shown - 1), 0.05, 6, false),
    };
    // arc.from/to are STORY_GEO's own frozen literals (stable identity), so
    // the chapter id is the real change signal -- cheaper than a deep
    // compare of two {name,lat,lon} objects every chapter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id, tier, drawProgress]);

  useEffect(() => () => { built?.tube.dispose(); built?.glow.dispose(); }, [built]);

  useFrame(({ clock }) => {
    const mesh = dashRef.current;
    if (!mesh || !built) return;
    // In the film, the dash IS the growing tip -- it marks exactly how far
    // the flight has drawn, not a looping decoration. Outside the film (or
    // under reduced motion, which parks it mid-arc, same rule ArcLayer.tsx's
    // own live dashes follow) it keeps "My story"'s original ambient loop.
    const t = filmChapter ? drawProgress : reducedMotion ? 0.5 : (clock.elapsedTime * DASH_SPEED) % 1;
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
        <div data-story-arc data-family-move={arc.familyMove || undefined} aria-hidden />
      </Html>
      <mesh geometry={built.glow}>
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={arc.familyMove ? 0.06 : 0.12} depthWrite={false} />
      </mesh>
      <mesh geometry={built.tube}>
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={arc.familyMove ? 0.35 : 0.85} />
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
