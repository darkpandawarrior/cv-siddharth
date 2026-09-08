import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import { RoomFrame } from "../rooms.tsx";
import { ParticleWordmark } from "../ParticleWordmark.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

// Server-rendered now: ParticleWordmark's canvas draws entirely inside a
// useEffect (see ParticleWordmark.tsx) — nothing in its render path touches
// window/document, so there was no three.js/SSR hazard ssr:false was ever
// protecting here, just an empty body for no reason.
export const Route = createFileRoute("/forge")({
  head: () => roomHead("/forge"),
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
