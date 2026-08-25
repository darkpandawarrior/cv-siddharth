import { useSyncExternalStore } from "react";

/**
 * `false` on the server and through hydration, `true` from the first render
 * after it.
 *
 * Five components had written this by hand as `const [mounted, setMounted] =
 * useState(false)` with `useEffect(() => setMounted(true), [])`. That works,
 * and it is why several of them exist at all: anything reading `document`, or
 * mounting a library that reads `document` on import, has to wait for the
 * client or it takes the whole route's SSR down with it. But it costs a render
 * pass and, more to the point here, the React Compiler cannot see through
 * setting state in an effect, so it bails out of memoizing the component
 * around it. Five components, five bail-outs, one idea.
 *
 * useSyncExternalStore says the same thing in the way React means it to be
 * said. `getServerSnapshot` returns false, so the server and the hydration
 * pass agree; `getSnapshot` returns true, so the first post-hydration render
 * has it. The store never changes, so `subscribe` has nothing to do and
 * returns a no-op unsubscribe. Both snapshot functions return a constant,
 * which is what keeps React from looping on an unstable snapshot.
 *
 * Use this for "am I on the client yet". It is NOT for reading a browser
 * capability whose value you actually care about, like WebGL support or a
 * media query. Those stay in effects on purpose, and eslint.config.js records
 * why.
 */
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
