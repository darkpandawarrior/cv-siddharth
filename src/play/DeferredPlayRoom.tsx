import type { ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { PlayRoom } from "./PlayRoom.tsx";

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
 * a hand-rolled mounted-state check: Start's compiler recognises the JSX
 * (config.js registers `ClientOnly` from `@tanstack/react-router` as the
 * `ClientOnlyJSX` kind) and strips its children from the SERVER compile
 * entirely — `<ClientOnly fallback={children}>{clientOnlyContent}</ClientOnly>`
 * becomes `<ClientOnly fallback={children} />` before the SSR bundle is even
 * built, so `PlayRoom` and its `@playhtml/react` import are dead-code-eliminated
 * out of that build rather than merely skipped at runtime — a runtime-only
 * check alone does not do this: React still resolves a lazy child while
 * streaming on the server, and importProtection's static scan still finds the
 * dynamic import target's chunk either way — confirmed by reproducing it (see
 * PR body). The `<Hydrate when={load()} split>` inside keeps PlayRoom in its
 * own chunk (load() fires as soon as this boundary is reached, the same
 * timing the old dynamic-import pattern gave it) now that the import above is static.
 *
 * LCP is unaffected by design: the content is server-rendered and paints
 * before any of this runs. What it costs is a little hydration time, on two
 * routes, for a feature nobody needs in the first second.
 */
export function DeferredPlayRoom({ children }: { children: ReactNode }) {
  return (
    <ClientOnly fallback={children}>
      <Hydrate when={load()} split fallback={children}>
        <PlayRoom>{children}</PlayRoom>
      </Hydrate>
    </ClientOnly>
  );
}

import { PresenceBadge } from "./PlayRoom.tsx";
import { VisitorPlaque } from "./Visitors.tsx";
import { Sandbox } from "./Sandbox.tsx";
import { GUEST_WALL_ENABLED, GuestWall } from "./GuestWall.tsx";
import LivePulse from "./LivePulse.tsx";

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
 * One generic `deferred(Component)` factory returning a component per call
 * site was tried and reverted before this migration for the equivalent
 * reason React's dynamic-import code-splitting had: whatever mechanism keeps the import out of the SERVER
 * compile has to see the reference at the JSX call site inside the ONE
 * function Start's compiler strips, not inside a shared factory's own scope —
 * an `export const DeferredX = deferred(...)` is itself an exported binding,
 * never eliminable, so the import stays reachable regardless of what happens
 * inside the returned closure. Each `<Hydrate when={load()} split>` below is
 * written inline at its own exported function's `<ClientOnly>` JSX, matching
 * DeferredPlayRoom and DeferredLivePulse above — the shape that's actually
 * proven to work, now expressed with the framework's own split boundary
 * instead of a private dynamic-import binding.
 */
export function DeferredPresenceBadge({ className }: { className?: string }) {
  return (
    <ClientOnly>
      <Hydrate when={load()} split fallback={null}>
        <PresenceBadge className={className} />
      </Hydrate>
    </ClientOnly>
  );
}

export function DeferredVisitorPlaque() {
  return (
    <ClientOnly>
      <Hydrate when={load()} split fallback={null}>
        <VisitorPlaque />
      </Hydrate>
    </ClientOnly>
  );
}

export function DeferredSandbox() {
  return (
    <ClientOnly>
      <Hydrate when={load()} split fallback={null}>
        <Sandbox />
      </Hydrate>
    </ClientOnly>
  );
}

/** Self-gating: `GuestWallGate` reads `GUEST_WALL_ENABLED` so the flag never
 *  forces `GuestWall` itself back into a path that needs to read it eagerly. */
function GuestWallGate(): ReactNode {
  return GUEST_WALL_ENABLED ? <GuestWall /> : null;
}

export function DeferredGuestWall() {
  return (
    <ClientOnly>
      <Hydrate when={load()} split fallback={null}>
        <GuestWallGate />
      </Hydrate>
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
export function DeferredLivePulse({ children }: { children: ReactNode }) {
  return (
    <ClientOnly fallback={children}>
      <Hydrate when={load()} split fallback={children}>
        <LivePulse>{children}</LivePulse>
      </Hydrate>
    </ClientOnly>
  );
}
