import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import Playground from "../Playground.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/playground")({
  head: () => roomHead("/playground"),
  /*
   * This route server-renders, unlike the other WebGL rooms.
   *
   * It used to be `ssr: false` like the rest of them, which meant the server
   * sent a shell and a phone saw nothing at all until the client bundle and
   * three.js had both arrived. Lighthouse did not score it slow, it scored it
   * NO_FCP: the page painted no content whatsoever.
   *
   * There is no reason for that here, because this route already has a real
   * thing to show without any of it. The world only mounts once a capability
   * check passes in an effect, so the server always renders the other branch,
   * which is the room grid plus the baked corridor plate. That is a complete,
   * readable page, and it is now the first paint instead of the last resort.
   * The world replaces it after hydration on hardware that can run it.
   */
  component: () => (
    <>
      <CursorAura />
      <Playground />
      <FloatingChat />
    </>
  ),
});
