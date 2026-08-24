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
      // set-state-in-effect is the odd one out: its 21 hits are in ordinary
      // components and each one is a genuine compiler bail-out worth fixing.
      // Left as warnings so the backlog is visible and countable instead of
      // invisible, without turning CI red over work that is not tonight's.
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
