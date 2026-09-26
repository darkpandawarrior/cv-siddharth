import { lazy } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import Playground from "../Playground.tsx";

type PlaygroundSearch = { world?: "v2" };

// M56/M67 — the world-v2 hub is preview-only: it renders on every branch
// deploy and local dev, but a PRODUCTION build of `/playground?world=v2`
// falls back to the unchanged v1 world (this lane's own acceptance line).
// `import.meta.env.VITE_VERCEL_ENV` is a build-time constant Vite inlines,
// so this branch is identical on the server and the client — no hydration
// mismatch from checking it here rather than a runtime request header.
const WORLD_V2_ALLOWED = import.meta.env.VITE_VERCEL_ENV !== "production";

const worldV2LoadingFallback = (
  <div className="flex h-full items-center justify-center font-mono text-sm text-muted">loading the world…</div>
);

// Lazy: nothing outside this branch pays for WorldV2's own three.js/drei/
// postprocessing chunk, and it never even reaches the SERVER compile
// (`<ClientOnly>` strips it there, the same pattern `Playground.tsx` uses
// for v1's own `World.tsx`) — see this lane's own acceptance line on the
// WorldV2 chunk staying separate from the v1 Playground chunk.
const WorldV2 = lazy(() => import("../world/v2/WorldV2.tsx"));

export const Route = createFileRoute("/playground")({
  head: () => roomHead("/playground"),
  validateSearch: (search: Record<string, unknown>): PlaygroundSearch => ({
    world: search.world === "v2" ? "v2" : undefined,
  }),
  /*
   * This route server-renders, unlike the other WebGL rooms — see below for
   * why that is unaffected by the world=v2 branch this lane adds.
   */
  component: PlaygroundRoute,
});

function PlaygroundRoute() {
  const { world } = Route.useSearch();
  const showV2 = world === "v2" && WORLD_V2_ALLOWED;

  if (showV2) {
    return (
      <div className="relative h-screen w-screen overflow-hidden">
        <ClientOnly fallback={worldV2LoadingFallback}>
          <Hydrate when={load()} split fallback={worldV2LoadingFallback}>
            <WorldV2 />
          </Hydrate>
        </ClientOnly>
      </div>
    );
  }

  return (
    <div data-world="v1">
      <CursorAura />
      <Playground />
    </div>
  );
}
