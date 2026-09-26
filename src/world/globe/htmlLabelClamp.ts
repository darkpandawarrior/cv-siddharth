import { Vector3 } from "three";
import type { Object3D, Camera, Color } from "three";
import type { CSSProperties } from "react";

const v = new Vector3();
// Both callers' own `maxWidth` (190, 180 — Markers.tsx, ReachColumns.tsx),
// halved and rounded up to one shared constant: a single calculatePosition
// export both `<Html>`s can reference directly (no per-caller factory/
// closure) costs fewer bytes in this budgeted chunk than two, and being a
// few px more conservative on the narrower callout only ever adds margin,
// never clipping.
const HALF_W = 100;
const HALF_H = 24;

/**
 * A drei `<Html center>` label whose 3D point sits near the globe's horizon
 * can project to a screen X/Y far outside the viewport — harmless on a
 * 1440px desktop, but a ~190px-wide employer/reach callout centred a few
 * pixels from a 390px phone's edge clips every line mid-word (verified:
 * /globe at 390x844). `<Html>`'s own `calculatePosition` prop is the
 * documented escape hatch for this (restated here, not imported — drei
 * doesn't export its default implementation, only its type); it doesn't
 * clamp for you, so this clamps the projected point to keep the label's own
 * estimated half-extent on screen instead of trusting the raw projection.
 */
export function calculatePosition(el: Object3D, camera: Camera, size: { width: number; height: number }): number[] {
  v.setFromMatrixPosition(el.matrixWorld).project(camera);
  return [
    Math.min(size.width - HALF_W, Math.max(HALF_W, (v.x * 0.5 + 0.5) * size.width)),
    Math.min(size.height - HALF_H, Math.max(HALF_H, (0.5 - v.y * 0.5) * size.height)),
  ];
}

/**
 * The pill-callout style Markers.tsx's employer ring and ReachColumns.tsx's
 * two reach labels each spelled out in full — same ten properties, down to
 * the same literal colors, `centered` and `maxWidth` the only real
 * difference between the two. Factored out alongside the clamp above rather
 * than added beside a second copy of it.
 */
export function calloutStyle(borderColor: Color, maxWidth: number, centered?: boolean): CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    lineHeight: 1.3,
    maxWidth,
    whiteSpace: "normal",
    textAlign: centered ? "center" : undefined,
    background: "rgba(5,7,10,0.75)",
    padding: "3px 7px",
    borderRadius: 6,
    color: "#e8efe9",
    border: `1px solid ${borderColor.getStyle()}66`,
  };
}
