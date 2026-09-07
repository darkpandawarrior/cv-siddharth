import { createFileRoute } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { roomHead } from "../lib/routeHead.ts";
import { FloatingChat } from "../FloatingChat.tsx";
import BlueprintRoom from "../BlueprintRoom.tsx";

export const Route = createFileRoute("/blueprint")({
  head: () => roomHead("/blueprint"),
  ssr: false,
  component: () => (
    // The tldraw SDK loads only when someone actually enters the Blueprint
    // Room. This route is `ssr: false`, so `<Hydrate when={load()} split>` is
    // doing nothing but code-splitting here — load() fires as soon as the
    // boundary is reached, same timing the old dynamic import gave it.
    <Hydrate
      when={load()}
      split
      fallback={
        <div className="flex h-screen items-center justify-center font-mono text-sm text-muted">
          drafting the blueprint room…
        </div>
      }
    >
      <BlueprintRoom />
      <FloatingChat />
    </Hydrate>
  ),
});
