import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { PUNE } from "../../../lib/sky.ts";
import { readColor } from "../../../themeColorThree.ts";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import type { GithubActivity } from "../../../../api/_lib/github-activity-handler.ts";
import type { Ops } from "../../../../api/_lib/ops-handler.ts";
import type { SignalsResponse } from "../../../../api/_lib/signals-handler.ts";
import {
  diffPulseEvents,
  pickIntroEvents,
  formatTimeAgo,
  type PulseEvent,
  type PulseKind,
  type PulseSources,
} from "./pulseEvents.ts";
import { publish, type FeedKind } from "../feed.ts"; // WAVE 6 LANE X1 (live world feed)

// streams.ts's own pollMs for ci-site (endpoint /api/ops) -- shared cadence
// for the github-activity/ops feeds below.
const POLL_MS = 60_000;
// audit fix (2026-09-28): /api/signals's edge cache is s-maxage=120
// (signals-handler.ts), and useLive.ts's useSignals() -- the other callers
// of this same URL (CiStrip, Terminal, OpsBoard, AnomalyRail) -- already
// polls at 120_000. useLiveSignal's shared bus polls at whichever mounted
// subscriber asks fastest, so this layer's own 60_000 was silently
// overriding that agreement on any page where it and one of those others are
// both mounted, doubling real origin traffic for no fresher data (the edge
// cache made the extra polls a guaranteed miss half the time).
const SIGNALS_POLL_MS = 120_000;
// living-ledger §6.3 Tiers: "capped pulse rings ... T1 12, T2 6, T3 0".
const CAP_BY_TIER: Record<1 | 2 | 3, number> = { 1: 12, 2: 6, 3: 0 };
const MAX_PULSES = 12;
const LIFE_MS = 2600;
const RING_MAX_RADIUS = 0.32;
const PACKET_RISE = 0.55;
const INTRO_STAGGER_MS = 420;
const RING_GEOMETRY = new THREE.RingGeometry(0.03, 0.05, 20);
const PACKET_GEOMETRY = new THREE.SphereGeometry(0.028, 8, 8);
const dummy = new THREE.Object3D();
// Per-frame scratch: the loop below runs per live pulse every frame.
const _base = new THREE.Vector3();
const _packet = new THREE.Vector3();
const _color = new THREE.Color();

interface Slot {
  event: PulseEvent;
  spawnMs: number;
  color: THREE.Color;
  angle: number; // radial jitter around Pune so simultaneous pulses don't stack exactly.
}

function colorForKind(kind: PulseKind): THREE.Color {
  switch (kind) {
    case "ci-pass":
      return readColor("--color-signal", "#3ddc84");
    case "ci-fail":
      return readColor("--color-danger", "#ff5c5c");
    case "push":
      return readColor("--color-probe", "#5ee6ff");
    case "devto":
      return readColor("--color-alt", "#db61ff");
    case "lichess":
    case "downloads":
      return readColor("--color-warn", "#f0883e");
  }
}

/**
 * PulseLayer (S: live signals with no geography, living-ledger-spec.md#6.3
 * task L4): every push, finished CI run, dev.to reaction jump, lichess
 * status edge and download-count increase between two polls of
 * /api/github-activity, /api/ops and /api/signals spawns one pulse over
 * Pune -- "reach without geography is drawn as height over Pune" (the same
 * rule ReachColumns.tsx already applies to the two static reach figures).
 * A hard per-tier cap retires the oldest pulse first; two pooled
 * InstancedMeshes (ring, rising packet) mean a full queue costs zero
 * allocations per frame. The opening ~6 real events replay staggered so the
 * globe is alive on first paint, each one labelled with its own real
 * time-ago (never "now") in the inspector.
 */
export default function PulseLayer({ tier }: { tier: 1 | 2 | 3 }) {
  const reducedMotion = useReducedMotion();
  const cap = CAP_BY_TIER[tier];
  const select = useGlobe((s) => s.select);
  const setStatus = useGlobe((s) => s.setStatus);

  const { data: activity, error: activityError } = useLiveSignal<GithubActivity>("/api/github-activity", POLL_MS);
  const { data: ops, error: opsError } = useLiveSignal<Ops>("/api/ops", POLL_MS);
  const { data: signals, error: signalsError } = useLiveSignal<SignalsResponse>("/api/signals", SIGNALS_POLL_MS);

  const prevRef = useRef<PulseSources | null>(null);
  const slotsRef = useRef<Slot[]>([]);
  const introQueueRef = useRef<{ event: PulseEvent; atMs: number }[]>([]);
  const statsRef = useRef({ total: 0, lastAt: null as string | null });
  const angleSeq = useRef(0);

  const ringMesh = useRef<THREE.InstancedMesh>(null);
  const packetMesh = useRef<THREE.InstancedMesh>(null);
  const metaRef = useRef<(PulseEvent | null)[]>(new Array(MAX_PULSES).fill(null));
  // e2e/inspection seam: a hidden DOM node (drei's Html portal, same trick
  // GlobeScene's own subsolar probe uses outside the canvas) written
  // imperatively per frame -- never React state, same discipline as
  // SceneRig's dataset writes in GlobeScene.tsx.
  const domRef = useRef<HTMLDivElement>(null);

  const normal = useMemo(() => {
    const p = latLonToXyz(PUNE.lat, PUNE.lon);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, []);
  const tangent = useMemo(() => {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3().crossVectors(worldUp, normal);
    return t.lengthSq() > 1e-6 ? t.normalize() : new THREE.Vector3(1, 0, 0);
  }, [normal]);
  const bitangent = useMemo(() => new THREE.Vector3().crossVectors(normal, tangent).normalize(), [normal, tangent]);
  const ringQuaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal), [normal]);

  function spawn(event: PulseEvent) {
    const slots = slotsRef.current;
    if (slots.length >= cap) slots.shift(); // oldest retired first
    angleSeq.current += 1;
    slots.push({
      event,
      spawnMs: performance.now(),
      color: colorForKind(event.kind),
      angle: (angleSeq.current * 137.5) % 360, // golden-angle jitter, same idea as fibonacciLattice's spread
    });
    statsRef.current = { total: statsRef.current.total + 1, lastAt: event.at };
    // WAVE 6 LANE X1 (live world feed): the brief's own list is "CI
    // pass/fail, pushes, dev.to, lichess" -- downloads counts are excluded
    // (a download tally isn't a moment-in-time occurrence the way the other
    // five are). Every pulse is drawn over Pune (this file's own "reach
    // without geography" rule), so that's the click-to-fly focus too.
    if (event.kind !== "downloads") {
      publish({
        id: `pulse:${event.id}`,
        kind: event.kind as FeedKind,
        title: event.title,
        detail: event.detail,
        whenMs: Date.parse(event.at),
        source: event.source,
        live: true,
        focus: { kind: "latlon", lat: PUNE.lat, lon: PUNE.lon },
        severity: event.kind === "ci-fail" ? "danger" : "info",
      });
    }
  }

  // The combined poll effect: diff two snapshots into new pulses, or (first
  // poll only) stage a staggered intro replay of the latest real events.
  useEffect(() => {
    if (cap === 0) return;
    if (activity === null && ops === null && signals === null) return;
    const curr: PulseSources = { activity, ops, signals };

    if (prevRef.current === null) {
      const intro = pickIntroEvents(curr, 6);
      const baseMs = performance.now();
      introQueueRef.current = intro.map((event, i) => ({ event, atMs: baseMs + i * INTRO_STAGGER_MS }));
    } else {
      for (const event of diffPulseEvents(prevRef.current, curr)) spawn(event);
    }
    prevRef.current = curr;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spawn/cap read via refs/closure, re-running per-render is the point (every new snapshot).
  }, [activity, ops, signals, cap]);

  // Health: honest counts, never a stale value dressed as live (globeStore's
  // own contract). All three feeds down -> failed, nothing drawn (the
  // instancedMesh counts already go to zero via the spawn gate above).
  useEffect(() => {
    if (cap === 0) {
      setStatus("pulses", { state: "failed", detail: "off at this tier" });
      return;
    }
    const allDown = activityError && opsError && signalsError;
    if (allDown && !activity && !ops && !signals) {
      setStatus("pulses", { state: "failed", detail: "signal feeds unreachable" });
      return;
    }
    const { total, lastAt } = statsRef.current;
    const detail = lastAt
      ? `${total} event${total === 1 ? "" : "s"} this session, last ${formatTimeAgo(Date.now(), lastAt)}`
      : "no events yet this session";
    setStatus("pulses", { state: "live", detail });
  }, [activity, ops, signals, activityError, opsError, signalsError, cap, setStatus]);

  useFrame(() => {
    if (cap === 0) return;
    const nowMs = performance.now();

    // Promote any staged intro events whose stagger delay has elapsed.
    const queue = introQueueRef.current;
    while (queue.length > 0 && queue[0].atMs <= nowMs) spawn(queue.shift()!.event);

    const rMesh = ringMesh.current;
    const pMesh = packetMesh.current;
    if (!rMesh || !pMesh) return;

    const slots = slotsRef.current;
    // Retire anything past its lifetime (in place, oldest-first order is preserved).
    while (slots.length > 0 && nowMs - slots[0].spawnMs >= LIFE_MS) slots.shift();

    const count = Math.min(slots.length, MAX_PULSES);
    for (let i = 0; i < count; i++) {
      const slot = slots[i];
      // Reduced motion: the ring and packet hold still at 30% for their
      // lifetime (the event still shows; nothing expands or rises).
      const t = reducedMotion ? 0.3 : Math.min(1, (nowMs - slot.spawnMs) / LIFE_MS);
      const eased = 1 - (1 - t) * (1 - t); // ease-out: quick to appear, gentle to fade
      const base = _base.copy(normal).multiplyScalar(GLOBE_RADIUS);
      const jitterX = Math.cos((slot.angle * Math.PI) / 180) * 0.12;
      const jitterY = Math.sin((slot.angle * Math.PI) / 180) * 0.12;
      base.addScaledVector(tangent, jitterX).addScaledVector(bitangent, jitterY);

      // Ring: expands outward along the surface, fades via colour intensity
      // (additive blending reads a dimmed colour as a fade against the dark
      // background) rather than a per-instance alpha channel.
      dummy.position.copy(base);
      dummy.quaternion.copy(ringQuaternion);
      const ringScale = 0.4 + eased * (RING_MAX_RADIUS / 0.05);
      dummy.scale.set(ringScale, ringScale, 1);
      dummy.updateMatrix();
      rMesh.setMatrixAt(i, dummy.matrix);
      rMesh.setColorAt(i, _color.copy(slot.color).multiplyScalar(1 - eased * 0.85));

      // Packet: rises straight up the normal from the surface.
      dummy.position.copy(_packet.copy(base).addScaledVector(normal, eased * PACKET_RISE));
      dummy.quaternion.identity();
      dummy.scale.setScalar(1 - eased * 0.4);
      dummy.updateMatrix();
      pMesh.setMatrixAt(i, dummy.matrix);
      pMesh.setColorAt(i, _color.copy(slot.color).multiplyScalar(1 - eased * 0.5));

      metaRef.current[i] = slot.event;
    }
    for (let i = count; i < MAX_PULSES; i++) metaRef.current[i] = null;

    rMesh.count = count;
    pMesh.count = count;
    rMesh.instanceMatrix.needsUpdate = true;
    pMesh.instanceMatrix.needsUpdate = true;
    if (rMesh.instanceColor) rMesh.instanceColor.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;

    // Test seam: written only when the pulse set changes, not every frame.
    const dom = domRef.current;
    if (dom && (dom.dataset.pulseCount !== String(count) || dom.dataset.pulseIntroPending !== String(queue.length))) {
      dom.dataset.pulseCount = String(count);
      dom.dataset.pulseIntroPending = String(queue.length);
      dom.dataset.pulseTotal = String(statsRef.current.total);
      dom.dataset.pulseKinds = slots.slice(0, count).map((s) => s.event.kind).join(",");
    }
  });

  function onPick(instanceId: number | undefined) {
    if (instanceId === undefined) return;
    const event = metaRef.current[instanceId];
    if (!event) return;
    select({
      id: event.id,
      kind: "pulse",
      title: event.title,
      rows: [
        { label: "kind", value: event.kind },
        { label: "detail", value: event.detail },
        { label: "when", value: formatTimeAgo(Date.now(), event.at) },
      ],
      source: event.source,
      live: true,
    });
  }

  if (cap === 0) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => onPick(e.instanceId);

  return (
    <group>
      <Html style={{ display: "none" }}>
        <div ref={domRef} data-pulse-layer aria-hidden />
      </Html>
      <instancedMesh ref={ringMesh} args={[RING_GEOMETRY, undefined, MAX_PULSES]} frustumCulled={false} count={0} onClick={handleClick}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={packetMesh} args={[PACKET_GEOMETRY, undefined, MAX_PULSES]} frustumCulled={false} count={0} onClick={handleClick}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
