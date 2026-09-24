import { useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import { MathUtils } from "three";
import type { Ops, OpsRun } from "../api/_lib/ops-handler.ts";
import { useStudioModel } from "./three/models.ts";
import { useLiveSignal } from "./lib/useLiveSignal.ts";

/**
 * The Blueprint Room's centrepiece — a real lathe-turned Blender asset
 * (scripts/blender/blueprint-instrument.py, the studio-orbit materials)
 * standing in for the procedural torus-knot hologram (HoloCore) that used to
 * sit here. React.lazy-imported from Blueprint3D.tsx so its GLTFLoader
 * weight and the GLB fetch both land in their own chunk rather than the
 * BlueprintRoom chunk, which had 63 bytes of headroom before this split.
 *
 * P8 (reality-spec.md#R3, master-plan.md#M50): the dial's needle reads live
 * CI health from the same `/api/ops` bus `/ops` already polls. P1-02
 * depends only on P1-00, not on the wow-pass Blender lane that names the
 * 'needle' node: when the loaded GLB predates that node, nothing rotates,
 * but the reading is still written to `data-needle`/`data-needle-source` so
 * a later model swap (P1-wire) lights up without a code change here.
 */

/** The gauge's full sweep. Exported so e2e/studio-sky.spec.ts computes the
 *  same angle from the fixture rather than a second literal that can drift
 *  out of step with this file (0 = all-red rest position, RANGE = all
 *  green). */
export const NEEDLE_RANGE_DEG = 180;

/** `/blueprint`, `/ops` and the world's keystone all read the newest CI
 *  runs off the same URL, P4's shared bus, so mounting this room adds no
 *  second timer against `/api/ops`. */
const OPS_URL = "/api/ops";
const OPS_INTERVAL_MS = 120_000;

function istHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

/** The newest run of each workflow: "green/total" per the spec means the
 *  board's current state, not a tally across every historical run. */
function newestPerWorkflow(runs: readonly OpsRun[]): OpsRun[] {
  const byWorkflow = new Map<string, OpsRun>();
  for (const run of runs) {
    const prev = byWorkflow.get(run.workflow);
    if (!prev || new Date(run.at).getTime() > new Date(prev.at).getTime()) byWorkflow.set(run.workflow, run);
  }
  return [...byWorkflow.values()];
}

/** Pure reading, extracted so the disconnected/stale/live branching is
 *  testable without mounting the Canvas (no `@react-three/test-renderer`
 *  dependency, same reasoning as sky.ts/useSky.ts's split). */
export function needleReading(ops: Ops | null): { angleDeg: number; caption: string } {
  if (!ops?.connected) return { angleDeg: 0, caption: "CI unavailable right now" };
  const newest = newestPerWorkflow(ops.runs);
  const total = newest.length;
  const green = newest.filter((r) => r.conclusion === "success").length;
  const angleDeg = total > 0 ? (green / total) * NEEDLE_RANGE_DEG : 0;
  const newestAt = newest.reduce((max, r) => (r.at > max ? r.at : max), newest[0]?.at ?? "");
  const caption = !newestAt
    ? "CI unavailable right now"
    : ops.stale
      ? `last good, ${istHHMM(newestAt)}`
      : `live · ${istHHMM(newestAt)}`;
  return { angleDeg, caption };
}

export default function BlueprintInstrument() {
  const { scene } = useStudioModel("blueprint-instrument");
  // `scene` is the same cached GLTF root across remounts (useLoader keys by
  // URL). The wow-pass model (P1-06) names this node 'needle'; the model
  // already on this branch does not, which is the 'pending' state below.
  const needle = useMemo(() => scene.getObjectByName("needle"), [scene]);
  const { data: ops } = useLiveSignal<Ops>(OPS_URL, OPS_INTERVAL_MS);
  const { angleDeg, caption } = needleReading(ops);

  // A prop change on every /api/ops poll (2 min), never per-frame: same
  // "imperative write on data change" contract as world/skyBinding.ts.
  useEffect(() => {
    if (needle) needle.rotation.z = MathUtils.degToRad(angleDeg);
  }, [needle, angleDeg]);

  return (
    <>
      <primitive object={scene} scale={1.7} />
      <Html position={[0, -1.05, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div
          data-needle={angleDeg}
          data-needle-source={needle ? "model" : "pending"}
          style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-muted)", whiteSpace: "nowrap" }}
        >
          {caption}
        </div>
      </Html>
    </>
  );
}
