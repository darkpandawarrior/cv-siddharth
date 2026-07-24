import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// React Compiler 1.0 runs through the rolldown->babel bridge, since
// @vitejs/plugin-react v6 moved its own JSX transform off Babel onto oxc.
// @rolldown/plugin-babel declares itself `enforce: "pre"`, so it always runs
// ahead of viteReact()'s oxc transform regardless of array position here.
export default defineConfig(async () => ({
  server: { port: 5173 },
  plugins: [
    // tanstackStart() must come before viteReact() — this ordering is called
    // out explicitly in @tanstack/react-start's own bundled setup docs.
    // Unlike the plan's draft, this version of Start doesn't take a
    // `customViteReactPlugin` option (no such option exists on
    // TanStackStartViteInputConfig) — it never bundles its own React plugin;
    // it just requires *some* React-Refresh-compatible plugin (viteReact()
    // below) to be present so `/@react-refresh` resolves in dev.
    tanstackStart(),
    viteReact(),
    await babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
}));
