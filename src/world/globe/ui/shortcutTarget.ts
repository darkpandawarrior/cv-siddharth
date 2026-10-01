/** Element-like inputs keep shortcut ownership testable without a DOM. */
export interface ShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
  getAttribute?: (name: string) => string | null;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
const ACTIVATION_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider']);
const NAVIGATION_ROLES = new Set(['slider', 'tab', 'option', 'menuitem', 'radio', 'listbox', 'spinbutton', 'scrollbar']);
const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

export function isTypingTarget(el: ShortcutTarget | null): boolean {
  const tag = el?.tagName?.toUpperCase();
  return !!el?.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT'
    || (tag === 'INPUT' && !NON_TEXT_INPUTS.has((el?.type ?? el?.getAttribute?.('type') ?? 'text').toLowerCase()));
}

export function ownsKey(el: ShortcutTarget | null, key: string): boolean {
  if (isTypingTarget(el)) return true;
  const tag = el?.tagName?.toUpperCase();
  const role = el?.getAttribute?.('role')?.toLowerCase() ?? '';
  if (key === ' ' || key === 'Space' || key === 'Enter') {
    return tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'INPUT'
      || (tag === 'A' && el?.getAttribute?.('href') != null) || ACTIVATION_ROLES.has(role);
  }
  return NAVIGATION_KEYS.has(key) && (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || NAVIGATION_ROLES.has(role));
}
