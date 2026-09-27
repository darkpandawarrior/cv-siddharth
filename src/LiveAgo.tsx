import { useAgo } from "./lib/useAgo.ts";

/** Thin wrapper around `useAgo`: renders nothing pre-mount (SSR) or when
 *  `iso` doesn't resolve to an age yet, a real ticking string once it does.
 *  Every "as of <date>" / "N ago" stamp on a page can reach for this instead
 *  of a fresh ms/hour/day calc. */
export function LiveAgo({ iso, className }: { iso: string; className?: string }) {
  const ago = useAgo(iso);
  if (!ago) return null;
  return <span className={className}>{ago}</span>;
}
