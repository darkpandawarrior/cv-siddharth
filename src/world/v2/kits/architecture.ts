/**
 * The nine architecture kits (world-v2-spec.md #5 rows 1-9), one named
 * component each, mounted by `../layers/LandmarksApps.tsx` at a fixed
 * world position. Deliberately does NOT export `{ default, kit }`
 * (kits.ts's generic per-`Feature.form` registry): that registry claims ONE
 * shape per scattered form id (fireflies, deepmal niches, kites), while
 * these nine are unique, once-each buildings placed by the layout module,
 * not by `worldModel.ts`'s `hashNoise` jitter - `kits.ts`'s own
 * `resolveKits` silently skips a module missing `kit`, which is exactly the
 * "not every file under kits/ opts into the registry" escape hatch this
 * file uses on purpose.
 *
 * Every kit reads `heavy/world/models/<id>.glb`'s own named sockets
 * (kitSockets.arch1/audit.test.ts) for its counted-feature arrangement, but
 * draws them as primitive geometry rather than loading the GLB at runtime -
 * the same posture `Hodi.tsx` already ships for the hull (a box, not
 * `hodi-boatman.glb`) and `GrammarInstances.tsx` ships for every unclaimed
 * form: the Blender kit is the look-dev target (G11), not something the
 * runtime parses today.
 * ponytail: swap each kit's primitives for `useGLTF(url)` + named-node
 * lookups the day a lane wires the Meshopt decoder in (no kit here owns
 * that plumbing yet) - the counts/positions below do not change shape.
 *
 * Written with `createElement` rather than JSX: this file's own path
 * (this lane's `owns` list) is `architecture.ts`, and TypeScript only
 * parses JSX syntax inside a `.tsx` file - `h(...)` below is exactly what
 * JSX compiles down to, R3F's reconciler cannot tell the difference.
 */
import { createElement as h, useMemo } from "react";
import type { ReactElement } from "react";
import { Instance, Instances } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { BellToranBinding } from "../landmarkBindings.ts";
import { BELL_ARCHETYPES } from "../landmarkBindings.ts";
import { worldPalette } from "../../palette.ts";

export type Vec3 = readonly [number, number, number];
type ClickHandler = (e: ThreeEvent<MouseEvent>) => void;

const BELL_COLOR: Readonly<Record<(typeof BELL_ARCHETYPES)[number], string>> = {
  native: "#c47f2a", // amber-brass, per world-v2-spec row 4
  hosted: "#5ee6ff", // cyan-tinted
  mobileMoney: "#3ddc84", // green
  internal: "#e8efe9",
  stub: "#262e2b", // unlit clay
};

/** A flat staircase: `count` boxes, each one step higher and one further
 *  along +z, shared by the doori/gaddi ghat kits. */
function Steps({ count, color }: { count: number; color: string }): ReactElement {
  const n = Math.max(0, Math.round(count));
  return h(
    Instances,
    { limit: Math.max(1, n), range: n },
    h("boxGeometry", { args: [6, 0.4, 1] }),
    h("meshStandardMaterial", { color, roughness: 0.9 }),
    ...Array.from({ length: n }, (_, i) => h(Instance, { key: i, position: [0, i * 0.4, i * 0.9] })),
  );
}

/** Stacked torus "bands" on a pillar - the survey pillar's `cores` rings and
 *  (grey, single) the schema pillar's unmeasured band. */
function PillarBands({ count, color, radius = 1 }: { count: number; color: string; radius?: number }): ReactElement {
  const n = Math.max(0, Math.round(count));
  return h(
    Instances,
    { limit: Math.max(1, n), range: n },
    h("torusGeometry", { args: [radius, 0.12, 6, 16] }),
    h("meshStandardMaterial", { color, roughness: 0.85 }),
    ...Array.from({ length: n }, (_, i) =>
      h(Instance, { key: i, position: [0, 0.5 + i * 0.35, 0], rotation: [Math.PI / 2, 0, 0] }),
    ),
  );
}

export interface KitCommonProps {
  position: Vec3;
  /** 0..1, `useReveal`'s own ramp - applied as a uniform scale-in rather
   *  than material opacity (visual-catalogue.md C4's "per-object fade", cut
   *  to the cheapest version that still reads as a fade-in; upgrade to a
   *  real opacity crossfade if a scale-pop reads wrong beside a real GLB
   *  later). */
  reveal: number;
  onOpen?: ClickHandler;
}

// ── #1 sangam-keystone-bridge ───────────────────────────────────────────────
export interface KeystoneBridgeKitProps extends KitCommonProps {
  voussoirs: number;
  piers: number;
  deckLamps: number;
}
export function KeystoneBridgeKit({ position, reveal, onOpen, voussoirs, piers, deckLamps }: KeystoneBridgeKitProps): ReactElement {
  const palette = worldPalette();
  const voussoirCount = Math.max(1, Math.round(voussoirs));
  const archRadius = 9;
  const voussoirAngles = useMemo(
    () => Array.from({ length: voussoirCount }, (_, i) => Math.PI * (i / (voussoirCount - 1 || 1))),
    [voussoirCount],
  );
  const pierCourses = Math.max(1, Math.round(piers / 2));
  const lampCount = Math.max(0, Math.round(deckLamps));
  const lampSpan = (archRadius * 2 * 0.9) / Math.max(1, lampCount - 1 || 1);

  return h(
    "group",
    { position, scale: reveal, name: "landmark-bridge" },
    // the arch: one voussoir box per conventionPlugins, spanning the piers
    h(
      "mesh",
      { onClick: onOpen, position: [0, archRadius, 0] },
      h("boxGeometry", { args: [archRadius * 2 + 2, 0.6, 1.4] }),
      h("meshStandardMaterial", { color: palette.card, roughness: 0.85 }),
    ),
    h(
      Instances,
      { limit: voussoirCount, range: voussoirCount },
      h("boxGeometry", { args: [1.1, 1.4, 1.4] }),
      h("meshStandardMaterial", { color: palette.textDim, roughness: 0.8 }),
      ...voussoirAngles.map((theta, i) =>
        h(Instance, {
          key: i,
          position: [Math.cos(theta) * archRadius, Math.sin(theta) * archRadius, 0],
          rotation: [0, 0, theta - Math.PI / 2],
        }),
      ),
    ),
    // two piers, course-banded by providerModules
    ...[-archRadius, archRadius].map((x, side) =>
      h("group", { key: side, position: [x, 0, 0] }, h(PillarBands, { count: pierCourses, color: palette.surface, radius: 1.3 })),
    ),
    // deck lamps: count only (their live glow is P3-02a's)
    h(
      Instances,
      { limit: Math.max(1, lampCount), range: lampCount },
      h("sphereGeometry", { args: [0.3, 8, 8] }),
      h("meshStandardMaterial", { color: palette.accentDim, roughness: 0.6 }),
      ...Array.from({ length: lampCount }, (_, i) =>
        h(Instance, { key: i, position: [(i - (lampCount - 1) / 2) * lampSpan, archRadius + 1, 0] }),
      ),
    ),
    // the eight dry niches - always unlit, REC-1's zero-consumer list
    ...Array.from({ length: 8 }, (_, i) => {
      const theta = Math.PI * (i / 7);
      return h(
        "mesh",
        { key: i, position: [Math.cos(theta) * (archRadius - 1.6), Math.sin(theta) * (archRadius - 1.6), 0.8], name: `dry-niche-${i}` },
        h("boxGeometry", { args: [0.5, 0.7, 0.3] }),
        h("meshStandardMaterial", { color: palette.void, roughness: 1 }),
      );
    }),
  );
}

// ── #2 doori-ghat ────────────────────────────────────────────────────────────
export interface DooriGhatKitProps extends KitCommonProps {
  steps: number;
  pillarBands: number;
}
export function DooriGhatKit({ position, reveal, onOpen, steps, pillarBands }: DooriGhatKitProps): ReactElement {
  const palette = worldPalette();
  return h(
    "group",
    { position, scale: reveal, name: "landmark-doori" },
    h(
      "mesh",
      { onClick: onOpen, position: [0, 0.2, 0] },
      h("boxGeometry", { args: [8, 0.4, 6] }),
      h("meshStandardMaterial", { color: palette.card, roughness: 0.9 }),
    ),
    h(Steps, { count: steps, color: palette.card }),
    // survey pillar: one band per `cores`
    h("group", { position: [-3.5, 0, -1] }, h(PillarBands, { count: pillarBands, color: palette.probe, radius: 0.6 })),
    // schema pillar: REC-8, distinct from the survey pillar - rendered
    // unmeasured until grammar.ts/ledger.ts expose doori.schemaVersion
    // through WorldModel (this file's own landmarkBindings.ts doc).
    h("group", { position: [3.5, 0, -1] }, h(PillarBands, { count: 1, color: palette.line, radius: 0.6 })),
    // the gps-accuracy hero stone, linking the Confidence Console (/lab)
    h(
      "mesh",
      { position: [0, 0.5, 2.5], name: "hero-stone-gps-accuracy" },
      h("coneGeometry", { args: [0.4, 0.9, 4] }),
      h("meshStandardMaterial", { color: palette.accent, roughness: 0.7 }),
    ),
  );
}

// ── #3 gaddi-ghat ────────────────────────────────────────────────────────────
export interface GaddiGhatKitProps extends KitCommonProps {
  steps: number;
}
const GADDI_MOORING_POSTS = 3;
export function GaddiGhatKit({ position, reveal, onOpen, steps }: GaddiGhatKitProps): ReactElement {
  const palette = worldPalette();
  return h(
    "group",
    { position, scale: reveal, name: "landmark-gaddi" },
    h(
      "mesh",
      { onClick: onOpen, position: [0, 0.2, 0] },
      h("boxGeometry", { args: [7, 0.4, 5] }),
      h("meshStandardMaterial", { color: palette.card, roughness: 0.9 }),
    ),
    h(Steps, { count: steps, color: palette.card }),
    // the jharokha screen: lit because Gaddi runs client-side on this very
    // site (world-v2-spec row 3, WORLD-3).
    h(
      "mesh",
      { position: [0, 1.4, -2], name: "jharokha-lit" },
      h("boxGeometry", { args: [2, 1.6, 0.15] }),
      h("meshStandardMaterial", { color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.4, roughness: 0.6 }),
    ),
    // mooring posts, one per ships edge (F-Droid, GitHub Releases, headless
    // CLI) - a fixed, small allocation (kitSockets.audit's own exemption
    // comment), lit green per the base spec. Per-channel live CI dimming
    // (WORLD-3's amendment) is skipped here - P3-02a's own live-binding
    // pass wires that.
    ...Array.from({ length: GADDI_MOORING_POSTS }, (_, i) =>
      h(
        "group",
        { key: i, position: [(i - 1) * 2, 0, 2.6] },
        h(
          "mesh",
          null,
          h("cylinderGeometry", { args: [0.12, 0.12, 1.2, 6] }),
          h("meshStandardMaterial", { color: palette.surface, roughness: 0.9 }),
        ),
        h(
          "mesh",
          { position: [0, 0.7, 0], name: "mooring-lit" },
          h("sphereGeometry", { args: [0.16, 8, 8] }),
          h("meshStandardMaterial", { color: palette.signal, emissive: palette.signal, emissiveIntensity: 0.6 }),
        ),
      ),
    ),
  );
}

// ── #4 `paymentslab-bell-toran` ────────────────────────────────────────────
export interface PaymentslabBellToranKitProps extends KitCommonProps {
  bells: BellToranBinding;
}
export function PaymentslabBellToranKit({ position, reveal, onOpen, bells }: PaymentslabBellToranKitProps): ReactElement {
  const palette = worldPalette();
  const flat = useMemo(
    () => BELL_ARCHETYPES.flatMap((a) => Array.from({ length: Math.max(0, Math.round(bells[a])) }, () => a)),
    [bells],
  );
  const total = Math.max(1, flat.length);
  const width = Math.min(14, 2 + total * 0.18);

  return h(
    "group",
    { position, scale: reveal, name: "landmark-paymentslab-kmp" },
    // toran frame - length grows with the bell count
    h(
      "mesh",
      { onClick: onOpen, position: [0, 2.2, 0] },
      h("boxGeometry", { args: [width, 0.2, 0.2] }),
      h("meshStandardMaterial", { color: palette.line, roughness: 0.8 }),
    ),
    ...BELL_ARCHETYPES.map((archetype) => {
      const n = Math.max(0, Math.round(bells[archetype]));
      const offset = flat.findIndex((a) => a === archetype);
      return h(
        Instances,
        { key: archetype, limit: Math.max(1, n), range: n },
        h("coneGeometry", { args: [0.18, 0.32, 8] }),
        h("meshStandardMaterial", { color: BELL_COLOR[archetype], roughness: 0.5, metalness: 0.3 }),
        ...Array.from({ length: n }, (_, i) =>
          h(Instance, { key: i, position: [(offset + i - (total - 1) / 2) * (width / total), 1.9, 0] }),
        ),
      );
    }),
  );
}

// ── #5 candidai-rahat ────────────────────────────────────────────────────────
export interface CandidaiRahatKitProps extends KitCommonProps {
  buckets: number;
  /** Still by default (see landmarkBindings.ts / this lane's report on why
   *  the boat-in-sensor check is skipped: no shared boat-position store
   *  exists yet for a layer mounted outside Hodi.tsx to read from). */
  spinning?: boolean;
}
export function CandidaiRahatKit({ position, reveal, onOpen, buckets, spinning = false }: CandidaiRahatKitProps): ReactElement {
  const palette = worldPalette();
  const n = Math.max(1, Math.round(buckets));
  return h(
    "group",
    { position, scale: reveal, name: spinning ? "landmark-candidai-spinning" : "landmark-candidai" },
    h(
      "mesh",
      { onClick: onOpen, rotation: [0, 0, Math.PI / 2] },
      h("torusGeometry", { args: [1.4, 0.12, 8, 24] }),
      h("meshStandardMaterial", { color: palette.surface, roughness: 0.85 }),
    ),
    ...Array.from({ length: n }, (_, i) => {
      const theta = (i / n) * Math.PI * 2;
      return h(
        "mesh",
        { key: i, position: [Math.cos(theta) * 1.4, Math.sin(theta) * 1.4, 0], name: `rahat-bucket-${i}` },
        h("boxGeometry", { args: [0.3, 0.22, 0.3] }),
        h("meshStandardMaterial", { color: palette.textDim, roughness: 0.9 }),
      );
    }),
  );
}

// ── #6 template-gomukh ───────────────────────────────────────────────────────
export interface TemplateGomukhKitProps extends KitCommonProps {
  spouts: number;
}
export function TemplateGomukhKit({ position, reveal, spouts }: TemplateGomukhKitProps): ReactElement {
  const palette = worldPalette();
  const n = Math.max(1, Math.round(spouts));
  return h(
    "group",
    { position, scale: reveal, name: "landmark-template" },
    h("mesh", null, h("coneGeometry", { args: [0.6, 0.9, 6] }), h("meshStandardMaterial", { color: palette.card, roughness: 0.85 })),
    ...Array.from({ length: n }, (_, i) =>
      h(
        "mesh",
        { key: i, position: [(i - (n - 1) / 2) * 0.5, -0.4, 0.5], rotation: [Math.PI / 3, 0, 0], name: `spout-${i}` },
        h("cylinderGeometry", { args: [0.06, 0.08, 0.7, 6] }),
        h("meshStandardMaterial", { color: palette.probe, roughness: 0.5 }),
      ),
    ),
  );
}

// ── #7 portfolio-twin-chhatri ────────────────────────────────────────────────
export interface PortfolioTwinChhatriKitProps extends KitCommonProps {
  /** null = unmeasured (landmarkBindings.ts). */
  inlayTiles: number | null;
}
export function PortfolioTwinChhatriKit({ position, reveal, onOpen, inlayTiles }: PortfolioTwinChhatriKitProps): ReactElement {
  const palette = worldPalette();
  const measured = inlayTiles != null;
  const n = measured ? Math.max(1, Math.round(inlayTiles as number)) : 1;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));

  return h(
    "group",
    { position, scale: reveal, name: "landmark-portfolio" },
    ...[-1.2, 1.2].map((x, i) =>
      h(
        "mesh",
        { key: i, onClick: onOpen, position: [x, 1, 0] },
        h("coneGeometry", { args: [0.9, 1.3, 8] }),
        h("meshStandardMaterial", { color: palette.card, roughness: 0.85 }),
      ),
    ),
    h(
      Instances,
      { limit: Math.max(1, n), range: n },
      h("boxGeometry", { args: [0.3, 0.06, 0.3] }),
      h("meshStandardMaterial", { color: measured ? palette.accent : palette.line, roughness: 0.7 }),
      ...Array.from({ length: n }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        return h(Instance, { key: i, position: [(col - cols / 2) * 0.32, 0.05, (row - cols / 2) * 0.32] });
      }),
    ),
  );
}

// ── #8 stutter-samrat-yantra ─────────────────────────────────────────────────
export interface StutterSamratYantraKitProps extends KitCommonProps {
  azimuthDeg: number;
  sunUp: boolean;
}
export function StutterSamratYantraKit({ position, reveal, onOpen, azimuthDeg, sunUp }: StutterSamratYantraKitProps): ReactElement {
  const palette = worldPalette();
  const azimuthRad = (azimuthDeg * Math.PI) / 180;

  return h(
    "group",
    { position, scale: reveal, name: "landmark-stutter" },
    h(
      "mesh",
      { onClick: onOpen },
      h("cylinderGeometry", { args: [1.2, 1.2, 0.3, 16, 1, false, 0, Math.PI] }),
      h("meshStandardMaterial", { color: palette.card, roughness: 0.8 }),
    ),
    h(
      "mesh",
      { position: [0, 0.7, 0], rotation: [0, 0, Math.PI / 5] },
      h("boxGeometry", { args: [0.08, 1.4, 0.08] }),
      h("meshStandardMaterial", { color: palette.surface, roughness: 0.9 }),
    ),
    sunUp
      ? h(
          "mesh",
          { position: [0, 0.16, 0], rotation: [-Math.PI / 2, 0, azimuthRad], name: "yantra-shadow" },
          h("planeGeometry", { args: [0.15, 1.1] }),
          h("meshStandardMaterial", { color: "#f4f2ea", emissive: "#f4f2ea", emissiveIntensity: 0.3 }),
        )
      : null,
  );
}

// ── #9 sinc-p-baori ──────────────────────────────────────────────────────────
export interface SincPBaoriKitProps extends KitCommonProps {
  /** `levelIndex -> touched this session`, 0..3, in the fixed order
   *  `landmarkBindings.ts`'s `BAORI_LEVELS` declares. */
  levelTouched: readonly boolean[];
  innermostReady: boolean;
  onTouchLevel: (index: number) => void;
}
export function SincPBaoriKit({
  position,
  reveal,
  onOpen,
  levelTouched,
  innermostReady,
  onTouchLevel,
}: SincPBaoriKitProps): ReactElement {
  const palette = worldPalette();
  const levelRadii = [2.4, 1.9, 1.4, 0.9];

  return h(
    "group",
    { position, scale: reveal, name: "landmark-sinc-p" },
    ...levelRadii.map((r, i) =>
      h(
        "mesh",
        {
          key: i,
          position: [0, -i * 0.3, 0],
          rotation: [Math.PI / 2, 0, 0],
          onClick: (e: ThreeEvent<MouseEvent>) => {
            onOpen?.(e);
            if (i < 3) onTouchLevel(i);
          },
          name: `baori-level-${i}${levelTouched[i] ? "-touched" : ""}`,
        },
        h("torusGeometry", { args: [r, 0.15, 8, 24] }),
        h("meshStandardMaterial", { color: levelTouched[i] ? palette.accent : palette.line, roughness: 0.85 }),
      ),
    ),
    ...Array.from({ length: 7 }, (_, i) => {
      const theta = (i / 7) * Math.PI * 2;
      const isDeepseek = i === 6;
      return h(
        "mesh",
        {
          key: i,
          position: [Math.cos(theta) * 2.9, 0.4, Math.sin(theta) * 2.9],
          name: isDeepseek ? "baori-pillar-deepseek" : `baori-pillar-council-${i}`,
        },
        h("cylinderGeometry", { args: [0.14, 0.14, 0.9, 6] }),
        h("meshStandardMaterial", { color: isDeepseek ? palette.probe : palette.textDim, roughness: 0.8 }),
      );
    }),
    // the innermost mooring sensor - only reachable once levels 0-2 were
    // touched in order (WORLD-9's gate-order rule).
    h(
      "mesh",
      { position: [0, -1.2, 0], visible: innermostReady, name: "baori-innermost" },
      h("sphereGeometry", { args: [0.25, 8, 8] }),
      h("meshStandardMaterial", { color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.5 }),
    ),
  );
}

