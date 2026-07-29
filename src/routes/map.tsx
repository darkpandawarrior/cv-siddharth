import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { StoryMap } from "../StoryMap.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/map")({
  head: () => roomHead("/map"),
  ssr: false,
  component: () => (
    <>
      <CursorAura />
      <RoomFrame title="The 3D Storyboard" tagline="the projects as a constellation">
        <StoryMap />
      </RoomFrame>
      <FloatingChat />
    </>
  ),
});
