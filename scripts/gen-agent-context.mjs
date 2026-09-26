// Emits public/agent-context.json — the machine-readable twin of /llms.txt
// for an agent that wants structured facts instead of prose (Candidai's "an
// agent surface, not just a UI" idea, applied to the portfolio: idea-atlas.md
// SYS-12). Same source data llms.txt is generated from (profile, routes,
// projectStats, fleetStats) — one derivation, so the two surfaces can never
// disagree about a headline number.
//
// Deterministic on purpose: every input here is a committed file (profile.ts,
// routes.ts, projectStats.ts, store.ts), never a live fetch, so two runs over
// an unchanged checkout must produce byte-identical output. `generatedAt` is
// therefore a content hash of the payload, not `new Date()` — a wall-clock
// stamp would make the committed file disagree with its own generator on
// every calendar day regardless of whether anything actually changed (the
// same false positive check-generated.mjs's header documents for gen-ops.mjs).
//
// Pure functions are exported so the test can check them directly; only
// main() touches disk, and only when this file is run directly.
import { writeFileSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { profile } from "../src/data/profile/core.ts";
import { allRoutes } from "../src/data/routes.ts";
import { projectStats } from "../src/data/projectStats.ts";
import { fleetStats } from "../src/data/store.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Every external host an identity field is allowed to point at, plus the
// site's own canonical domain (`profile.portfolio` is absolute, not one of
// `allRoutes`'s site-relative paths, so it needs its own entry here). A URL
// in the payload that resolves to neither this list nor a prerendered route
// is a dead or invented link an agent would follow off-site for nothing.
export const EXTERNAL_ALLOWLIST = ["github.com", "linkedin.com", "dev.to", "siddharth-pandalai.vercel.app"];

/** The identity subset worth putting in front of an agent — not the whole
 *  `profile` object, which also carries a phone number and two internal
 *  blurb variants (`intro`, `summaryShort`) this surface has no use for. */
export function agentProfile(p) {
  return {
    name: p.name,
    title: p.title,
    location: p.location,
    email: p.email,
    github: p.github,
    linkedin: p.linkedin,
    portfolio: p.portfolio,
    writing: p.writing,
    availability: p.availability,
    summary: p.summary,
  };
}

/** Every string value anywhere in `value` that looks like a URL or a site-
 *  relative path — the surface this file's own acceptance line checks. */
export function collectUrls(value, out = []) {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value) || value.startsWith("/")) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectUrls(v, out);
  }
  return out;
}

/** True when `url` is either a known prerendered route or points at an
 *  allowlisted external host. */
export function isAllowedUrl(url, routes, allowlist) {
  if (routes.includes(url)) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return allowlist.includes(host);
  } catch {
    return false;
  }
}

/** The full payload, and its JSON.stringify'd form (what gets hashed and
 *  written). Exported separately so a test can inspect the object without
 *  re-parsing its own JSON. */
export function buildAgentContext() {
  const payload = {
    profile: agentProfile(profile),
    routes: allRoutes,
    projectStats,
    fleetStats,
  };
  const body = JSON.stringify(payload, null, 2);
  const generatedAt = createHash("sha256").update(body, "utf8").digest("hex").slice(0, 12);
  const withStamp = { generatedAt, ...payload };
  return { payload: withStamp, json: `${JSON.stringify(withStamp, null, 2)}\n` };
}

function main() {
  const outFile = join(root, "public", "agent-context.json");
  const { json } = buildAgentContext();
  writeFileSync(outFile, json);
  console.log(`[gen-agent-context] wrote ${json.length} chars`);
}

// realpathSync, not a bare string compare: process.argv[1] is the path as
// INVOKED and import.meta.url is Node's fully resolved path — see
// gen-project-stats.mjs's isMain for the macOS /tmp-is-a-symlink case this
// guards against.
function isMain() {
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isMain()) {
  main();
}
