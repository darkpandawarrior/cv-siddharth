import { createFileRoute } from "@tanstack/react-router";
import { OpsBoard } from "../OpsBoard.tsx";

export const Route = createFileRoute("/ops")({
  head: () => ({
    meta: [
      { title: "The Ops Board — Siddharth Pandalai" },
      {
        name: "description",
        content:
          "A control loop rendered as a page: every workflow, every generated dataset against its SLA, the shipped fleet, and the incidents a green check did not catch.",
      },
    ],
    links: [{ rel: "canonical", href: "https://cv-siddharth.vercel.app/ops" }],
  }),
  // Client-only, for the same reason /pulse is: every age on this board is
  // computed at load and the control tower is read live, so a server render
  // would ship a timestamp that is already wrong by the time it is read — and
  // React would flag the mismatch, which it did (error #418 on capture).
  // A board whose subject is stale data must not be served stale.
  ssr: false,
  component: OpsBoard,
});
