import { useCallback } from "react";
import { usePageData } from "@playhtml/react";
import { dedupeOncePerSecond } from "./pulse.ts";
import { ReactionRowView } from "./ReactionRow.tsx";
import {
  countsFor,
  itemKey,
  MAX_REACTION_COUNT,
  type ReactionKey,
  type ReactionState,
  type ReactionSurface,
} from "./reactions.ts";

/**
 * The half that touches playhtml, kept in its own module so the server never
 * loads it.
 *
 * `@playhtml/react` reads `document` when it is imported. /weeb and
 * /anthology both SERVER-RENDER, so a static import of it from a component
 * they mount threw `ReferenceError: document is not defined` inside
 * renderToReadableStream and collapsed both routes to about 470 characters of
 * shell — /anthology had been serving 4,331. Splitting the module is what
 * keeps it off the server; a `mounted` flag alone would not, because the
 * import is evaluated before any flag is read. Same shape as LabBench holding
 * SignalLab's leaflet back.
 */
const CHANNEL = "reactions-v1";
/* Same 1-per-second rule as pulse.ts, reusing its helper — a held finger is
 * one reaction, not forty. Own map because the key shape (surface:item:kind)
 * differs from PulseEvent. */
const lastReaction = new Map<string, number>();

export function LiveReactionRow({
  surface,
  itemId,
  className,
}: {
  surface: ReactionSurface;
  itemId: string;
  className?: string;
}) {
  const [state, setState] = usePageData<ReactionState>(CHANNEL, {});
  const react = useCallback(
    (reaction: ReactionKey) => {
      if (!dedupeOncePerSecond(`${surface}:${itemId}:${reaction}`, lastReaction)) return;
      setState((draft) => {
        const key = itemKey(surface, itemId);
        const current = draft[key] ?? {};
        current[reaction] = Math.min(MAX_REACTION_COUNT, (current[reaction] ?? 0) + 1);
        draft[key] = current;
      });
    },
    [setState, surface, itemId],
  );
  return <ReactionRowView counts={countsFor(state, surface, itemId)} onReact={react} className={className} />;
}
