import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "../Terminal.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/terminal")({
  ssr: false,
  component: () => (
    <>
      <Terminal />
      <FloatingChat />
    </>
  ),
});
