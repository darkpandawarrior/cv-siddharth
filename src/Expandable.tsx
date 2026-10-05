import { useId, useState, type ReactNode } from "react";

/**
 * A hard `.slice()` drops real content with no way to see it. Expandable
 * renders the first `visibleCount` items, then — only if there's more — a
 * real toggle button ("+N more") that reveals the rest. Collapsed by
 * default. One component, reused wherever a list gets truncated.
 *
 * Lifted out of App.tsx so /weeb can use it too. Importing it from App.tsx
 * would have pulled the whole homepage module — hero, chat, three.js scenes —
 * into the weeb route's chunk for the sake of one 30-line component.
 *
 * Renders `<li>`s: every call site is inside a `<ul>`.
 */
export function Expandable<T>({
  items,
  visibleCount,
  renderItem,
}: {
  // readonly T[], not T[]: every src/data file the site renders from is
  // written `as const` by its generator, so a readonly tuple is the normal
  // shape here. Demanding a mutable array made T collapse to `unknown` at the
  // one call site that passed generated data, and the whole render lost its
  // types without tsc --noEmit noticing (tsc -b did).
  items: readonly T[];
  visibleCount: number;
  renderItem: (item: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const hiddenCount = items.length - visibleCount;
  if (hiddenCount <= 0) return <>{items.map(renderItem)}</>;
  return (
    <>
      {items.slice(0, visibleCount).map(renderItem)}
      <li className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          // Some call sites (the project cards) nest this inside a
          // click-to-navigate wrapper — stop the toggle from also firing that.
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          onKeyDown={(e) => e.stopPropagation()}
          className="kicker-accent w-fit transition hover:opacity-80"
        >
          {expanded ? "show less" : `+ ${hiddenCount} more`}
        </button>
        <ul id={id} hidden={!expanded} className="space-y-2">
          {items.slice(visibleCount).map(renderItem)}
        </ul>
      </li>
    </>
  );
}
