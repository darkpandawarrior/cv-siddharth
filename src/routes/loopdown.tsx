import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { AmbientBackground } from "../AmbientBackground.tsx";
import { CursorAura } from "../CursorAura.tsx";
import { WritingView } from "../WritingView.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/loopdown")({
  head: () => roomHead("/loopdown"),
  ssr: false,
  component: () => (
    <div className="min-h-screen">
      <AmbientBackground />
      <CursorAura />
      <WritingView />
      <FloatingChat />
    </div>
  ),
});
