import { handleBuoys } from "./buoys-handler.js";
import { handleVolcanoes } from "./volcano-handler.js";
import { handleSun } from "./sun-handler.js";
// LANE F1: the table `api/[route].ts` dispatches through. Before this file,
// each of these 11 routes was its own top-level api/*.ts, and Vercel (which
// creates one Function per file directly under api/, per the `_lib/` prefix
// already excluding this whole directory from that count — that's *why*
// `_lib/`'s 30-odd handler/test files never showed up as functions) counted
// 11 Functions on Hobby's ~12-slot budget. One dynamic-segment file
// (`api/[route].ts`) plus this table is one Function; the handlers
// themselves are untouched, still living where they were, still exporting
// the same `handle*(request: Request): Promise<Response>` signature.
//
// Before: 11 Functions (aircraft, chat, github-activity, ops, pipeline,
// signals, spotify, tle, weather, whereami, wind) + api/ssr.mjs (Node
// runtime, can't share this edge table, stays separate) = 12.
// After: 1 Function (this table's api/[route].ts) + api/ssr.mjs = 2.
import { handleAircraft } from "./aircraft-handler.js";
import { handleChat } from "./chat-handler.js";
import { handleGithubActivity } from "./github-activity-handler.js";
import { handleOps } from "./ops-handler.js";
import { handlePipeline } from "./pipeline-handler.js";
import { handleSignals } from "./signals-handler.js";
import { handleSpotify } from "./spotify-handler.js";
import { handleTerrain } from "./terrain-handler.js";
import { handleTle } from "./tle-handler.js";
import { handleWeather } from "./weather-handler.js";
import { handleWhereami } from "./whereami-handler.js";
import { handleWind } from "./wind-handler.js";

export type RouteHandler = (request: Request) => Promise<Response>;

// Route name (the `/api/<name>` segment) -> its handler. Every handler keeps
// its own caching headers, its own api/_lib/upstream.ts governor and its own
// error behaviour — this table only picks which function runs, nothing else.
export const ROUTES: Record<string, RouteHandler> = {
  buoys: handleBuoys,
  volcanoes: handleVolcanoes,
  sun: handleSun,
  aircraft: handleAircraft,
  chat: handleChat,
  "github-activity": handleGithubActivity,
  ops: handleOps,
  pipeline: handlePipeline,
  signals: handleSignals,
  spotify: handleSpotify,
  terrain: handleTerrain,
  tle: handleTle,
  weather: handleWeather,
  whereami: handleWhereami,
  wind: handleWind,
};

const NOT_FOUND = () =>
  new Response(JSON.stringify({ error: "not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

// `/api/wind` -> "wind". Real Vercel routing (not a rewrite) invokes this
// file directly for the matched path, so `request.url` is the genuine
// incoming URL — no rewrite-vs-original-path ambiguity to account for.
export function routeNameFrom(request: Request): string {
  const { pathname } = new URL(request.url);
  return pathname.replace(/^\/api\//, "").split("/")[0] ?? "";
}

export function dispatch(request: Request): Promise<Response> {
  const handler = ROUTES[routeNameFrom(request)];
  return handler ? handler(request) : Promise.resolve(NOT_FOUND());
}
