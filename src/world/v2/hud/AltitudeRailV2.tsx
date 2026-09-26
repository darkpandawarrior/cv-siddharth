import { AltitudeRail } from "../../AltitudeRail.tsx";

/**
 * The STREET-side mount of the altitude rail (living-ledger-spec.md#6.2,
 * this lane's task list): `RoomFrame` (rooms.tsx) already mounts
 * `AltitudeRail` directly for /map and /globe, so world-v2's HUD gets the
 * same rail without either file importing the other. P2-19's
 * `hud/*.tsx` glob (layers.ts) discovers this file by its two exports
 * (`export default` + `layer`), the contract every hud layer follows, so
 * `HudV2.tsx` is never edited to add it.
 *
 * `order: 90` docks it near the top-right, above the ledger panel toggle and
 * below nothing this lane owns an opinion about: a later hud layer is free
 * to sit at a lower order without this file changing.
 */
export default function AltitudeRailV2() {
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10">
      <AltitudeRail />
    </div>
  );
}

export const layer = { id: "altitude-rail", order: 90 };
