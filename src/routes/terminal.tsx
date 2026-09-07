import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import { Terminal } from "../Terminal.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

// Server-rendered now: the boot banner is a deterministic literal (see
// Terminal.tsx), not something read from the browser, so there is a real
// first paint to send instead of an empty shell.
export const Route = createFileRoute("/terminal")({
  head: () => roomHead("/terminal"),
  component: () => (
    <>
      <Terminal />
      <FloatingChat />
    </>
  ),
});
