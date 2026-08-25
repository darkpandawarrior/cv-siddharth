import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".showcase-work"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // The React Compiler DOES run here: vite.config.ts feeds
      // reactCompilerPreset() through the rolldown/babel bridge, and
      // useMemoCache is in the shipped bundle. An earlier version of this
      // comment said the opposite, which meant the repo paid the compiler's
      // build cost while the rules that report where it silently bails out
      // were switched off. A bail-out is a component you believe is memoized
      // and is not.
      ...reactHooks.configs.flat.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
      // These five are demoted to warnings rather than switched off. Four of
      // them fire on idiomatic react-three-fiber, where mutating a ref, a
      // material or a uniform inside useFrame is how the library is meant to
      // be used, and that was the real reason the whole set was disabled.
      //
      // set-state-in-effect was the odd one out. It fired 22 times; 10 were
      // genuine and are gone. Five components hand-rolled the same client-only
      // gate and now share src/lib/useHydrated.ts, which says it with
      // useSyncExternalStore and so needs no effect at all. Four more reset
      // state in an effect when a prop changed, which React's own docs name as
      // a bug because it renders the stale value first: the command palette,
      // the compare slider and the anomaly rail no longer do. Two probes in
      // lib/voice.ts read a browser capability that never changes and now read
      // it through a store.
      //
      // The 12 that remain are correct as written and are not a backlog:
      //   AmbientBackground, ChessRoom, ParticleHero, Phone3D, Playground
      //     probe WebGL and matchMedia, which do not exist on the server. This
      //     site server-renders, and moving these into render is precisely how
      //     /playground lost its SSR once already.
      //   App, blueprintShared, Visitors, Terminal
      //     drive a clock, a typing effect, a count-up and a streaming reply.
      //     Each is a genuine external source of change over time, which is
      //     what an effect is for.
      //   Flipbook, LabBench
      //     synchronise to something outside React on mount.
      // Warnings rather than off, so a NEW one still shows up next to them.
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // A leading underscore marks a deliberate discard. Needed for rest
      // destructuring that drops one key, which is the tidiest way to remove a
      // single field from an object you otherwise want whole.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
