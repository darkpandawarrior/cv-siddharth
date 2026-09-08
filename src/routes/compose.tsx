import { createFileRoute } from "@tanstack/react-router";
import { roomHead } from "../lib/routeHead.ts";
import ComposePlayground from "../ComposePlayground.tsx";
import { FloatingChat } from "../FloatingChat.tsx";

/**
 * Server-rendered now, like /playground and /blueprint: the interpreter and
 * the phone-frame preview are plain JS/DOM, not WebGL, so there was never a
 * three.js reason for ssr:false here — only the `?c=` share-link read (see
 * ComposePlayground.tsx), which now resolves in an effect instead of at
 * render, so the server has a real, deterministic first paint to send.
 */
export const Route = createFileRoute("/compose")({
  head: () => roomHead("/compose"),
  component: () => (
    <>
      <ComposePlayground />
      <FloatingChat />
    </>
  ),
});
