import { Component, type ReactNode } from "react";
import { PlayProvider, useCursorPresences } from "@playhtml/react";
import { Users } from "lucide-react";
import { VisitorProvider } from "./Visitors.tsx";

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

/**
 * Makes point 3 above actually true.
 *
 * "Every hook falls back to its default" holds for a socket that drops, but not
 * for one that never starts: PlayProvider surfaces an init failure by throwing
 * it from render, which the router's error boundary turns into the whole route
 * being replaced by an error page. A browser with site data blocked hits this —
 * playhtml keeps its player identity in localStorage — so /playground, /pulse
 * and /blueprint would show "Something broke" to someone whose only crime was
 * turning off cookies, on pages that are perfectly readable without any of it.
 *
 * Catching it here drops the shared layer and renders the rooms plain: no
 * cursors, no counters, no wall, everything else exactly as it was. That is the
 * degradation the comment above promises, and this is what enforces it.
 */
class SharedLayerBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Worth a line in the console — a room quietly losing its shared layer
    // should be findable — but not worth a visitor's attention.
    console.warn("[play] shared layer unavailable; rendering rooms without it", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function PlayRoom({ children }: { children: ReactNode }) {
  return (
    <SharedLayerBoundary fallback={children}>
      <PlayProvider
        initOptions={{
          room: ROOM,
          // Cursors get their own scope: "page" keeps presence per route, so the
          // badge means "people in this room" while the shared documents above
          // stay site-wide.
          cursors: { enabled: true, room: "page" },
        }}
      >
        {/* Inside the provider because it reads the shared document, and around
            every room because an arrival should count the same wherever it
            lands — the plaque that displays it only renders on /playground. */}
        <VisitorProvider>{children}</VisitorProvider>
      </PlayProvider>
    </SharedLayerBoundary>
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
