import { expect, it } from "vitest";
import { compactClientManifest } from "./compactManifest.ts";

const value = {
  "src/world/v2/WorldV2.tsx": {
    file: "assets/WorldV2.js",
    imports: ["_three.js", "_react.js"],
    dynamicImports: ["src/lib/satellites.ts"],
    css: ["assets/world.css"],
    note: 'Sangam: "sky", नदी, <canvas>',
    isDynamicEntry: true,
  },
};

it.each(["string", "bytes"])("compacts the %s manifest without changing any lookup data", (encoding) => {
  const pretty = JSON.stringify(value, null, 2);
  const source = encoding === "string" ? pretty : new TextEncoder().encode(pretty);
  const manifest = { type: "asset", source };
  const other = { type: "asset", source: '{ "keep": "spacing" }' };
  compactClientManifest().generateBundle.handler({}, { ".vite/manifest.json": manifest, "other.json": other });
  expect(JSON.parse(manifest.source)).toEqual(value);
  expect(manifest.source.length).toBeLessThan(pretty.length);
  expect(other.source).toBe('{ "keep": "spacing" }');
});
