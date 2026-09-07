import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";

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
 * So the provider arrives on the client only, via `<ClientOnly>` rather than
 * a hand-rolled `useHydrated()` check: Start's compiler recognises the JSX
 * (config.js registers `ClientOnly` from `@tanstack/react-router` as the
 * `ClientOnlyJSX` kind) and strips its children from the SERVER compile
 * entirely — `<ClientOnly fallback={children}>{clientOnlyContent}</ClientOnly>`
 * becomes `<ClientOnly fallback={children} />` before the SSR bundle is even
 * built, so `lazy(() => import("./PlayRoom.tsx"))` and its `@playhtml/react`
 * import are dead-code-eliminated out of that build rather than merely
 * skipped at runtime. `lazy()` alone does not do this: React still resolves a
 * lazy child while streaming on the server, and importProtection's static
 * scan still finds the dynamic import target's chunk either way — confirmed
 * by reproducing it (see PR body).
 *
 * LCP is unaffected by design: the content is server-rendered and paints
 * before any of this runs. What it costs is a little hydration time, on two
 * routes, for a feature nobody needs in the first second.
 */
const PlayRoom = lazy(() => import("./PlayRoom.tsx").then((m) => ({ default: m.PlayRoom })));

export function DeferredPlayRoom({ children }: { children: ReactNode }) {
  return (
    <ClientOnly fallback={children}>
      <Suspense fallback={children}>
        <PlayRoom>{children}</PlayRoom>
      </Suspense>
    </ClientOnly>
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
 * Each of these renders nothing on the server (`<ClientOnly>` with no
 * `fallback` renders null there, and is stripped to a childless, propless
 * element for the SSR compile) then loads on the client. Null is the right
 * placeholder: every one of them reports live shared state, which genuinely
 * does not exist yet at that moment. Nothing that a visitor reads on arrival
 * goes through here.
 *
 * Deliberately NOT one generic `deferred(load)` factory returning a component
 * per call site (an earlier version did this): Start's compiler strips
 * `<ClientOnly>`'s children at the JSX call site, which only frees the
 * `lazy()` binding it references when that binding is private to the ONE
 * function whose JSX got stripped. A shared factory's `lazy(load)` lives in
 * the FACTORY's own scope, not the returned component's, and each
 * `export const DeferredX = deferred(...)` is itself an exported binding —
 * never eliminable — so the dynamic import stayed reachable regardless of
 * what happened inside the returned closure (confirmed by reproducing it:
 * DeferredSandbox still failed the same way after the JSX was wrapped).
 * Each `lazy()` below is a private, unexported const whose only reference is
 * the one exported function's `<ClientOnly>` JSX, matching DeferredPlayRoom
 * and DeferredLivePulse above — the shape that's actually proven to work.
 */
const PresenceBadge = lazy(() => import("./PlayRoom.tsx").then((m) => ({ default: m.PresenceBadge })));

export function DeferredPresenceBadge({ className }: { className?: string }) {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <PresenceBadge className={className} />
      </Suspense>
    </ClientOnly>
  );
}

const VisitorPlaque = lazy(() => import("./Visitors.tsx").then((m) => ({ default: m.VisitorPlaque })));

export function DeferredVisitorPlaque() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <VisitorPlaque />
      </Suspense>
    </ClientOnly>
  );
}

const Sandbox = lazy(() => import("./Sandbox.tsx").then((m) => ({ default: m.Sandbox })));

export function DeferredSandbox() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <Sandbox />
      </Suspense>
    </ClientOnly>
  );
}

/** Self-gating, so the GUEST_WALL_ENABLED flag stays inside the lazy chunk
 *  rather than forcing the module back into the server build to be read. */
const GuestWallGate = lazy(async () => {
  const m = await import("./GuestWall.tsx");
  const Gate: ComponentType = () => (m.GUEST_WALL_ENABLED ? <m.GuestWall /> : null);
  return { default: Gate };
});

export function DeferredGuestWall() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <GuestWallGate />
      </Suspense>
    </ClientOnly>
  );
}

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
  return (
    <ClientOnly fallback={children}>
      <Suspense fallback={children}>
        <LivePulse>{children}</LivePulse>
      </Suspense>
    </ClientOnly>
  );
}
