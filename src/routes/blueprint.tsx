import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { FloatingChat } from "../FloatingChat.tsx";

// The tldraw SDK loads only when someone actually enters the Blueprint Room.
const BlueprintRoom = lazy(() => import("../BlueprintRoom.tsx"));

export const Route = createFileRoute("/blueprint")({
  ssr: false,
  component: () => (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center font-mono text-sm text-zinc-500">
          drafting the blueprint room…
        </div>
      }
    >
      <BlueprintRoom />
      <FloatingChat />
    </Suspense>
  ),
});
