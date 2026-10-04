// ponytail: archive(world-v1) until 2027-04-04; removal recipe in ARCHIVE.md#world-v1
import { useEffect } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { input, isInteractiveTarget } from "../../input.ts";
import { openArchive, shouldOpen, sourceSpringPosition, type ArchiveSample } from "../archiveGate.ts";

export const layer = { id: "archive-gate", order: 75 };
const spring = sourceSpringPosition();

export default function ArchiveGate() {
  const { gl } = useThree();
  useEffect(() => {
    let samples: ArchiveSample[] = [];
    let opened = false;
    // Record downstream intent even between slow render frames.
    const reset = (event: KeyboardEvent) => {
      if (!isInteractiveTarget(event.target) && ["ArrowUp", "w", "W"].includes(event.key)) samples = [];
    };
    window.addEventListener("keydown", reset);
    const release = (event: KeyboardEvent) => {
      if (["ArrowDown", "s", "S"].includes(event.key)) samples = [];
    };
    window.addEventListener("keyup", release);
    const timer = window.setInterval(() => {
      if (opened) return;
      const x = Number(gl.domElement.dataset.hodiX);
      const z = Number(gl.domElement.dataset.hodiZ);
      const at = performance.now() / 1000;
      const distance = Math.hypot(x - spring[0], z - spring[2]);
      if (!Number.isFinite(distance) || distance > 4 || input.throttle >= 0) { samples = []; return; }
      samples.push({ at, distance, upstream: true });
      // Retain one sample before the cutoff to measure the full hold.
      while (samples.length > 2 && samples[1].at <= at - 2) samples.shift();
      if (shouldOpen(samples)) { opened = true; openArchive(); }
    }, 50);
    return () => { window.clearInterval(timer); window.removeEventListener("keydown", reset); window.removeEventListener("keyup", release); };
  }, [gl]);
  return <group name="source-spring" position={spring}>
    <mesh position={[3, 0.6, 0]}><dodecahedronGeometry args={[0.8, 0]} /><meshStandardMaterial color="#9d9886" roughness={1} /></mesh>
    <Html position={[3, 1.8, 0]} center><span className="pointer-events-none whitespace-nowrap rounded bg-card/90 px-2 py-1 text-xs text-muted">Before the beginning is the old map.</span></Html>
  </group>;
}
