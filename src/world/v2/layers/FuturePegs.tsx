import { useMemo, useState, useSyncExternalStore } from "react";
import { Html } from "@react-three/drei";
import { futureSlots } from "../futureSlots.ts";
import { ledger } from "../ledger.ts";
import { landOf } from "../worldModel.ts";
import { useTerrainHeight } from "../terrainSurface.tsx";
import { worldPalette } from "../../palette.ts";
import { getReplay, getServerReplay, subscribeReplay } from "../timelapse.ts";

export const layer = { id: "future-pegs", order: 61 };

export default function FuturePegs() {
  const asOf = useSyncExternalStore(subscribeReplay, getReplay, getServerReplay);
  const [now] = useState(() => new Date());
  const pegs = useMemo(() => futureSlots(ledger, now), [now]);
  const features = useMemo(() => landOf(ledger), []);
  const heightAt = useTerrainHeight();
  const palette = worldPalette();
  if (asOf !== null) return null;
  return <group name="future-pegs">
    {pegs.map((peg) => {
      const x = features.find((feature) => feature.rule === peg.ruleId)?.pos[0] ?? 0;
      const y = Math.max(0, heightAt(x, peg.z));
      return <group key={peg.ruleId} name={`future-peg:${peg.ruleId}`} position={[x, y, peg.z]}>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[0.12, 2, 0.12]} />
          <meshBasicMaterial color={palette.accent} wireframe />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[8, 0.04, 0.04]} />
          <meshBasicMaterial color={palette.accent} transparent opacity={0.5} />
        </mesh>
        <Html position={[0, 2.2, 0]} center>
          <span data-future-peg={peg.ruleId} data-peg-z={peg.z} className="pointer-events-none whitespace-nowrap rounded border border-accent/40 bg-card/90 px-2 py-1 text-xs text-accent">{peg.label}</span>
        </Html>
      </group>;
    })}
  </group>;
}
