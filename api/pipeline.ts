// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports.
import { handlePipeline } from "./_lib/pipeline-handler.js";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handlePipeline(request);
}
