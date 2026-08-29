import { useEffect, type RefObject } from "react";

/**
 * Make everything outside `ref` inert while `active` is true.
 *
 * `aria-modal="true"` is a hint to assistive tech and nothing more: it does not
 * remove the page behind from the accessibility tree, and it does not stop Tab
 * walking straight out of the dialog into the route underneath. `inert` does
 * both, and it is why the first run of the launcher's own axe test failed —
 * with the backdrop dimming the page to 1.31:1, every heading still in the tree
 * behind the overlay reported a serious contrast violation. Those elements are
 * not the bug; scanning them at all was, and the same gap let focus escape.
 *
 * The launcher had this inline and the other two overlays did not, so the
 * command palette declared aria-modal while inerting nothing (a hand-rolled Tab
 * trap instead, which browse-mode users walk straight past), and the expanded
 * chat let Tab out after ten stops onto nine controls hidden behind it.
 *
 * Walks up from the element rather than filtering `document.body.children`,
 * which is what the launcher's version did: the launcher IS a body child, but
 * FloatingChat is mounted inside the routed content, so "every body child that
 * is not me" would have inerted the panel's own ancestor. Inerting each
 * ancestor's siblings covers both, and is the same set for a body-child dialog.
 */
export function useInertBackdrop(active: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const mine = ref.current;
    if (!active || !mine) return;
    const touched: [HTMLElement, boolean][] = [];
    for (let node: HTMLElement | null = mine; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling === node || !(sibling instanceof HTMLElement)) continue;
        touched.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
    }
    return () => {
      for (const [el, previous] of touched) el.inert = previous;
    };
  }, [active, ref]);
}
