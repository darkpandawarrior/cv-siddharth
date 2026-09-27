import type { RefObject } from "react";
import type * as THREE from "three";
import { EarthDots } from "../EarthDots.tsx";

export interface EarthLayerProps {
  count: number;
  now: Date;
  tier: 1 | 2 | 3;
  earthRef?: RefObject<THREE.Mesh>;
}

/**
 * LANE L1 (real earth) owns this file. Until it lands, the dots earth
 * stands in so /globe never renders without an earth.
 */
export default function EarthImagery({ count, now, earthRef }: EarthLayerProps) {
  return <EarthDots count={count} now={now} earthRef={earthRef} />;
}
