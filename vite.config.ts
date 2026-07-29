import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { config as loadEnv } from "dotenv";
import type { IncomingMessage, ServerResponse } from "node:http";

loadEnv({ path: ".env.local" });

/**
 * Serves /api/chat during local dev with the same web-standard handler
 * that Vercel runs in production, so the chat widget works under `vite`
 * (and under Start's dev server, which doesn't natively serve api/) without
 * `vercel dev`. Requires GROQ_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY
 * in .env.local — without one, handleChat itself replies 503.
 */
function chatApiDevPlugin(): Plugin {
  return {
    name: "chat-api-dev",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req: IncomingMessage, res: ServerResponse) => {
        const { handleChat } = await server.ssrLoadModule("/api/_lib/chat-handler.ts");
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        // Forward the real request headers — the handler's origin allowlist and
        // rate limiter read `origin` / `x-forwarded-for`, so a stripped-down
        // header set would make dev behave nothing like production (and 403 the
        // dev chat, since a missing Origin is rejected).
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
          else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
        }
        headers.set("content-type", "application/json");
        const request = new Request("http://localhost/api/chat", {
          method: req.method ?? "POST",
          headers,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        });
        const response: Response = await handleChat(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (response.body) {
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        res.end();
      });
    },
  };
}

/** Serves a GET-only Edge handler during local dev — same web-standard
 * handler Vercel runs in production, no vercel dev needed. Simpler than
 * chatApiDevPlugin: these endpoints take no request body. */
function edgeGetApiDevPlugin(path: string, modulePath: string, exportName: string): Plugin {
  return {
    name: `edge-get-api-dev:${path}`,
    configureServer(server) {
      server.middlewares.use(path, async (_req: IncomingMessage, res: ServerResponse) => {
        const mod = await server.ssrLoadModule(modulePath);
        const handler = mod[exportName] as (r: Request) => Promise<Response>;
        const response = await handler(new Request(`http://localhost${path}`));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      });
    },
  };
}

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
    // Registered last but its /api/chat middleware is still installed as a
    // Vite "pre" middleware (configureServer doesn't return a post-hook),
    // so it runs ahead of Start's own catch-all SSR handler — same ordering
    // that let this plugin work before the migration.
    chatApiDevPlugin(),
    edgeGetApiDevPlugin("/api/spotify", "/api/_lib/spotify-handler.ts", "handleSpotify"),
    edgeGetApiDevPlugin("/api/github-activity", "/api/_lib/github-activity-handler.ts", "handleGithubActivity"),
  ],
}));
