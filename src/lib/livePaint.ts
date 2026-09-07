import { useEffect, useState, type RefObject } from "react";

/**
 * "Has the Compose/Wasm build inside this iframe actually painted yet?"
 *
 * Extracted from DeviceWall.tsx's LiveEmbed so DeviceMorph can reuse it
 * instead of carrying a second copy. The detection is not obvious and was
 * arrived at the hard way, which is exactly why it should exist once:
 *
 *  - A Kotlin/Wasm Compose build paints into a <canvas>, but the canvas exists
 *    at its default 300×150 from the first tick. Only a size ABOVE that means
 *    real content.
 *  - The portfolio's own CMP twin (Compose Multiplatform 1.12) ships NO canvas
 *    at all — it renders into a plain #compose div and its main() hides the
 *    #boot overlay on the first frame. An earlier probe looked up
 *    `#ComposeTarget` by id, which that build has no such element for, so it
 *    polled for 18s, gave up, and the "live" embed was a permanently black box.
 *  - Gaddi puts its canvas INSIDE A SHADOW ROOT. `document.querySelector`
 *    cannot pierce shadow DOM, so a build that boots and renders perfectly
 *    still read as "never painted": measured 2026-08-14, the canvas was a
 *    healthy 900×700 inside a shadow root on a plain <div> host while the
 *    probe saw nothing, timed out at 18s and fell back to the screenshot.
 *    That is why the search below walks shadow roots.
 *
 * So: a canvas grown past its default (found through shadow roots), or a #boot
 * overlay that has been hidden. Gives up after `timeoutMs` so a slow link keeps
 * the poster floor rather than staring at black forever.
 */

/** querySelector("canvas") that pierces shadow roots. */
function findCanvas(root: Document | ShadowRoot): HTMLCanvasElement | null {
  const direct = root.querySelector("canvas");
  if (direct) return direct as HTMLCanvasElement;
  // Only shadow HOSTS are recursed into, so this stays cheap on the small
  // non-canvas DOM these builds ship.
  for (const el of root.querySelectorAll("*")) {
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (shadow) {
      const found = findCanvas(shadow);
      if (found) return found;
    }
  }
  return null;
}
export function useLivePaint(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  active: boolean,
  timeoutMs = 18000,
): { painted: boolean; gaveUp: boolean } {
  const [painted, setPainted] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!active || painted || gaveUp) return;
    const started = Date.now();
    const iv = window.setInterval(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        const c = doc ? findCanvas(doc) : null;
        const boot = doc?.getElementById("boot");
        if (
          (c && (c.width > 300 || c.height > 150)) ||
          (boot && doc?.defaultView?.getComputedStyle(boot).display === "none")
        ) {
          setPainted(true);
          window.clearInterval(iv);
          return;
        }
      } catch {
        /* cross-origin guard — first-party same-origin, so this shouldn't hit */
      }
      if (Date.now() - started > timeoutMs) {
        setGaveUp(true);
        window.clearInterval(iv);
      }
    }, 400);
    return () => window.clearInterval(iv);
  }, [active, painted, gaveUp, iframeRef, timeoutMs]);

  return { painted, gaveUp };
}
