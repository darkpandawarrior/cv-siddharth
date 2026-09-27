/**
 * Shared "navigate with a view transition" helper (controls-spec.md §2, Room
 * route transitions), extracted from AltitudeRail.tsx's own three-branch
 * `go()`: `document.startViewTransition` where supported, a plain 180ms
 * opacity fallback otherwise, and an instant jump under reduced motion. One
 * copy instead of N per-component ones.
 */
export function navigateWithViewTransition(navigate: () => void, reducedMotion: boolean): void {
  if (reducedMotion) {
    navigate();
    return;
  }
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => navigate());
    return;
  }
  const root = document.documentElement;
  root.style.transition = "opacity 180ms ease";
  root.style.opacity = "0";
  window.setTimeout(() => {
    navigate();
    requestAnimationFrame(() => {
      root.style.opacity = "1";
    });
  }, 180);
}
