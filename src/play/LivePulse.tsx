import { useEffect, useMemo, type ReactNode } from "react";
import { usePulse, usePulseCounts } from "./pulse.ts";
import { PulseContext, type PulseUI } from "./pulseUI.ts";

/**
 * Fills PulseContext with the real shared counter.
 *
 * Client only, and deliberately a separate module from pulseUI.ts: this is the
 * half that imports the shared layer, so it must stay out of any graph the
 * server walks. DeferredLivePulse in DeferredPlayRoom.tsx is how it gets
 * mounted, and it renders its children unchanged until then.
 */
export default function LivePulse({ children }: { children: ReactNode }) {
  const counts = usePulseCounts();
  const bump = usePulse();
  const value = useMemo(() => ({ counts, bump }), [counts, bump]);
  return <PulseContext.Provider value={value}>{children}</PulseContext.Provider>;
}

/** Publishes shared state without replacing the route subtree with a provider. */
export function PulseBridge({ publish }: { publish: (value: PulseUI) => void }) {
  const counts = usePulseCounts();
  const bump = usePulse();
  useEffect(() => { publish({ counts, bump }); }, [counts, bump, publish]);
  return null;
}
