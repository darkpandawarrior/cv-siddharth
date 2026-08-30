import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { config as loadEnv } from "dotenv";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";

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

/**
 * `vite preview` gzips the static assets it serves but hands back the SSR
 * document as identity, and production (Vercel) compresses both. So Lighthouse
 * CI was measuring a 207 KB homepage document that no real visitor has ever
 * received: 182 KB of phantom bytes, first on the critical path, ~885 ms of
 * invented FCP at the simulated 1.6 Mbit/s link. Measured CI FCP for `/` was
 * 5,559 ms against a real-world 356 ms.
 *
 * That gap is not harmless. It is what a perf budget gets calibrated against,
 * and a budget set to a measurement artifact catches nothing real.
 *
 * node:zlib, no new dependency. Preview only — it never touches dev or the
 * production build.
 */
function gzipPreviewHtmlPlugin(): Plugin {
  return {
    name: "gzip-preview-html",
    configurePreviewServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) return next();
        const writeHead = res.writeHead.bind(res);
        const write = res.write.bind(res);
        const end = res.end.bind(res);
        const chunks: Buffer[] = [];
        let compress = false;

        // A body chunk arrives as a string OR a Uint8Array, and a Uint8Array is
        // not a Buffer — Buffer.from(String(uint8array)) yields the literal text
        // "60,33,68,79,…", which is how the first version of this shipped a
        // 737 KB document of comma-separated byte numbers.
        const collect = (chunk: unknown) => {
          if (chunk == null || typeof chunk === "function") return;
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array));
        };

        // The decision has to be made HERE and nowhere later. writeHead() builds
        // the header block and flips res.headersSent immediately, so a
        // setHeader("content-encoding") from inside write() or end() throws
        // ERR_HTTP_HEADERS_SENT and the socket closes with an empty reply.
        res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
          if (String(res.getHeader("content-type") ?? "").startsWith("text/html")) {
            compress = true;
            // The gzipped length is not known yet, so this goes out chunked.
            res.removeHeader("content-length");
            res.setHeader("content-encoding", "gzip");
            res.setHeader("vary", "accept-encoding");
          }
          return writeHead(...args);
        }) as typeof res.writeHead;

        res.write = ((chunk: Buffer, ...rest: never[]) => {
          if (!compress) return write(chunk, ...rest);
          collect(chunk);
          return true;
        }) as typeof res.write;

        res.end = ((chunk?: Buffer, ...rest: never[]) => {
          if (!compress) return end(chunk, ...rest);
          collect(chunk);
          // Buffered, not streamed, on purpose: one ~200 KB SSR document on a
          // local preview server. A single gzipSync is a lot less code than
          // re-piping the response through a transform, and nothing
          // production-facing runs this path.
          write(gzipSync(Buffer.concat(chunks)));
          return end();
        }) as typeof res.end;

        next();
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
    // /ops's control tower. Without this the board is only ever testable
    // against production, which is the wrong way round for a page whose whole
    // subject is noticing failure early.
    edgeGetApiDevPlugin("/api/ops", "/api/_lib/ops-handler.ts", "handleOps"),
    // Makes `vite preview` (what Lighthouse CI measures) send the SSR document
    // compressed, the way production does.
    gzipPreviewHtmlPlugin(),
  ],
}));
