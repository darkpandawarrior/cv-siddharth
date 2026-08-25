import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useHydrated } from "../lib/useHydrated.ts";

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
 * So the provider arrives on the client only. The server, and the hydration
 * render, emit `children` exactly as they would without it; the first render
 * after hydration swaps in the real provider. That swap remounts `children`
 * once, immediately after hydration and before anyone can have touched the
 * page, which is the price of a context that cannot exist on the server. It is
 * paid once and it is invisible.
 *
 * LCP is unaffected by design: the content is server-rendered and paints
 * before any of this runs. What it costs is a little hydration time, on two
 * routes, for a feature nobody needs in the first second.
 */
const PlayRoom = lazy(() => import("./PlayRoom.tsx").then((m) => ({ default: m.PlayRoom })));

export function DeferredPlayRoom({ children }: { children: ReactNode }) {
  // lazy() alone would not be enough — React resolves a lazy child while
  // streaming on the server, which would pull the module straight back in.
  if (!useHydrated()) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <PlayRoom>{children}</PlayRoom>
    </Suspense>
  );
}

/**
 * The same trick for the widgets, not just the provider.
 *
 * DeferredPlayRoom above keeps `@playhtml/react` off the server, but it only
 * covers the provider. The presence badge lives in PlayRoom.tsx itself, and
 * the plaque, the sandbox and the guest wall each import the library too, so a
 * page that named any of them still dragged it into the server bundle and
 * still died with `document is not defined`. That is what kept /playground on
 * `ssr: false`, and what kept it painting nothing at all until three.js
 * arrived.
 *
 * Each of these renders null on the server and for the first client render,
 * then loads. Null is the right placeholder: every one of them reports live
 * shared state, which genuinely does not exist yet at that moment. Nothing
 * that a visitor reads on arrival goes through here.
 */
function deferred<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Loaded = lazy(load);
  return function Deferred(props: P) {
    // Same reason as above: lazy() alone is not enough, because React resolves
    // a lazy child while streaming on the server.
    if (!useHydrated()) return null;
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    );
  };
}

export const DeferredPresenceBadge = deferred<{ className?: string }>(() =>
  import("./PlayRoom.tsx").then((m) => ({ default: m.PresenceBadge })),
);

export const DeferredVisitorPlaque = deferred<object>(() =>
  import("./Visitors.tsx").then((m) => ({ default: m.VisitorPlaque })),
);

export const DeferredSandbox = deferred<object>(() =>
  import("./Sandbox.tsx").then((m) => ({ default: m.Sandbox })),
);

/** Self-gating, so the GUEST_WALL_ENABLED flag stays inside the lazy chunk
 *  rather than forcing the module back into the server build to be read. */
export const DeferredGuestWall = deferred<object>(async () => {
  const m = await import("./GuestWall.tsx");
  const Gate: ComponentType = () => (m.GUEST_WALL_ENABLED ? <m.GuestWall /> : null);
  return { default: Gate };
});

/**
 * LivePulse, mounted on the client only.
 *
 * A provider rather than a widget, so it renders `children` untouched until it
 * loads, exactly like DeferredPlayRoom above. Consumers see PulseContext's
 * default in the meantime, which reports no counts and swallows a bump, and is
 * the honest answer before a socket exists.
 */
const LivePulse = lazy(() => import("./LivePulse.tsx"));

export function DeferredLivePulse({ children }: { children: ReactNode }) {
  if (!useHydrated()) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <LivePulse>{children}</LivePulse>
    </Suspense>
  );
}
