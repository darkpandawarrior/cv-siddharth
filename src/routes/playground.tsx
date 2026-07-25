import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import Playground from "../Playground.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/playground")({
  head: () => roomHead("/playground"),
  ssr: false,
  component: () => (
    <>
      <CursorAura />
      <Playground />
      <FloatingChat />
    </>
  ),
});
