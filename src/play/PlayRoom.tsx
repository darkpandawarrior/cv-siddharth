import type { ReactNode } from "react";
import { PlayProvider, useCursorPresences } from "@playhtml/react";
import { Users } from "lucide-react";

/**
 * The shared layer — playhtml (https://github.com/spencerc99/playhtml) over a
 * hosted PartyKit room, giving the interactive rooms live cursors, presence and
 * state that outlives the tab it was made in.
 *
 * Deliberately scoped, for three reasons:
 *
 *  1. Weight. playhtml bundles Yjs + partysocket. It's only imported from the
 *     `/playground` and `/blueprint` route chunks (both already `ssr: false`
 *     and code-split), so the landing page never pays for it — the same
 *     per-route budget discipline three.js and tldraw already get here.
 *  2. Blast radius. Everything shared is bounded: presence, counters, movable
 *     tiles from a fixed set, and a length-capped wall. The blueprint's own
 *     diagram stays local to each visitor. The canvas is mine; the margins are
 *     theirs.
 *  3. It is someone else's free server. There is no SLA and no encryption, and
 *     the docs are explicit that anyone with the room name can read and write.
 *     So nothing here is load-bearing: when the socket is down every hook falls
 *     back to its default and the page just behaves like a normal page.
 *
 * Room names are automatically prefixed with `window.location.hostname` by the
 * library, so localhost never writes into the deployed site's state.
 */

/* One room for the whole site, deliberately — `usePageData` is scoped to the
 * room, so a room per route would have put /playground's interaction counts and
 * /blueprint's into two documents that /pulse could never add together. The
 * per-route feel comes from the cursor room instead, which is configured
 * separately below. */
const ROOM = "cv-siddharth";

export function PlayRoom({ children }: { children: ReactNode }) {
  return (
    <PlayProvider
      initOptions={{
        room: ROOM,
        // Cursors get their own scope: "page" keeps presence per route, so the
        // badge means "people in this room" while the shared documents above
        // stay site-wide.
        cursors: { enabled: true, room: "page" },
      }}
    >
      {children}
    </PlayProvider>
  );
}

/** "3 here now" — live count of other people in the same room. Renders nothing
 *  when you're alone, so an empty room stays quiet instead of advertising it. */
export function PresenceBadge({ className = "" }: { className?: string }) {
  const presences = useCursorPresences();
  // The map counts you as well as everyone else, so one entry means an empty
  // room. Nothing renders until there is actually company.
  if (presences.size < 2) return null;
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border border-accent2/40 bg-accent2/10 px-2.5 py-1 font-mono text-[11px] text-accent2 ${className}`}
      title="People exploring this room right now — move your mouse and they can see it too"
    >
      <Users size={12} /> {presences.size} here now
    </span>
  );
}
