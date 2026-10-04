import { lazy, Suspense } from "react";
import type { GlobeHudProps } from "./ui/HudControls.tsx";
export type { GlobeHudProps } from "./ui/HudControls.tsx";

const HudControls = lazy(() => import("./ui/HudControls.tsx"));

export function GlobeHud(props: GlobeHudProps) {
  return <Suspense fallback={null}><HudControls {...props} /></Suspense>;
}
