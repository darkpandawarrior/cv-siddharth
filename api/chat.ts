// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports. Vite/our own tsconfig resolve it fine
// either way, so this keeps both toolchains happy.
import { handleChat } from "./_lib/chat-handler.js";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleChat(request);
}
