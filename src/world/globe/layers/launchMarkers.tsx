import { LAUNCH, LAUNCH_BEAM } from "./layerKeys.ts";
// LANE L7 (live earth events), task 5: upcoming launch pads as a small
// upward chevron, with a thin vertical beam for anything lifting off inside
// 24h. Two InstancedMeshes (task 8) — chevrons and beams are a different
// glyph kind, and there are at most a couple of beams on screen at once.
import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { useGlobe } from "../globeStore.ts";
import { type Launch, formatCountdown } from "./launches.ts";

// A shallow double-cone stands in for a chevron/arrowhead — ConeGeometry
// alone reads as a spike; two stacked (drawn as one merged silhouette via a
// single cone with a wide base-to-height ratio) reads closer to "^". Kept to
// one draw call by just using a flattened cone.
const CHEVRON_GEOMETRY = new THREE.ConeGeometry(1, 1, 3);
const CHEVRON_RADIUS = 0.035;
const BEAM_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
const BEAM_RADIUS_WORLD = 0.006;
const BEAM_HEIGHT = 0.35;
const MAX_LAUNCHES = 16;

const CHEVRON_COLOR = new THREE.Color(LAUNCH); // ambient, matches OrbitLayer/LocalTraffic's neutral hex
const BEAM_COLOR = new THREE.Color(LAUNCH_BEAM); // --color-probe: a beam IS a live claim ("launching within 24h")

const dummy = new THREE.Object3D();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

function surfaceNormal(lat: number, lon: number): THREE.Vector3 {
  const p = latLonToXyz(lat, lon);
  return new THREE.Vector3(p.x, p.y, p.z);
}

export function LaunchMarkers({ launches, now }: { launches: Launch[]; now: Date }) {
  const chevronRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const select = useGlobe((s) => s.select);
  const capped = useMemo(() => launches.slice(0, MAX_LAUNCHES), [launches]);
  const beams = useMemo(() => capped.filter((l) => l.within24h), [capped]);

  useEffect(() => {
    const mesh = chevronRef.current;
    if (!mesh) return;
    for (let i = 0; i < capped.length; i++) {
      const l = capped[i];
      const normal = surfaceNormal(l.lat, l.lon);
      dummy.position.copy(normal).multiplyScalar(GLOBE_RADIUS + 0.02);
      dummy.quaternion.setFromUnitVectors(AXIS_Y, normal);
      dummy.scale.setScalar(CHEVRON_RADIUS);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = capped.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [capped]);

  useEffect(() => {
    const mesh = beamRef.current;
    if (!mesh) return;
    for (let i = 0; i < beams.length; i++) {
      const l = beams[i];
      const normal = surfaceNormal(l.lat, l.lon);
      // A cylinder standing on the pad, its own centre lifted half its
      // height off the surface so its base sits AT the surface, not buried
      // in it.
      dummy.position.copy(normal).multiplyScalar(GLOBE_RADIUS + BEAM_HEIGHT / 2);
      dummy.quaternion.setFromUnitVectors(AXIS_Y, normal);
      dummy.scale.set(BEAM_RADIUS_WORLD, BEAM_HEIGHT, BEAM_RADIUS_WORLD);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = beams.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [beams]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i === undefined || !capped[i]) return;
    const l = capped[i];
    select({
      id: `launch-${l.id}`,
      kind: "launch",
      title: l.name,
      rows: [
        { label: "Provider", value: l.provider },
        { label: "NET", value: new Date(l.netMs).toISOString() },
        { label: "Countdown", value: formatCountdown(now.getTime(), l.netMs) },
        { label: "Pad", value: `${l.padName}${l.locationName ? `, ${l.locationName}` : ""}` },
      ],
      source: "Launch Library 2, cached 30 min",
      live: false, // a 30-min-cached read, not a live tick — never dressed as live (house rule)
      focus: { kind: "latlon", lat: l.lat, lon: l.lon },
    });
  };

  if (capped.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={chevronRef}
        args={[CHEVRON_GEOMETRY, undefined, MAX_LAUNCHES]}
        frustumCulled={false}
        onClick={onClick}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <meshBasicMaterial color={CHEVRON_COLOR} toneMapped={false} />
      </instancedMesh>
      {beams.length > 0 && (
        <instancedMesh ref={beamRef} args={[BEAM_GEOMETRY, undefined, MAX_LAUNCHES]} frustumCulled={false}>
          <meshBasicMaterial color={BEAM_COLOR} toneMapped={false} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
    </group>
  );
}
