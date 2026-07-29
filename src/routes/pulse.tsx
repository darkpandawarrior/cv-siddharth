import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import Pulse from "../Pulse.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/pulse")({
  head: () => roomHead("/pulse"),
  // Client-only, like the other shared-layer routes: the numbers come off a
  // websocket, so there is nothing meaningful to render on the server.
  ssr: false,
  component: () => (
    <>
      <CursorAura />
      <Pulse />
      <FloatingChat />
    </>
  ),
});
