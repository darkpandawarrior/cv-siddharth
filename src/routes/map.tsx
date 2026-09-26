import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { StoryMap } from "../StoryMap.tsx";
import { NODES } from "../data/storyMap.ts";

type MapSearch = { focus?: string };

// Server-rendered now: StoryMap already starts `mounted` false and only
// switches to the 3D scene (or even the 2D canvas) inside an effect, so the
// server was always going to render the same heading/legend/link/chip-row
// body the 2D fallback renders — ssr:false just withheld it.
export const Route = createFileRoute("/map")({
  head: () => roomHead("/map"),
  // Living-ledger §6.2's focus hand-off: `?focus=<node id>` arrives from
  // STREET or a shared link. Validated against the real node set here so the
  // component never has to guard against a bogus id; an unknown value
  // resolves to `undefined`, the default view, and never throws.
  validateSearch: (search: Record<string, unknown>): MapSearch => {
    const focus = typeof search.focus === "string" ? search.focus : undefined;
    return { focus: focus && NODES.some((n) => n.id === focus) ? focus : undefined };
  },
  component: MapRoute,
});

// getRouteApi("/map"), not `Route.useSearch()`: this component is split into
// its own lazy chunk (`?tsr-split=component`), and referencing the `Route`
// object it was split OUT of pulls the whole module — Route, validateSearch,
// createFileRoute call and all — back in, which Rollup can only resolve by
// treating this chunk and the framework's always-eager client entry as one
// circular group. That leaked StoryMap.tsx's three.js weight into EVERY
// route's cold-load graph, not just /map's (G3's total-size ceiling, not
// just /map's own budget — confirmed via the built manifest: client.tsx's
// own `imports` listed storyMap-*.js before this fix). getRouteApi reads
// only the route id (a string), so the split chunk never re-imports its own
// parent module.
const route = getRouteApi("/map");

function MapRoute() {
  const { focus } = route.useSearch();
  return (
    <>
      <CursorAura />
      <RoomFrame title="The 3D Storyboard" tagline="the projects as a constellation">
        <StoryMap focus={focus} />
      </RoomFrame>
    </>
  );
}
