import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // @playhtml/react reads `document` at module-load time. Production
      // never evaluates it outside a browser because every real consumer
      // sits behind `<ClientOnly>`, which Start's own compiler strips from
      // the SERVER build — a transform this plain `vitest run` never runs.
      // See src/test/mocks/playhtml-react.ts for the rest of the story.
      "@playhtml/react": new URL("./src/test/mocks/playhtml-react.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    // scripts/ derivations are plain .mjs so the generator can run them under
    // node with no build step; vitest still needs to be told they exist.
    include: ["src/**/*.test.ts", "api/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
