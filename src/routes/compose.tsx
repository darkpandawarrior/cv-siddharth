import { createFileRoute } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { roomHead } from "../lib/routeHead.ts";
import { FloatingChat } from "../FloatingChat.tsx";
import ComposePlayground from "../ComposePlayground.tsx";

export const Route = createFileRoute("/compose")({
  head: () => roomHead("/compose"),
  ssr: false,
  component: () => (
    // The Compose Playground ships its interpreter in its own chunk (this
    // route is `ssr: false`, so `<Hydrate when={load()} split>` is doing
    // nothing but code-splitting here — load() fires as soon as the boundary
    // is reached, same timing the old dynamic import gave it), loaded only
    // when a visitor opens #compose.
    <Hydrate
      when={load()}
      split
      fallback={
        <div className="flex h-screen items-center justify-center bg-void font-mono text-sm text-muted">
          spinning up the compose playground…
        </div>
      }
    >
      <ComposePlayground />
      <FloatingChat />
    </Hydrate>
  ),
});
