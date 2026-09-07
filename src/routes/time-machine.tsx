import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import TimeMachine from "../TimeMachine.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

export const Route = createFileRoute("/time-machine")({
  head: () => roomHead("/time-machine"),
  component: () => (
    <>
      <TimeMachine />
      <FloatingChat />
    </>
  ),
});
