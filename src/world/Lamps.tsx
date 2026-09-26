import { useEffect, useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useLiveSignal } from "../lib/useLiveSignal.ts";
import { useNow } from "../lib/useSky.ts";
import type { GithubActivity, GithubActivityItem } from "../../api/_lib/github-activity-handler.ts";
import { recentPushes } from "./realityRows.ts";
import { projectDestinations } from "./destinations.ts";
import { projectTowers } from "./districtWest.ts";
import { includeBuildPairs } from "../data/systemGraph.ts";
import { CITY } from "./city.ts";
import { worldPalette } from "./palette.ts";
import { telemetry } from "./telemetry.ts";

/**
 * §4.2 — LAMPS: his own commits, as light. One `InstancedMesh` of a
 * procedural diya (a shallow lathe-turned bowl on a stem — no GLB, no
 * Blender process spent on twenty identical props), one per public push
 * in the last 24h off the SAME `/api/github-activity` bus `Lanes.tsx`,
 * `/time-machine` and the footer already share (P4) — never a second
 * fetch.
 */

const MAX_LAMPS = 20; // github-activity-handler.ts's own ACTIVITY_LIMIT
const APPROACH_RADIUS = 6; // metres — generous enough to read as "driving past", not "touching"

/** repo/owner -> the leaf name a project's own GitHub link ends in, so
 *  "darkpandawarrior/Doori" and "https://github.com/darkpandawarrior/Doori"
 *  compare equal regardless of which one a caller has. */
function repoLeaf(repoOrUrl: string): string {
  const parts = repoOrUrl.split("/").filter(Boolean);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/** The hub anchor — the same centroid FoundationHub.tsx's own `hubPosition`
 *  computes (the includeBuild roads' meeting point), restated rather than
 *  imported: FoundationHub.tsx is explicitly untouched by this lane (M2 —
 *  "The KMP keystone is not touched"), and its `hubPosition` is a private,
 *  unexported helper. Four lines, off the same public registry, is cheaper
 *  than asking an out-of-scope file to export one. */
function hubAnchor(): [number, number, number] {
  const towers = projectTowers();
  const bySlug = new Map(towers.map((t) => [t.slug, t] as const));
  const slugs = new Set(
    includeBuildPairs
      .filter(([, to]) => to === "kmp-build-logic" || to === "kmp-toolkit")
      .map(([from]) => from)
      .filter((slug) => bySlug.has(slug)),
  );
  const hubTowers = [...slugs].map((slug) => bySlug.get(slug)!);
  if (hubTowers.length === 0) return [0, CITY.groundY, 0];
  const x = hubTowers.reduce((n, t) => n + t.x, 0) / hubTowers.length;
  const z = hubTowers.reduce((n, t) => n + t.z, 0) / hubTowers.length;
  return [x, CITY.groundY, z];
}

export interface LampPrompt {
  repo: string;
  /** The first line only — a full commit body next to a driving HUD is
   *  more than a glance can read. */
  message: string;
  /** "3 h ago", computed once at proximity time from the item's own `at`. */
  ageLabel: string;
  url: string;
}

function ageLabel(atIso: string, nowMs: number): string {
  const hours = Math.max(0, Math.round((nowMs - Date.parse(atIso)) / 3_600_000));
  if (hours < 1) return "under an hour ago";
  if (hours === 1) return "1 h ago";
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 d ago" : `${days} d ago`;
}

/** A shallow lathe-turned diya profile (Y up), radius in metres — a wide
 *  rim, a shallow well, a short stem. Procedural (§5 of reality-spec: "no
 *  new npm runtime dependency"), turned with `THREE.LatheGeometry` the
 *  same way a potter's wheel would. */
function buildDiyaGeometry(): THREE.LatheGeometry {
  const points = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.05, 0.0),
    new THREE.Vector2(0.05, 0.05),
    new THREE.Vector2(0.12, 0.08),
    new THREE.Vector2(0.22, 0.12),
    new THREE.Vector2(0.2, 0.15),
    new THREE.Vector2(0.1, 0.13),
  ];
  return new THREE.LatheGeometry(points, 10);
}

const diyaGeometry = buildDiyaGeometry();
const dummy = new THREE.Object3D();

export function Lamps({ onPrompt }: { onPrompt: (p: LampPrompt | null) => void }): JSX.Element | null {
  const { data } = useLiveSignal<GithubActivity>("/api/github-activity");
  const items: readonly GithubActivityItem[] = data?.items ?? [];

  const c = worldPalette();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const insideRef = useRef<string | null>(null); // keyed by repo, edge-detected same as Landmarks.tsx

  // useSky.ts's own `useNow()` — "exactly one clock in the site" (its own
  // doc comment) — rather than a direct `Date.now()` read here: a call to
  // an impure function during render is a react-hooks/purity error, and a
  // Playwright fixed clock (page.clock) still drives this deterministically
  // either way, since useNow() itself just reads `new Date()`.
  const now = useNow();

  // Recomputed only when the feed or the clock's own minute actually
  // changes.
  const lit = useMemo(() => {
    if (!now) return [];
    const pushes = recentPushes(items, now.getTime());
    const anchors = projectDestinations();
    const hub = hubAnchor();
    return pushes.slice(0, MAX_LAMPS).map((item) => {
      const leaf = repoLeaf(item.repo);
      const dest = anchors.find((d) => d.kind === "project" && repoLeaf(d.slug) === leaf);
      return { item, position: dest ? dest.position : hub };
    });
  }, [items, now]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < lit.length; i++) {
      const [x, , z] = lit[i].position;
      dummy.position.set(x, CITY.groundY + 0.02, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1); // the lathe profile is already authored at real-world diya scale (~0.2m)
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = lit.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [lit]);

  useFrame(() => {
    if (lit.length === 0) {
      if (insideRef.current !== null) {
        insideRef.current = null;
        onPrompt(null);
      }
      return;
    }
    let hit: (typeof lit)[number] | null = null;
    for (const l of lit) {
      const [lx, , lz] = l.position;
      if (Math.hypot(telemetry.x - lx, telemetry.z - lz) <= APPROACH_RADIUS) {
        hit = l;
        break;
      }
    }
    const key = hit?.item.repo ?? null;
    if (key !== insideRef.current) {
      insideRef.current = key;
      onPrompt(
        hit
          ? { repo: hit.item.repo, message: hit.item.message.split("\n")[0], ageLabel: ageLabel(hit.item.at, Date.now()), url: hit.item.url }
          : null,
      );
    }
  });

  if (lit.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[diyaGeometry, undefined, MAX_LAMPS]} frustumCulled={false}>
      <meshStandardMaterial color={c.surface} emissive={c.accent} emissiveIntensity={1.4} roughness={0.5} metalness={0.1} />
    </instancedMesh>
  );
}
