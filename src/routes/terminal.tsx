import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { Terminal } from "../Terminal.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/terminal")({
  head: () => roomHead("/terminal"),
  ssr: false,
  component: () => (
    <>
      <Terminal />
      <FloatingChat />
    </>
  ),
});
