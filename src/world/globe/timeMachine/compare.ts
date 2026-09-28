/** Epoch milliseconds avoid mutable Date objects in independently selected
 *  sides. Layer is the renderer's identifier, including NASA GIBS layer ids. */
export interface CompareView {
  readonly dateMs: number;
  readonly layer: string;
}
/** Both views stay explicit so moving the divider never changes the comparison. */
export interface CompareState {
  readonly split: number;
  readonly left: CompareView;
  readonly right: CompareView;
}
/** Shared hit-test vocabulary keeps pointer selection aligned with the swipe. */
export type CompareSide = "left" | "right";

/** Leave a visible, reachable sliver on both sides even at a drag endpoint. */
export function clampSplit(split: number): number {
  return Number.isNaN(split) ? 0.5 : Math.max(0.02, Math.min(0.98, split));
}

/** Copy views at the boundary so caller mutations cannot swap dates silently. */
export function createCompare(left: CompareView, right: CompareView, split = 0.5): CompareState {
  for (const view of [left, right]) {
    if (!Number.isFinite(view.dateMs) || !view.layer.trim()) throw new RangeError("Compare needs a date and layer");
  }
  return { left: { ...left }, right: { ...right }, split: clampSplit(split) };
}

/** Same clamp for pointer and keyboard callers prevents divergent endpoints. */
export function setCompareSplit(state: CompareState, split: number): CompareState {
  return { ...state, split: clampSplit(split) };
}

/** Native-slider conventions: arrows 1%, Shift arrows 10%, Home/End bounds.
 *  Unknown keys preserve identity so the UI need not intercept unrelated input. */
export function nudgeCompare(state: CompareState, key: string, shift = false): CompareState {
  const step = shift ? 0.1 : 0.01;
  switch (key) {
    case "ArrowLeft": case "ArrowDown": return setCompareSplit(state, state.split - step);
    case "ArrowRight": case "ArrowUp": return setCompareSplit(state, state.split + step);
    case "Home": return setCompareSplit(state, 0.02);
    case "End": return setCompareSplit(state, 0.98);
    default: return state;
  }
}

/** Screen coordinates use the canvas rect, not window width. The divider
 *  belongs to the right; null rejects a hidden/zero-width viewport or bad x. */
export function sideAtScreenX(x: number, viewportLeft: number, viewportWidth: number, split: number): CompareSide | null {
  if (!Number.isFinite(x) || !Number.isFinite(viewportLeft) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
  return x < viewportLeft + viewportWidth * clampSplit(split) ? "left" : "right";
}
