import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { config as loadEnv } from "dotenv";
import type { IncomingMessage, ServerResponse } from "node:http";

loadEnv({ path: ".env.local" });

/**
 * Serves /api/chat during local dev with the same web-standard handler
 * that Vercel runs in production, so the chat widget works under `vite`
 * without `vercel dev`. Requires ANTHROPIC_API_KEY in .env.local.
 */
function chatApiDevPlugin(): Plugin {
  return {
    name: "chat-api-dev",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req: IncomingMessage, res: ServerResponse) => {
        const { handleChat } = await server.ssrLoadModule("/api/_lib/chat-handler.ts");
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const request = new Request("http://localhost/api/chat", {
          method: req.method ?? "POST",
          headers: { "content-type": "application/json" },
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

export default defineConfig({
  // GitHub Pages project sites serve from /<repo>/ — set BASE_PATH there.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss(), chatApiDevPlugin()],
  build: {
    rollupOptions: {
      output: {
        // Split the always-loaded vendors into their own long-lived chunks so
        // an app-code change doesn't invalidate them. The heavy libraries
        // (three / mermaid / tldraw) are dynamically imported already and stay
        // in their own lazy chunks — deliberately NOT matched here, so grouping
        // them can't pull them into the eager path.
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "react-dom";
          if (id.includes("/node_modules/react/")) return "react";
          if (id.includes("/node_modules/lucide-react/")) return "icons";
          if (
            /\/node_modules\/(react-markdown|remark|rehype|micromark|mdast|hast|unist|unified|vfile|bail|trough|devlop|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities|zwitch|html-void-elements|estree|is-plain-obj|trim-lines|ccount|escape-string-regexp|markdown-table|longest-streak)/.test(
              id,
            )
          )
            return "markdown";
        },
      },
    },
  },
});
