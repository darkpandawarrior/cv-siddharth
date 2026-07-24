import { createFileRoute } from "@tanstack/react-router";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../Playground.tsx";
import { StoryMap } from "../StoryMap.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/map")({
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
