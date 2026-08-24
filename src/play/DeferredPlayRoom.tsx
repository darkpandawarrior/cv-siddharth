import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

/**
 * PlayRoom for a route that SERVER-RENDERS.
 *
 * PlayRoom imports `@playhtml/react`, which reads `document` on import. The
 * four routes that mount it today are all `ssr: false`, so that never
 * mattered. /weeb and /anthology are not — they serve 3,240 and 4,400
 * characters of real HTML — and a static import there collapsed both to a
 * ~470-character shell with `ReferenceError: document is not defined` inside
 * renderToReadableStream.
 *
 * So the provider arrives on the client only. The server, and the first client
 * render, emit `children` exactly as they would without it; an effect then
 * swaps in the real provider. That swap remounts `children` once, immediately
 * after hydration and before anyone can have touched the page, which is the
 * price of a context that cannot exist on the server. It is paid once and it
 * is invisible.
 *
 * LCP is unaffected by design: the content is server-rendered and paints
 * before any of this runs. What it costs is a little hydration time, on two
 * routes, for a feature nobody needs in the first second.
 */
const PlayRoom = lazy(() => import("./PlayRoom.tsx").then((m) => ({ default: m.PlayRoom })));

export function DeferredPlayRoom({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // lazy() alone would not be enough — React resolves a lazy child while
  // streaming on the server, which would pull the module straight back in.
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <PlayRoom>{children}</PlayRoom>
    </Suspense>
  );
}
