import { lazy, Suspense, useEffect, useState } from "react";
import {
  REACTION_KEYS,
  REACTIONS,
  type ReactionCounts,
  type ReactionKey,
  type ReactionSurface,
} from "./reactions.ts";

/**
 * A row of the three fixed reactions. One component so /chess, /weeb and
 * /anthology don't each hand-roll the same three buttons — `className` is the
 * per-surface knob for spacing, everything else rides the surrounding card's
 * own text and border tokens so it never introduces a new hue.
 *
 * THIS MODULE MUST NOT IMPORT @playhtml/react. It reads `document` on import,
 * and /weeb and /anthology server-render: a static import threw
 * `ReferenceError: document is not defined` inside renderToReadableStream and
 * collapsed both routes to a ~470-character shell. The live half lives in
 * LiveReactionRow.tsx and is lazy-loaded after mount, so the server renders
 * the same markup with zero counts and the client swaps in the shared ones.
 * Identical shape either way, so there is no layout shift on hydration.
 */
export function ReactionRowView({
  counts,
  onReact,
  className = "",
}: {
  counts: ReactionCounts;
  onReact?: (reaction: ReactionKey) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label="React to this">
      {REACTION_KEYS.map((key) => {
        const meta = REACTIONS[key];
        const n = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={onReact ? () => onReact(key) : undefined}
            disabled={!onReact}
            title={meta.label}
            aria-label={`${meta.label}${n ? `, ${n} so far` : ""}`}
            className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted transition hover:border-accent/50 hover:text-accent disabled:opacity-70"
          >
            <span aria-hidden>{meta.emoji}</span>
            {n > 0 && <span className="tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

const LiveReactionRow = lazy(() =>
  import("./LiveReactionRow.tsx").then((m) => ({ default: m.LiveReactionRow })),
);

export function ReactionRow({
  surface,
  itemId,
  className = "",
}: {
  surface: ReactionSurface;
  itemId: string;
  className?: string;
}) {
  // lazy() alone is not enough: React resolves a lazy child while streaming on
  // the server, which would pull @playhtml/react back in. The mount flag is
  // what guarantees the server never reaches it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const placeholder = <ReactionRowView counts={{}} className={className} />;
  if (!mounted) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <LiveReactionRow surface={surface} itemId={itemId} className={className} />
    </Suspense>
  );
}
