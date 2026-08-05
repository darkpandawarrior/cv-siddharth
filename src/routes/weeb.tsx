import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { WeebRoom } from "../WeebRoom.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/weeb")({
  head: () => roomHead("/weeb"),
  component: () => (
    <>
      <CursorAura />
      <RoomFrame title="Weeb Central" tagline="a hand-kept list, read as evidence">
        <WeebRoom />
      </RoomFrame>
      <FloatingChat />
    </>
  ),
});
