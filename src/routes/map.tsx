import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { StoryMap } from "../StoryMap.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

// Server-rendered now: StoryMap already starts `mounted` false and only
// switches to the 3D scene (or even the 2D canvas) inside an effect, so the
// server was always going to render the same heading/legend/link/chip-row
// body the 2D fallback renders — ssr:false just withheld it.
export const Route = createFileRoute("/map")({
  head: () => roomHead("/map"),
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
