/**
 * Wiping everything this world remembers about you.
 *
 * Six separate keys accumulated across the build — collected artifacts,
 * unlocked milestones, rooms entered, best triathlon time, the onboarding card,
 * the view preference, the mute setting — and not one of them had a way back.
 * A visitor who wanted to see the intro again, or replay the collection loop,
 * or just undo a stray click that hid the 3D world, had no option but to open
 * devtools and clear site data.
 *
 * The list lives HERE rather than being assembled from each module's private
 * constant, because the failure mode is a key that gets added later and quietly
 * survives every reset. One list, one test asserting the code writes nothing
 * outside it.
 */
export const PROGRESS_KEYS = [
  "playground:artifacts",
  "playground:explored",
  "playground:onboarded",
  "playground:view",
  "playground:muted",
  // The resolved-cell bitset (resolve.ts) — which of the 147 ground cells a
  // visitor has already driven through and resolved out of the dust.
  // Without this on the list, "reset progress" would clear every OTHER piece
  // of memory but leave the city permanently solid for that browser, which
  // defeats the entire first-five-seconds design the world is built around.
  "playground:resolved:v1",
] as const;

/** Everything except the view preference — resetting progress should not also
 *  throw you into a different view mid-click. */
export const PROGRESS_KEYS_EXCEPT_VIEW = PROGRESS_KEYS.filter((k) => k !== "playground:view");

export function resetProgress(): void {
  try {
    for (const key of PROGRESS_KEYS_EXCEPT_VIEW) localStorage.removeItem(key);
  } catch {
    /* private browsing — there was nothing persisted to clear anyway */
  }
}
