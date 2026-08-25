import { useMemo, type ReactNode } from "react";
import { usePulse, usePulseCounts } from "./pulse.ts";
import { PulseContext } from "./pulseUI.ts";

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
