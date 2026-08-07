import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { Shipped } from "../Shipped.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/shipped")({
  head: () => roomHead("/shipped"),
  ssr: false,
  component: () => (
    <>
      <Shipped />
      <FloatingChat />
    </>
  ),
});
