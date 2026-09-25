import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { StoryMap } from "../StoryMap.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
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

function MapRoute() {
  const { focus } = Route.useSearch();
  return (
    <>
      <CursorAura />
      <RoomFrame title="The 3D Storyboard" tagline="the projects as a constellation">
        <StoryMap focus={focus} />
      </RoomFrame>
      <FloatingChat />
    </>
  );
}
