/**
 * The pure part of a focus trap: given the focusable elements inside a
 * dialog (in tab order) and which one currently has focus, decide whether
 * Tab / Shift+Tab is about to walk off the end — and if so, which element
 * it should wrap to instead.
 *
 * Returns null when the browser's own Tab order already keeps focus inside
 * (i.e. nothing to do — let the keydown through). Generic over `T` rather
 * than typed to `HTMLElement` so this stays testable under vitest's `node`
 * environment (no DOM here): reference equality is all the logic needs, so
 * plain objects stand in for elements in tests.
 */
export function wrapFocusTarget<T>(focusable: T[], active: T | null, shiftKey: boolean): T | null {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (shiftKey && active === first) return last;
  if (!shiftKey && active === last) return first;
  return null;
}
