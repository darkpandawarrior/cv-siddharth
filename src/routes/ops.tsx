import { createFileRoute } from "@tanstack/react-router";
import { OpsBoard } from "../OpsBoard.tsx";
import { roomHead } from "../lib/routeHead.ts";

export const Route = createFileRoute("/ops")({
  head: () => roomHead("/ops"),
  // Client-only, for the same reason /pulse is: every age on this board is
  // computed at load and the control tower is read live, so a server render
  // would ship a timestamp that is already wrong by the time it is read — and
  // React would flag the mismatch, which it did (error #418 on capture).
  // A board whose subject is stale data must not be served stale.
  ssr: false,
  component: OpsBoard,
});
