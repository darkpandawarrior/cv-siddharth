/**
 * The one door into Tara Kund (this lane's own task list; world-v2-spec.md
 * §5.19: "entered by a hard-coded sensor, never a `Destination`"). Modelled
 * on `Pavilions.tsx`'s own approach-box sensor (an AABB test run once a
 * frame, no physics engine), with one deliberate difference: v2 has no
 * shared boat-position singleton yet (v1's `telemetry.ts` has no v2
 * counterpart, `Hodi.tsx` keeps its state in its own refs). The chase
 * camera sits a fixed, small offset behind the hodi at all times
 * (`Hodi.tsx`'s own `CHASE_BACK`/`CHASE_UP`), so `state.camera.position` is
 * an honest stand-in for "the boat is here" at this sensor's own generous
 * scale.
 * ponytail: read a real shared boat-position export instead, the day one
 * lands (v2's `Hodi.tsx` gains what v1's `telemetry.ts` already has).
 *
 * The hard-coded target is `/anthology` (never a `Destination`, never shown
 * in `LandmarkPanel`/`LandmarkPanelV2`, those only ever read GRAMMAR's
 * `landmark-facet` rule, which this file never touches). A hidden, always
 * in the DOM `<button>` offers the SAME "enter" action `LandmarkList.tsx`'s
 * own doc comment argues for over instrumenting the WebGL scene graph for
 * focus: a visitor who never drives close enough (or who is on a keyboard)
 * can still reach the one fictional room in this world.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useNavigate } from "@tanstack/react-router";

export interface ObservatorySensorProps {
  position: readonly [number, number, number];
  halfExtents?: readonly [number, number, number];
}

const DEFAULT_HALF_EXTENTS: readonly [number, number, number] = [24, 40, 24];

function insideApproach(
  pos: { x: number; y: number; z: number },
  center: readonly [number, number, number],
  half: readonly [number, number, number],
): boolean {
  return (
    Math.abs(pos.x - center[0]) <= half[0] &&
    Math.abs(pos.y - center[1]) <= half[1] &&
    Math.abs(pos.z - center[2]) <= half[2]
  );
}

export function ObservatorySensor({ position, halfExtents = DEFAULT_HALF_EXTENTS }: ObservatorySensorProps) {
  const navigate = useNavigate();
  const { camera } = useThree();
  const insideRef = useRef(false);

  const enter = () => navigate({ to: "/anthology" });

  useFrame(() => {
    const inside = insideApproach(camera.position, position, halfExtents);
    if (inside && !insideRef.current) enter();
    insideRef.current = inside;
  });

  return (
    // No `display: none` on the wrapper: unlike this lane's own hidden DOM
    // mirrors (Kites.tsx/Fireflies.tsx), this button is meant to actually be
    // focusable and clickable, `sr-only` (LandmarkList.tsx's own idiom) is
    // what keeps it invisible without also making it unreachable.
    <Html>
      <button
        type="button"
        data-observatory-sensor="tara-kund"
        aria-label="Enter the Tara Kund observatory"
        className="sr-only"
        onClick={enter}
      />
    </Html>
  );
}

export default ObservatorySensor;
