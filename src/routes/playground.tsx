import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { roomHead } from "../lib/routeHead.ts";
import { CursorAura } from "../CursorAura.tsx";
import Playground from "../Playground.tsx";
import { FloatingChat } from "../FloatingChat.tsx";
import { isCaptured, isWorldActive, subscribeCaptured } from "../world/input.ts";

/**
 * The FAB floats over the same canvas a driving craft steers in. Left up
 * unconditionally it sits on top of the HUD's own corner controls (and eats
 * the taps meant for them) the moment the world is actually being driven.
 * Gated on `isWorldActive() && isCaptured()` rather than `isCaptured()`
 * alone: captured defaults to `true` before the world ever mounts (see
 * input.ts), so reading it by itself would hide the FAB on the list view
 * too, before anyone has touched a control.
 */
function PlaygroundFloatingChat() {
  const [hide, setHide] = useState(() => isWorldActive() && isCaptured());
  useEffect(() => subscribeCaptured((captured) => setHide(isWorldActive() && captured)), []);
  return hide ? null : <FloatingChat />;
}

export const Route = createFileRoute("/playground")({
  head: () => roomHead("/playground"),
  /*
   * This route server-renders, unlike the other WebGL rooms.
   *
   * It used to be `ssr: false` like the rest of them, which meant the server
   * sent a shell and a phone saw nothing at all until the client bundle and
   * three.js had both arrived. Lighthouse did not score it slow, it scored it
   * NO_FCP: the page painted no content whatsoever.
   *
   * There is no reason for that here, because this route already has a real
   * thing to show without any of it. The world only mounts once a capability
   * check passes in an effect, so the server always renders the other branch,
   * which is the room grid plus the baked corridor plate. That is a complete,
   * readable page, and it is now the first paint instead of the last resort.
   * The world replaces it after hydration on hardware that can run it.
   */
  component: () => (
    <>
      <CursorAura />
      <Playground />
      <PlaygroundFloatingChat />
    </>
  ),
});
