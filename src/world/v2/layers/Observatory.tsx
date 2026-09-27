/**
 * The Observatory canvas layer (this lane's own task list; world-v2-spec.md
 * §5.19: "seen from the Sangam only as a pale spire on the far east
 * ridge... in its own gorge"). This file's only job is mounting the fenced
 * `fiction/` subtree at its one fixed position in the valley, it holds no
 * geometry, no palette and no anthology data of its own, so it never has to
 * appear on `fictionFence.test.ts`'s own scan (that test walks
 * `src/world/v2/fiction/*` and the three named outward files; this layer is
 * neither, and stays a thin mount point on purpose).
 */
import { TaraKund } from "../fiction/TaraKund.tsx";
import { ObservatorySensor } from "../fiction/ObservatorySensor.tsx";
import { BOUNDS } from "../valley.ts";

export const layer = { id: "observatory", order: 90 };

/** Beyond the east ridge (terrain.ts's own x = +300..+384 crest), its own
 *  gorge, far enough past `BOUNDS.xMax` that no Sangam sightline groups it
 *  with a case-study landmark (§5.19's own rule). */
const OBSERVATORY_POSITION: readonly [number, number, number] = [BOUNDS.xMax + 70, 0, 220];

export default function Observatory() {
  return (
    <>
      <group position={OBSERVATORY_POSITION}>
        <TaraKund />
      </group>
      {/* Not nested inside the group above: ObservatorySensor's own approach
          test compares raw world-space coordinates (it has no shared
          boat-telemetry export to read a transformed local frame against,
          see its own doc comment), so it takes the same absolute position
          directly rather than relying on scene-graph nesting to supply it. */}
      <ObservatorySensor position={OBSERVATORY_POSITION} />
    </>
  );
}
