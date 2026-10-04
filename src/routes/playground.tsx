import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { NODES } from "../data/storyMap.ts";
import { SOURCE_SPRING_ID } from "../world/v2/archiveGate.ts";
import Playground from "../Playground.tsx";

// Share crawlers need the published host even when previews serve assets locally.
const SHARE_IMAGE = "https://darkpandawarrior.github.io/cv/world/concept/01-golden-spawn-og.jpg";
type PlaygroundSearch = { world?: "v1"; at?: string };

export const Route = createFileRoute("/playground")({
  head: () => {
    const head = roomHead("/playground");
    return {
      ...head,
      meta: [
        ...(head.meta ?? []),
        { property: "og:image", content: SHARE_IMAGE },
        { property: "og:image:alt", content: "Concept painting of the Sangam valley at golden hour" },
        { name: "twitter:image", content: SHARE_IMAGE },
      ],
    };
  },
  validateSearch: (search: Record<string, unknown>): PlaygroundSearch => ({
    // ponytail: archive(world-v1) until 2027-04-04; removal recipe in ARCHIVE.md#world-v1
    world: search.world === "v1" ? "v1" : undefined,
    at: typeof search.at === "string" && (search.at === SOURCE_SPRING_ID || NODES.some((node) => node.id === search.at)) ? search.at : undefined,
  }),
  component: PlaygroundRoute,
});

const route = getRouteApi("/playground");

function PlaygroundRoute() {
  const { world, at } = route.useSearch();
  return (
    <div data-world={world}>
      <CursorAura />
      <Playground world={world} at={at} />
    </div>
  );
}
