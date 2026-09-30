import { describe, expect, it } from 'vitest';
import { isTypingTarget, ownsKey, type ShortcutTarget } from './shortcutTarget.ts';
import { readFileSync } from 'node:fs';
const element = (tagName: string, attrs: Record<string, string> = {}): ShortcutTarget => ({ tagName, getAttribute: name => attrs[name] ?? null });
const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
describe('native shortcut ownership', () => {
  it('activation controls own Space and Enter', () => {
    for (const el of [element('BUTTON'), element('A', { href: '' }), element('SUMMARY'), ...['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider'].map(role => element('DIV', { role }))]) {
      for (const key of [' ', 'Enter']) expect(ownsKey(el, key)).toBe(true);
      for (const key of arrows) expect(ownsKey(el, key)).toBe(['radio', 'tab', 'menuitem', 'option', 'slider'].includes(el.getAttribute?.('role') ?? ''));
    }
  });
  it('inputs, editable content and navigation roles retain native keys', () => {
    for (const el of [element('INPUT', { type: 'range' }), element('INPUT'), element('TEXTAREA'), element('SELECT'), { tagName: 'DIV', isContentEditable: true }, ...['listbox', 'spinbutton', 'scrollbar'].map(role => element('DIV', { role }))]) {
      for (const key of arrows) expect(ownsKey(el, key)).toBe(true);
    }
    for (const el of [element('INPUT'), { tagName: 'INPUT', type: 'email' }, element('TEXTAREA'), element('SELECT'), { isContentEditable: true }]) {
      expect(isTypingTarget(el)).toBe(true);
      for (const key of [' ', 'Enter', '[', ']', ...arrows]) expect(ownsKey(el, key)).toBe(true);
    }
    expect(isTypingTarget(element('INPUT', { type: 'range' }))).toBe(false);
    for (const key of [' ', 'Enter']) expect(ownsKey(element('INPUT', { type: 'range' }), key)).toBe(true);
  });
  it('body, canvas, null and an anchor without href leave shortcuts free', () => {
    for (const el of [element('BODY'), element('CANVAS'), element('A'), null]) {
      expect(isTypingTarget(el)).toBe(false);
      for (const key of [' ', 'Enter', '[', ']', ...arrows]) expect(ownsKey(el, key)).toBe(false);
    }
  });
  it('StreetView portal Back has an explicit 44px minimum', () => {
    const source = readFileSync(new URL('./StreetView.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/onClick=\{onBackToGlobe\}\s+className="[^"]*min-h-11 min-w-11/);
    expect(source).toContain('photoStatus === "loading" && noFeaturesTimedOut && "Still looking for streets"');
    expect(source).toContain('photoStatus === "loaded" && photos.length === 0 && "No streets here"');
  });
});
