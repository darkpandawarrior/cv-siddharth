// Re-stitches every narrated showcase film from its committed storyboard
// (public/projects/<slug>/showcase/storyboard.json) + the daily-synced frame
// pool. Voiceover is content-addressed: audio/shotN.m4a is reused unless the
// narration text (or voice) changed — so CI can refresh VISUALS whenever the
// app repos ship new screenshots, and only a narration edit needs a macOS
// machine (`say`) to re-record.
//
// Self-healing invariants enforced here:
//  1. Every storyboard frame must be in scripts/media-manifest.mjs — if it
//     isn't, the daily sync can't refresh it and we fail loudly.
//  2. A film rebuilds iff its input hash (frames + storyboard + audio)
//     changed; otherwise it's a no-op, so the daily CI run is idempotent.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { sync } from "./media-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.slice(0, 4).join(" ")}… failed:\n${res.stderr?.toString().slice(-800)}`);
  }
  return res.stdout?.toString() ?? "";
}

const probeDur = (f) =>
  Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));

const hasSay = spawnSync("which", ["say"]).status === 0;

const fmtTs = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = (s % 60).toFixed(3).padStart(6, "0");
  return `${h}:${m}:${sec}`;
};

let rebuilt = 0;
for (const dirent of readdirSync(join(root, "public", "projects"), { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const slug = dirent.name;
  const showcaseDir = join(root, "public", "projects", slug, "showcase");
  const storyboardPath = join(showcaseDir, "storyboard.json");
  if (!existsSync(storyboardPath)) continue;

  const board = JSON.parse(readFileSync(storyboardPath, "utf8"));
  const pool = join(root, "public", "projects", slug, "screenshots");
  const manifestNames = new Set((sync[slug]?.files ?? []).map(([, dest]) => dest));

  // Invariant 1: every frame must exist AND be daily-synced.
  for (const shot of board.shots) {
    const framePath = join(pool, shot.src);
    if (!existsSync(framePath)) throw new Error(`[${slug}] missing frame ${shot.src}`);
    if (!manifestNames.has(shot.src)) {
      throw new Error(
        `[${slug}] storyboard frame ${shot.src} is not in scripts/media-manifest.mjs — add it or the daily sync can't keep it fresh`,
      );
    }
  }

  // Voiceover cache: regenerate only when narration/voice changed.
  const audioDir = join(showcaseDir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const audioHashes = [];
  board.shots.forEach((shot, i) => {
    const n = i + 1;
    const want = sha(`${board.voice}|${shot.narration}`);
    const m4a = join(audioDir, `shot${n}.m4a`);
    const sidecar = join(audioDir, `shot${n}.hash`);
    const have = existsSync(sidecar) ? readFileSync(sidecar, "utf8").trim() : "";
    if (!existsSync(m4a) || have !== want) {
      if (!hasSay) {
        throw new Error(
          `[${slug}] shot ${n} narration changed but \`say\` is unavailable — re-record locally on macOS (npm run showcase)`,
        );
      }
      const aiff = join(audioDir, `shot${n}.aiff`);
      run("say", ["-v", board.voice, "-o", aiff, shot.narration]);
      run("ffmpeg", ["-nostdin", "-y", "-i", aiff, "-c:a", "aac", "-b:a", "96k", m4a]);
      rmSync(aiff);
      writeFileSync(sidecar, want);
      console.log(`[${slug}] re-recorded voiceover shot ${n}`);
    }
    audioHashes.push(want);
  });

  // Invariant 2: rebuild only when inputs changed.
  const inputHash = sha(
    JSON.stringify(board) +
      audioHashes.join() +
      board.shots.map((s) => sha(readFileSync(join(pool, s.src)))).join(),
  );
  const hashFile = join(showcaseDir, ".buildhash");
  const mp4 = join(showcaseDir, "showcase.mp4");
  if (existsSync(mp4) && existsSync(hashFile) && readFileSync(hashFile, "utf8").trim() === inputHash) {
    console.log(`[${slug}] up to date`);
    continue;
  }

  console.log(`[${slug}] stitching ${board.shots.length} shots…`);
  const work = join(root, ".showcase-work", `${slug}-build`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const durations = [];
  board.shots.forEach((shot, i) => {
    const n = i + 1;
    const dur = Math.max(shot.seconds, probeDur(join(audioDir, `shot${n}.m4a`)) + 0.6);
    durations.push(dur);
    const cap = join(work, `cap${n}.png`);
    run("python3", [join(root, "scripts", "make_caption.py"), shot.caption, cap]);
    const silent = join(work, `clip${n}.mp4`);
    run("ffmpeg", [
      "-nostdin", "-y",
      "-loop", "1", "-t", dur.toFixed(2), "-i", join(pool, shot.src),
      "-i", cap,
      "-filter_complex",
      `[0:v]scale=-2:660:force_original_aspect_ratio=decrease,` +
        `pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0b0f0d[bg];` +
        `[bg][1:v]overlay=0:0,fade=t=in:st=0:d=0.45,` +
        `fade=t=out:st=${(dur - 0.45).toFixed(2)}:d=0.45,format=yuv420p[v]`,
      "-map", "[v]", "-r", "30", "-c:v", "libx264", "-crf", "23", "-an", silent,
    ]);
    run("ffmpeg", [
      "-nostdin", "-y",
      "-i", silent, "-i", join(audioDir, `shot${n}.m4a`),
      "-map", "0:v", "-map", "1:a", "-c:v", "copy",
      "-af", "apad", "-t", dur.toFixed(2), "-c:a", "aac",
      join(work, `clip${n}_v.mp4`),
    ]);
  });

  const listFile = join(work, "concat.txt");
  writeFileSync(listFile, board.shots.map((_, i) => `file 'clip${i + 1}_v.mp4'`).join("\n"));
  run("ffmpeg", ["-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", mp4]);
  run("ffmpeg", ["-nostdin", "-y", "-i", join(work, "clip1.mp4"), "-vf", "select=eq(n\\,15)", "-frames:v", "1", join(showcaseDir, "poster.jpg")]);

  let t = 0;
  const cues = board.shots.map((shot, i) => {
    const start = t;
    t += durations[i];
    return `${fmtTs(start)} --> ${fmtTs(t)}\n${shot.narration}`;
  });
  writeFileSync(join(showcaseDir, "captions.vtt"), `WEBVTT\n\n${cues.join("\n\n")}\n`);

  writeFileSync(hashFile, inputHash);
  const total = probeDur(mp4);
  console.log(`[${slug}] done — ${total.toFixed(1)}s, ${(readFileSync(mp4).length / 1e6).toFixed(2)}MB`);
  rebuilt += 1;
}
console.log(rebuilt ? `[showcase] rebuilt ${rebuilt} film(s)` : "[showcase] all films up to date");
