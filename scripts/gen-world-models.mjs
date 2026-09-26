// scripts/gen-world-models.mjs
//
// One `npm run gen:world-models` target that runs every World v2 Blender
// landmark kit and packs its GLB(s) (world-v2-spec.md §9, M68). Each kit
// script already meshopt-packs its own output through the pinned
// `npx -y gltfpack@1.2.0 -cc -kn` (see any scripts/blender/world-v2/*.py's
// own pack_glb()) — this runner's only job is invoking Blender headless,
// once per kit, in the declared order, through the existing watchdog wrapper
// (render-watchdog.sh) so a stuck geometry-nodes scatter fails loud instead
// of hanging the whole chain.
//
// MANUAL/OCCASIONAL, same posture as gen-pune-normals.mjs, gen-starfield.mjs
// and gen-river-osm.mjs (G13): needs a local Blender 5.2 LTS binary and one
// Blender process at a time (G0 cap), so it is never wired into
// generators.mjs's build/refresh/check chains. Run by hand:
//   npm run gen:world-models
//   BLENDER_EXECUTABLE=/path/to/blender npm run gen:world-models   (override)
//   npm run gen:world-models -- sangam-keystone-bridge.py           (one kit)
//
// Determinism check (spec §9: "a determinism check runs each twice and
// diffs the bytes") is each kit's own job via its committed GLB in git diff,
// not this runner's.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT_DIR = join(root, "scripts/blender/world-v2");
const WATCHDOG = join(KIT_DIR, "render-watchdog.sh");
// Declared order (world-v2-spec.md §9's own list) — sangam-keystone-bridge
// first because it reuses kmp-foundation-keystone.py's stone profile and is
// the load-bearing landmark other kits are placed against.
const KITS = [
  "sangam-keystone-bridge.py", "doori-ghat.py", "gaddi-ghat.py",
  "paymentslab-bell-toran.py", "candidai-rahat.py", "template-gomukh.py",
  "portfolio-twin-chhatri.py", "stutter-samrat-yantra.py", "sinc-p-baori.py",
  "loopdown-kite-masts.py", "ghat-kit.py", "hero-stone-kit.py",
  "fleet-deepmal.py", "pr-stepping-stones.py", "room-chhatri-kit.py",
  "tara-kund-observatory.py", "hodi-boatman.py", "banyan-neem.py",
  "palm.py", "diya-kit.py", "misc-kit.py", "foliage-atlas.py",
];
const TIMEOUT_S = process.env.BLENDER_KIT_TIMEOUT_S ?? "300";

function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const kits = only.length ? KITS.filter((k) => only.includes(k)) : KITS;
  if (only.length && kits.length !== only.length) {
    const known = new Set(KITS);
    const unknown = only.filter((k) => !known.has(k));
    console.error(`[gen-world-models] unknown kit(s): ${unknown.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  for (const kit of kits) {
    const script = join(KIT_DIR, kit);
    if (!existsSync(script)) {
      console.error(`[gen-world-models] missing kit script: ${script}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[gen-world-models] ${kit}`);
    const result = spawnSync(WATCHDOG, [script, TIMEOUT_S], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`[gen-world-models] ${kit} failed (exit ${result.status})`);
      process.exitCode = result.status ?? 1;
      return;
    }
  }
  console.log(`[gen-world-models] done: ${kits.length} kit(s)`);
}

main();
