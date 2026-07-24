import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Named `getRouter`, not `createRouter`: the installed @tanstack/start-plugin-core
// (1.168.32) generates `src/routeTree.gen.ts` with `import type { getRouter } from
// './router.tsx'` in its footer, and the server entry does a runtime
// `entries.routerEntry.getRouter()` call — confirmed by tracing
// @tanstack/start-server-core's createStartHandler.ts. The plan's brief snippet
// (`export function createRouter()`) is written for a different version's naming
// convention; this export name is load-bearing for SSR, not a style choice.
export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
