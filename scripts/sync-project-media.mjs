// Pulls a curated, hand-picked set of frames + demo gifs from each app repo's
// docs/ over raw.githubusercontent into public/projects/<slug>/screenshots/.
// A 404 logs MISS and continues — never fails the build. Runs before
// gen-galleries so new files land in the gallery. Local committed media is the
// fallback: with no network the build still works off what's already on disk.
import { writeFileSync, mkdirSync, statSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.GITHUB_TOKEN;

// Re-encodes a gif in place via ffmpeg's palette filters (fps cap + no upscale
// + smaller palette) — routinely 40-60% smaller with no visible quality loss.
// Skips quietly if ffmpeg isn't on PATH or the file is already small.
function compressGif(path) {
  if (!path.endsWith(".gif") || statSync(path).size < 300_000) return;
  const tmp = `${path}.tmp.gif`;
  const filter =
    "fps=12,scale='min(480,iw)':-1:flags=lanczos,split[s0][s1];" +
    "[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3";
  const res = spawnSync("ffmpeg", ["-y", "-i", path, "-vf", filter, "-loglevel", "error", tmp]);
  if (res.status !== 0 || !statSync(tmp, { throwIfNoEntry: false })) {
    console.warn(`[sync-media] compress skipped (ffmpeg unavailable/failed) for ${path}`);
    return;
  }
  const before = statSync(path).size;
  const after = statSync(tmp).size;
  if (after > 0 && after < before) {
    renameSync(tmp, path);
    console.log(`[sync-media] compressed ${path} ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`);
  } else {
    unlinkSync(tmp);
  }
}

// Curated per project: [repoPathUnderDocs, destFilename]. Keep this short.
const sync = {
  mileway: {
    repo: "darkpandawarrior/Mileway",
    files: [
      ["demo/tracking_flow.gif", "tracking_flow.gif"],
      ["demo/multiplatform.gif", "multiplatform.gif"],
      ["demo/log_miles.gif", "log_miles.gif"],
      ["screenshots/tracking_success_screen.png", "tracking_success_screen.png"],
      ["screenshots/track_detail_screen.png", "track_detail_screen.png"],
      ["screenshots/wear_dashboard.png", "wear_dashboard.png"],
      ["screenshots/desktop_dashboard.png", "desktop_dashboard.png"],
      // V22-V24 feature-wave flow gifs (docs/gifs/), one per README "Screenshots" subsection.
      ["gifs/super_profile_personas.gif", "super_profile_personas.gif"],
      ["gifs/track_a_trip.gif", "track_a_trip.gif"],
      ["gifs/delegation_manager.gif", "delegation_manager.gif"],
      ["gifs/log_and_expense.gif", "log_and_expense.gif"],
      ["gifs/approvals_payables.gif", "approvals_payables.gif"],
      ["gifs/verification_growth.gif", "verification_growth.gif"],
      ["gifs/membership.gif", "membership.gif"],
      ["gifs/ai_assistant.gif", "ai_assistant.gif"],
      ["gifs/onboarding_auth.gif", "onboarding_auth.gif"],
      ["gifs/wallet_payout.gif", "wallet_payout.gif"],
      ["gifs/account_sessions.gif", "account_sessions.gif"],
    ],
  },
  paymentslab: {
    repo: "darkpandawarrior/PaymentsLab",
    files: [
      // docs/demo/payment_flow.gif never existed upstream (404) — real gifs live at docs/gifs/.
      ["gifs/activity_flow.gif", "activity_flow.gif"],
      ["gifs/checkout_flow.gif", "checkout_flow.gif"],
      ["gifs/explore_verify_flow.gif", "explore_verify_flow.gif"],
      ["screenshots/home_screen_dashboard.png", "home_screen_dashboard.png"],
      ["screenshots/provider_lab_screen_running.png", "provider_lab_screen_running.png"],
      ["screenshots/checkout_screen_paying.png", "checkout_screen_paying.png"],
      ["screenshots/checkout_screen_settled_success.png", "checkout_screen_settled_success.png"],
      ["screenshots/history_screen_all.png", "history_screen_all.png"],
    ],
  },
  kursi: {
    repo: "darkpandawarrior/Kursi",
    files: [
      ["gifs/home.gif", "home.gif"],
      ["gifs/onboarding.gif", "onboarding.gif"],
      ["gifs/modes.gif", "modes.gif"],
      ["gifs/turn.gif", "turn.gif"],
      ["gifs/darbar.gif", "darbar.gif"],
      ["gifs/coach.gif", "coach.gif"],
      ["gifs/online.gif", "online.gif"],
      ["gifs/table_sizes.gif", "table_sizes.gif"],
      ["gifs/career.gif", "career.gif"],
      ["gifs/reference.gif", "reference.gif"],
      ["screenshots/profile_setup.png", "profile_setup.png"],
    ],
  },
};

const raw = (repo, path) => `https://raw.githubusercontent.com/${repo}/main/docs/${path}`;

async function pull(repo, srcPath, dest) {
  try {
    const res = await fetch(raw(repo, srcPath), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return console.warn(`[sync-media] MISS ${res.status} ${srcPath}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    compressGif(dest);
    console.log(`[sync-media] ok ${srcPath} -> ${dest}`);
  } catch (err) {
    console.warn(`[sync-media] MISS ${srcPath} — ${err.message}`);
  }
}

for (const [slug, { repo, files }] of Object.entries(sync)) {
  const dir = join(root, "public", "projects", slug, "screenshots");
  mkdirSync(dir, { recursive: true });
  for (const [srcPath, destName] of files) {
    await pull(repo, srcPath, join(dir, destName));
  }
}
