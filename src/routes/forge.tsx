import { createFileRoute } from "@tanstack/react-router";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../Playground.tsx";
import { ParticleWordmark } from "../ParticleWordmark.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/forge")({
  ssr: false,
  component: () => (
    <>
      <CursorAura />
      <RoomFrame title="The Particle Forge" tagline="physics on a canvas">
        <ParticleWordmark />
      </RoomFrame>
      <FloatingChat />
    </>
  ),
});
