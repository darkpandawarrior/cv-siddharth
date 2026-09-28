// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as weather.ts.
import { handleWind } from "./_lib/wind-handler.js";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleWind(request);
}
