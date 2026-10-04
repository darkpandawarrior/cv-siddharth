import type { Plugin } from "vite";

/** Keep Vite's lookup data intact without shipping its pretty-print spacing. */
export function compactClientManifest(): Plugin {
  return {
    name: "compact-client-manifest",
    apply: "build",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const manifest = bundle[".vite/manifest.json"];
        if (manifest?.type !== "asset") return;
        const source = typeof manifest.source === "string" ? manifest.source : new TextDecoder().decode(manifest.source);
        manifest.source = JSON.stringify(JSON.parse(source));
      },
    },
  };
}
