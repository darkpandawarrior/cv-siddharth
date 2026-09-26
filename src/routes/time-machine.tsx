import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import TimeMachine from "../TimeMachine.tsx";

export const Route = createFileRoute("/time-machine")({
  head: () => roomHead("/time-machine"),
  component: () => (
    <>
      <TimeMachine />
    </>
  ),
});
