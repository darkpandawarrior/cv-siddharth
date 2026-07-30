import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { ChessRoom } from "../ChessRoom.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/chess")({
  head: () => roomHead("/chess"),
  ssr: false,
  component: () => (
    <>
      <CursorAura />
      <RoomFrame title="The Board" tagline="seven years of games, mined">
        <ChessRoom />
      </RoomFrame>
      <FloatingChat />
    </>
  ),
});
