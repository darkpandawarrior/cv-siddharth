import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { RoomFrame } from "../rooms.tsx";
import { Globe } from "../Globe.tsx";

type GlobeSearch = { focus?: "pune" };

/**
 * GLOBE (living-ledger-spec.md#6.3): the third altitude, `/map`'s ORBIT
 * handing off here via `/globe?focus=pune` (altitude.ts's focusHandoffUrl).
 * Pune is already the one place every GLOBE feature anchors to (the reach
 * columns, the employer ring, the origin chip), so an unknown or missing
 * `focus` value renders the identical scene rather than throwing - the same
 * "never throws" contract altitude.test.ts already holds `/map`'s own
 * `?focus=` to.
 *
 * Server-rendered now, same reasoning as `/map`: `Globe` already starts its
 * WebGL branch closed and only opens it inside an effect, so the server was
 * always going to render the same fact-list body the no-WebGL branch does.
 *
 * Never mounts FloatingChat here - SP-10 mounts it once from `__root`.
 */
export const Route = createFileRoute("/globe")({
  head: () => roomHead("/globe"),
  validateSearch: (search: Record<string, unknown>): GlobeSearch => ({
    focus: search.focus === "pune" ? "pune" : undefined,
  }),
  component: GlobeRoute,
});

function GlobeRoute() {
  return (
    <RoomFrame title="GLOBE" tagline="the reach, from orbit">
      <Globe />
    </RoomFrame>
  );
}
