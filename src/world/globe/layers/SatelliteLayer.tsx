import { OrbitLayer } from "../OrbitLayer.tsx";

/**
 * LANE L3 (real orbits) owns this file. Until it lands, the synthetic
 * ambient orbits stand in, at the tier they always ran at.
 */
export default function SatelliteLayer({ tier }: { now: Date; tier: 1 | 2 | 3 }) {
  return tier === 1 ? <OrbitLayer /> : null;
}
