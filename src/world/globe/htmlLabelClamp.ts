import { Vector3 } from "three";
import type { Object3D, Camera } from "three";
import type { CSSProperties } from "react";

const v = new Vector3();

// The Pune card's own box (Markers.tsx). Width over height is close to phi
// (288 / ~178 at its three-row height); spacing steps are Fibonacci numbers
// (5, 8, 13) so the card sits on the same ratio as GlobeScene's framing.
export const CARD_W = 288;
export const LEADER = 13;
const EDGE = 8;
const HALF_H = 90;
// GlobePanel's fact list overlays the bottom of the canvas (about 22% on
// desktop, where this card shows); the card never slides into it.
const PANEL_FRACTION = 0.25;

/**
 * A drei `<Html>` card whose 3D anchor sits near the globe's horizon can
 * project to a screen X/Y far outside the viewport — harmless on a 1440px
 * desktop, but on a 390px phone the card clips every line mid-word
 * (verified: /globe at 390x844). `<Html>`'s own `calculatePosition` prop is
 * the documented escape hatch (restated here, not imported — drei doesn't
 * export its default implementation, only its type); it doesn't clamp for
 * you. The card extends RIGHT of its anchor (leader, then box) and is
 * centred vertically on it, so the clamp keeps that whole extent on screen.
 */
export function calculatePosition(el: Object3D, camera: Camera, size: { width: number; height: number }): number[] {
  v.setFromMatrixPosition(el.matrixWorld).project(camera);
  return [
    Math.max(EDGE, Math.min(size.width - CARD_W - LEADER - EDGE, (v.x * 0.5 + 0.5) * size.width)),
    Math.min(size.height * (1 - PANEL_FRACTION) - HALF_H, Math.max(HALF_H, (0.5 - v.y * 0.5) * size.height)),
  ];
}

/** The card itself: fixed px (no drei distanceFactor), so it reads at 11px
 *  at every zoom instead of shrinking to ~8px from orbit. drei's wrapper is
 *  0px wide, so the width must be explicit or the box shrinks to its
 *  longest word. */
export const cardStyle: CSSProperties = {
  width: CARD_W,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  lineHeight: 1.4,
  color: "#e8efe9",
  background: "rgba(5,7,10,0.82)",
  border: "1px solid rgba(232,239,233,0.14)",
  borderRadius: 8,
  padding: "8px 13px",
  display: "grid",
  gap: 5,
  backdropFilter: "blur(8px)",
};
