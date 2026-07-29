import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { ParticleWordmark } from "../ParticleWordmark.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/forge")({
  head: () => roomHead("/forge"),
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
