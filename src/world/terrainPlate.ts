import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from "three";

/**
 * §3.1 — THE BAKED PLATE TEXTURE.
 *
 * One canvas, painted once at load, never touched again: fine concrete
 * grain plus a cosmetic mark per lane (broom-finish streaks for work,
 * exposed-aggregate flecks for chess, a bare grain for writing — "a memory,
 * not a mountain" — and a panel-seam grid for opensource's steel plate). The
 * actual relief comes from the mesh's own vertex displacement
 * (terrainRelief.ts) and the metalness/roughness split comes from the
 * fragment shader (Terrain.tsx) — this file only supplies texture.
 *
 * A plain `<canvas>` rather than an `OffscreenCanvas`: this only ever runs
 * once, synchronously, on the main thread at scene mount — the whole reason
 * to reach for `OffscreenCanvas` is handing canvas work to a worker, which
 * nothing here does, and a plain canvas keeps this typed without a cast.
 */

const PLATE_SIZE = 2048;

/** How many times the plate repeats along Z to cover the full 168m corridor
 *  — art-direction doc §3.1's "tiled 4x along Z". */
export const PLATE_TILES_Z = 4;

type LaneKind = "terrace" | "aggregate" | "plain" | "steel";

/** The four lane columns, in the timeline's own lane order (work, chess,
 *  writing, opensource), as fractions of the plate's U axis. */
const LANES: { u0: number; u1: number; kind: LaneKind }[] = [
  { u0: 0 / 4, u1: 1 / 4, kind: "terrace" },
  { u0: 1 / 4, u1: 2 / 4, kind: "aggregate" },
  { u0: 2 / 4, u1: 3 / 4, kind: "plain" },
  { u0: 3 / 4, u1: 4 / 4, kind: "steel" },
];

/** A tiny deterministic PRNG — a fixed seed means the grain is the same
 *  every reload rather than shimmering differently on each page load. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return { r: 10, g: 13, b: 12 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Builds the plate once. Returns `null` outside a browser (SSR / vitest's
 * node test environment) — nothing calls this before a WebGL context
 * exists anyway, so there is nothing to bake there.
 */
export function buildPlateTexture(inkHex: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const size = PLATE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const base = hexToRgb(inkHex);
  ctx.fillStyle = inkHex;
  ctx.fillRect(0, 0, size, size);

  // Fine grain: per-pixel luminance jitter written straight into the pixel
  // buffer — one fillRect per speck would stall a 2048x2048 bake; one
  // putImageData does not.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const grain = mulberry32(0xc0ffee);
  for (let i = 0; i < d.length; i += 4) {
    const jitter = (grain() - 0.5) * 14;
    d[i] = clamp255(base.r + jitter);
    d[i + 1] = clamp255(base.g + jitter);
    d[i + 2] = clamp255(base.b + jitter);
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Lane marks — cosmetic only.
  const rand = mulberry32(0x5eed);
  for (const lane of LANES) {
    const x0 = lane.u0 * size;
    const x1 = lane.u1 * size;
    const w = x1 - x0;

    if (lane.kind === "terrace") {
      // work — broom-finish: short pale streaks.
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 500; i++) {
        const y = rand() * size;
        const x = x0 + rand() * w;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 18, y + (rand() - 0.5) * 4);
        ctx.stroke();
      }
    } else if (lane.kind === "aggregate") {
      // chess — exposed aggregate: scattered flecks, lighter and darker.
      for (let i = 0; i < 900; i++) {
        const x = x0 + rand() * w;
        const y = rand() * size;
        const r = 2 + rand() * 4;
        ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (lane.kind === "steel") {
      // opensource — steel plate: a regular ~2m panel-seam grid. The plate
      // covers 56m in X but only one Z tile (168/PLATE_TILES_Z metres), so
      // the two axes get their own px/m rather than sharing one.
      const stepX = (size / 56) * 2;
      const stepY = (size / (168 / PLATE_TILES_Z)) * 2;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      for (let px = x0; px <= x1; px += stepX) {
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, size);
        ctx.stroke();
      }
      for (let py = 0; py <= size; py += stepY) {
        ctx.beginPath();
        ctx.moveTo(x0, py);
        ctx.lineTo(x1, py);
        ctx.stroke();
      }
    }
    // "plain" (writing) gets no extra mark — a memory, not a mountain.
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
