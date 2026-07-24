import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { FloatingChat } from "../FloatingChat.tsx";

// The Compose Playground ships its interpreter in its own chunk, loaded only
// when a visitor opens #compose.
const ComposePlayground = lazy(() => import("../ComposePlayground.tsx"));

export const Route = createFileRoute("/compose")({
  ssr: false,
  component: () => (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-void font-mono text-sm text-zinc-500">
          spinning up the compose playground…
        </div>
      }
    >
      <ComposePlayground />
      <FloatingChat />
    </Suspense>
  ),
});
