import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import BlueprintRoom from "../BlueprintRoom.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

/**
 * Server-rendered now, like /playground: BlueprintRoom already gates its own
 * heavy tldraw/three.js branches behind `<ClientOnly>` + `<Hydrate when={load()}
 * split>` (see BlueprintRoom.tsx), so the outer room — header, mode pills, the
 * "needs WebGL" floor text, the next-room pager — is a real page before any of
 * that loads. No outer lazy() or Hydrate either: this route wants BlueprintRoom
 * in the SSR render, not deferred past it, and the heavy SDK still only
 * downloads once a mode is actually mounted.
 */
export const Route = createFileRoute("/blueprint")({
  head: () => roomHead("/blueprint"),
  component: () => (
    <>
      <BlueprintRoom />
      <FloatingChat />
    </>
  ),
});
