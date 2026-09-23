/** Hash the deployed prerendered documents after build for routing middleware.
 * Rendering routes again would hash different hydration timestamps. The shared
 * header covers every concrete project and reading route, not one example each.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "vite";
import { buildCspHeader, inlineScriptBodies } from "../src/lib/csp.ts";
import { PERSON_LD, PROFILEPAGE_LD } from "../src/lib/structuredData.ts";
import { allRoutes } from "../src/data/routes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = join(root, "dist", "client");
const manifestPath = join(root, "dist", "csp-policy.json");

// Root metadata can also be inserted by client-side head updates.
const hashes = new Set([
  createHash("sha256").update(JSON.stringify(PERSON_LD), "utf8").digest("base64"),
  createHash("sha256").update(JSON.stringify(PROFILEPAGE_LD), "utf8").digest("base64"),
]);
for (const path of allRoutes) {
  const documentPath = join(clientRoot, path, "index.html");
  if (!existsSync(documentPath)) {
    throw new Error(`[gen-csp] Missing prerendered document ${path}; run npm run build first.`);
  }
  for (const body of inlineScriptBodies(readFileSync(documentPath, "utf8"))) {
    hashes.add(createHash("sha256").update(body, "utf8").digest("base64"));
  }
}

const header = buildCspHeader([...hashes].sort());

// Vercel reads vercel.json before running the build command. Middleware is
// bundled afterwards, so this manifest belongs to the exact HTML deployment.
writeFileSync(manifestPath, JSON.stringify({ header, paths: allRoutes }) + "\n");
console.log(`[gen-csp] ${allRoutes.length} routes, ${hashes.size} distinct inline-script hashes, wrote dist/csp-policy.json`);

// Native Vercel functions do not rewrite explicit .ts import extensions. Bundle
// the fallback response policy into runnable JS, using the existing build tool.
await build({
  configFile: false,
  logLevel: "warn",
  build: {
    ssr: join(root, "src/lib/cspResponse.ts"),
    outDir: join(root, "dist/csp"),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "response.mjs" } },
  },
});
