#!/usr/bin/env node
/* Validate a tldraw licence key against tldraw's own public key, then put it in
 * the three places that matter. Exists because the failure it guards is silent:
 * VITE_* vars are inlined at build time and tldraw only enforces licensing on
 * an https non-loopback host, so a bad key looks perfectly fine in dev, in
 * `vite preview`, in CI and in Lighthouse, and blanks /blueprint's Sketch mode
 * five seconds in on the real domain only. A typo'd paste costs a 9-minute
 * build to discover. This costs 200ms.
 *
 *   node scripts/tldraw-key.mjs <key>            # verify and report, write nothing
 *   node scripts/tldraw-key.mjs --apply <key>    # + .env.local + Vercel prod & preview
 *
 * The key may also arrive on stdin. --apply refuses any key that would not
 * actually render on LIVE_HOST.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";

const LIVE_HOST = "cv-siddharth.vercel.app";
const ENV_VAR = "VITE_TLDRAW_LICENSE_KEY";
const ENV_FILE = new URL("../.env.local", import.meta.url).pathname;

// LicenseManager.publicKey — @tldraw/editor/src/lib/license/LicenseManager.ts.
// If tldraw ever rotates this, verification here fails while the browser still
// works; re-copy it from node_modules rather than trusting the mismatch.
const TLDRAW_PUBLIC_KEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHJh0uUfxHtCGyerXmmatE368Hd9rI6LH9oPDQihnaCryRFWEVeOvf9U/SPbyxX74LFyJs5tYeAHq5Nc0Ax25LQ";

const FLAGS = {
  ANNUAL_LICENSE: 1,
  PERPETUAL_LICENSE: 2,
  INTERNAL_LICENSE: 4,
  WITH_WATERMARK: 8,
  EVALUATION_LICENSE: 16,
  NATIVE_LICENSE: 32,
};
const GRACE_PERIOD_DAYS = 30;
const DAY = 86_400_000;

/* tldraw strips these before validating (keys get copied out of PDFs and
 * emails), so a key that only differs by invisible characters is not a typo. */
const clean = (s) => s.replace(/[​-‍﻿]/g, "").replace(/\r?\n|\r/g, "").trim();

async function verify(key) {
  const [data, signature] = key.split(".");
  if (!data || !signature) throw new Error("not `<prefix>/<payload>.<signature>` — is the paste truncated?");
  const [prefix, encodedData] = data.split("/");
  if (!prefix?.startsWith("tldraw-")) throw new Error(`unsupported prefix '${prefix}'`);
  if (!encodedData) throw new Error("no payload segment");

  const pub = await webcrypto.subtle.importKey(
    "spki",
    Buffer.from(TLDRAW_PUBLIC_KEY, "base64"),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const ok = await webcrypto.subtle.verify(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    pub,
    Buffer.from(signature, "base64"),
    Buffer.from(encodedData, "base64"),
  );
  if (!ok) throw new Error("signature does not verify — the key is altered, truncated or not from tldraw");

  const [id, hosts, flags, expiryDate] = JSON.parse(Buffer.from(encodedData, "base64").toString());
  return { prefix, id, hosts, flags, expiryDate, expiry: new Date(expiryDate) };
}

const has = (flags, f) => (flags & f) === f;

/* LicenseManager.isDomainValid, same order and same allowances. */
function domainValid(hosts, hostname) {
  const current = hostname.toLowerCase();
  return (hosts ?? []).some((raw) => {
    const host = String(raw).toLowerCase().trim();
    if (host === current || `www.${host}` === current || host === `www.${current}`) return true;
    if (host === "*") return true;
    if (host.includes("*")) {
      const re = new RegExp(host.replace(/\*/g, ".*?"));
      return re.test(current) || re.test(`www.${current}`);
    }
    return false;
  });
}

/* What getLicenseState() will settle on for `hostname`. Only the three states
 * reachable from a parseable key on an https host are modelled — the ones that
 * decide whether the editor survives past LICENSE_TIMEOUT (5s). */
function licenseState(info, hostname, now) {
  if (!domainValid(info.hosts, hostname)) return { state: "unlicensed-production", why: `key does not cover ${hostname}` };

  const expiryMidnight = new Date(info.expiry.getFullYear(), info.expiry.getMonth(), info.expiry.getDate());
  const past = now.getTime() - expiryMidnight.getTime();

  if (has(info.flags, FLAGS.EVALUATION_LICENSE)) {
    return past >= 0
      ? { state: "expired", why: `evaluation licence, no grace period, expired ${Math.floor(past / DAY)} days ago` }
      : { state: "licensed", why: "evaluation licence, still inside its window" };
  }
  if (has(info.flags, FLAGS.PERPETUAL_LICENSE)) {
    // Perpetual expiry gates future major/minor releases, not the editor. A
    // tldraw upgrade published after the expiry does flip this to `expired`,
    // which no static check can see — SketchBoard's runtime gate catches it.
    return { state: has(info.flags, FLAGS.WITH_WATERMARK) ? "licensed-with-watermark" : "licensed", why: "perpetual licence" };
  }
  if (past >= (GRACE_PERIOD_DAYS + 1) * DAY) {
    return { state: "expired", why: `expired ${Math.floor(past / DAY)} days ago, past the 30-day grace period` };
  }
  const watermark = has(info.flags, FLAGS.WITH_WATERMARK);
  return {
    state: past > 0 ? "licensed" : watermark ? "licensed-with-watermark" : "licensed",
    why: past > 0 ? `expired ${Math.floor(past / DAY)} days ago but inside the 30-day grace period` : watermark ? "valid, watermarked" : "valid",
  };
}

function applyVercel(key, target) {
  // Remove first: `vercel env add` on an existing name in the same target is a
  // conflict, not an overwrite. `|| true` because a missing var is fine here.
  try {
    execFileSync("vercel", ["env", "rm", ENV_VAR, target, "-y"], { stdio: "pipe" });
  } catch {
    /* not set yet */
  }
  execFileSync("vercel", ["env", "add", ENV_VAR, target], { input: key, stdio: ["pipe", "pipe", "inherit"] });
  console.log(`  ✔ Vercel ${target}`);
}

function applyEnvFile(key) {
  const line = `${ENV_VAR}=${key}`;
  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, `${line}\n`);
    console.log("  ✔ .env.local (created)");
    return;
  }
  copyFileSync(ENV_FILE, `${ENV_FILE}.bak`); // .env*.bak is gitignored
  const src = readFileSync(ENV_FILE, "utf8");
  const next = new RegExp(`^${ENV_VAR}=.*$`, "m").test(src)
    ? src.replace(new RegExp(`^${ENV_VAR}=.*$`, "m"), line)
    : `${src.replace(/\n*$/, "\n")}${line}\n`;
  writeFileSync(ENV_FILE, next);
  console.log("  ✔ .env.local (previous key kept at .env.local.bak)");
}

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const raw = argv.find((a) => !a.startsWith("--")) ?? (process.stdin.isTTY ? "" : readFileSync(0, "utf8"));
const key = clean(raw ?? "");

if (!key) {
  console.error("usage: node scripts/tldraw-key.mjs [--apply] <key>   (or pipe the key on stdin)");
  process.exit(2);
}

const info = await verify(key).catch((e) => {
  console.error(`\n✘ Invalid tldraw key: ${e.message}\n`);
  process.exit(1);
});

const now = new Date();
const live = licenseState(info, LIVE_HOST, now);
const renders = live.state !== "expired" && live.state !== "unlicensed-production";
const names = Object.entries(FLAGS).filter(([, f]) => has(info.flags, f)).map(([n]) => n);

console.log(`
  signature   ✔ verifies against tldraw's public key
  id          ${info.id}
  hosts       ${JSON.stringify(info.hosts)}
  flags       ${info.flags}${names.length ? ` (${names.join(", ")})` : ""}
  expiry      ${info.expiryDate}${info.prefix.slice(7) === info.expiryDate ? "" : `   ⚠ prefix says ${info.prefix.slice(7)} — the payload is what tldraw enforces`}

  on https://${LIVE_HOST}
  ${renders ? "✔" : "✘"} ${live.state} — ${live.why}${live.state === "licensed-with-watermark" ? "\n    (tldraw's watermark shows; that is the licence working, not failing)" : ""}
`);

if (!renders) {
  console.error(`This key will NOT render on ${LIVE_HOST}. Refusing to apply it — an\nexpired or wrong-domain key is worse than none, because the site then\nadvertises a mode tldraw kills five seconds in.\n`);
  process.exit(1);
}

if (!apply) {
  console.log("Dry run. Re-run with --apply to write .env.local and both Vercel targets.\n");
  process.exit(0);
}

console.log("Applying:");
applyEnvFile(key);
applyVercel(key, "production");
applyVercel(key, "preview");
console.log(`
Done. VITE_* is inlined at BUILD time — the live site is unchanged until a
rebuild. Merge to main (or \`vercel --prod\`) and then verify on the real
https host, waiting past 5s for tldraw's gate.
`);
