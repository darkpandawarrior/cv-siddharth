import { createFileRoute } from "@tanstack/react-router";
import { CursorAura } from "../CursorAura.tsx";
import Playground from "../Playground.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/playground")({
  ssr: false,
  component: () => (
    <>
      <CursorAura />
      <Playground />
      <FloatingChat />
    </>
  ),
});
