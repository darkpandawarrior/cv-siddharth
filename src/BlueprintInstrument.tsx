import { useStudioModel } from "./three/models.ts";

/**
 * The Blueprint Room's centrepiece — a real lathe-turned Blender asset
 * (scripts/blender/blueprint-instrument.py, the studio-orbit materials)
 * standing in for the procedural torus-knot hologram (HoloCore) that used to
 * sit here. React.lazy-imported from Blueprint3D.tsx so its GLTFLoader
 * weight and the GLB fetch both land in their own chunk rather than the
 * BlueprintRoom chunk, which had 63 bytes of headroom before this split.
 */
export default function BlueprintInstrument() {
  const { scene } = useStudioModel("blueprint-instrument");
  return <primitive object={scene} scale={1.7} />;
}
