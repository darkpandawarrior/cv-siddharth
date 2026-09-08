// vitest stand-in for @playhtml/react, aliased in vitest.config.ts.
//
// @playhtml/react reads `document` at module-load time — fatal under
// vitest's `environment: "node"` (no DOM), which is why every real consumer
// (LiveReactionRow.tsx, LiveMarginNotes.tsx, PlayRoom.tsx, Sandbox.tsx,
// Visitors.tsx, pulse.ts, litMapSync.ts, world/Ghosts.tsx) only ever reached
// the browser through a `<ClientOnly>` boundary. Production keeps that
// guarantee via Start's own compiler, which strips a `<ClientOnly>`'s
// children out of the SERVER build entirely — but vitest runs no such
// compiler, so a module that now imports one of those files with a plain
// static `import` (replacing the dynamic import that used to defer the
// require) crashes on a bare `vitest run` of an unrelated test that merely
// imports the route file for its `validateSearch` (anthologyLayers.test.ts).
// No test here renders these components (there are no `.test.tsx` files in
// this suite — vitest covers logic, Playwright covers rendering), so a
// no-op stand-in changes nothing real: it exists only so importing the
// MODULE doesn't crash before any test gets to run.
export function usePageData<T>(_channel: string, initial: T): [T, (next: T) => void] {
  return [initial, () => {}];
}

export function usePlayContext(): unknown {
  return undefined;
}

export function usePresence<T>(): T[] {
  return [];
}

export function useCursorPresences(): unknown[] {
  return [];
}

export function PlayProvider(props: { children?: unknown }): unknown {
  return props.children;
}

export function CanMoveElement(props: { children?: unknown }): unknown {
  return props.children;
}
