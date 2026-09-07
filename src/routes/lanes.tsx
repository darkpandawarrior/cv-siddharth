import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import Lanes from "../Lanes.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/lanes")({
  head: () => roomHead("/lanes"),
  component: () => (
    <>
      <Lanes />
      <FloatingChat />
    </>
  ),
});
