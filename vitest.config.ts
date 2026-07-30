import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // scripts/ derivations are plain .mjs so the generator can run them under
    // node with no build step; vitest still needs to be told they exist.
    include: ["src/**/*.test.ts", "api/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
