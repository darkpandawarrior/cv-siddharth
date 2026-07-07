// Pulls a curated, hand-picked set of frames + demo gifs from each app repo's
// docs/ over raw.githubusercontent into public/projects/<slug>/screenshots/.
// A 404 logs MISS and continues — never fails the build. Runs before
// gen-galleries so new files land in the gallery. Local committed media is the
// fallback: with no network the build still works off what's already on disk.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.GITHUB_TOKEN;

// Curated per project: [repoPathUnderDocs, destFilename]. Keep this short.
const sync = {
  mileway: {
    repo: "darkpandawarrior/Mileway",
    files: [
      ["demo/tracking_flow.gif", "tracking_flow.gif"],
      ["demo/multiplatform.gif", "multiplatform.gif"],
      ["screenshots/tracking_success_screen.png", "tracking_success_screen.png"],
      ["screenshots/track_detail_screen.png", "track_detail_screen.png"],
      ["screenshots/wear_dashboard.png", "wear_dashboard.png"],
      ["screenshots/desktop_dashboard.png", "desktop_dashboard.png"],
    ],
  },
  paymentslab: {
    repo: "darkpandawarrior/PaymentsLab",
    files: [
      ["demo/payment_flow.gif", "payment_flow.gif"],
      ["screenshots/home_screen_dashboard.png", "home_screen_dashboard.png"],
      ["screenshots/provider_lab_screen_running.png", "provider_lab_screen_running.png"],
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
