// Re-stitches every narrated showcase film from its committed storyboard
// (public/projects/<slug>/showcase/storyboard.json) + the daily-synced frame
// pool. Voiceover is content-addressed: audio/shotN.m4a is reused unless the
// narration text (or voice) changed — so CI can refresh VISUALS whenever the
// app repos ship new screenshots, and only a narration edit needs the recording
// engine to be reachable.
//
// Two engines. A storyboard with a `voiceId` (a Cartesia voice UUID) records
// through Cartesia Sonic and needs CARTESIA_API_KEY; one without falls back to
// macOS `say -v <board.voice>`, which is mac-only and sounds it. The engine is
// part of the cache key, so a machine that cannot reach the chosen engine fails
// loudly rather than quietly re-recording good audio with the other one.
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

import { config } from "dotenv";

import { sync } from "./media-manifest.mjs";

config({ path: ".env.local" });

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

const CARTESIA_KEY = process.env.CARTESIA_API_KEY ?? "";
// Pinned, not floating: `sonic-3.6` auto-updates and a voice that shifts under a
// content-addressed cache is a silent diff nobody asked for. Bump deliberately.
const CARTESIA_MODEL = process.env.CARTESIA_MODEL ?? "sonic-3.6-2026-08-27";
const CARTESIA_VERSION = "2026-08-14";

const cartesia = (path, init = {}) =>
  fetch(`https://api.cartesia.ai${path}`, {
    ...init,
    headers: {
      "Cartesia-Version": CARTESIA_VERSION,
      Authorization: `Bearer ${CARTESIA_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

// `npm run showcase -- --voices` — you cannot pick a voiceId without seeing the
// library, and the UUIDs are not in the docs.
if (process.argv.includes("--voices")) {
  // A missing key here is the EXPECTED first run, not a crash: this is the
  // very command the setup notes tell you to run, and until someone has been
  // to play.cartesia.ai there is no key to find. A twelve-line stack trace
  // about it buries the one sentence that says what to do, so this path
  // prints and exits rather than throwing. A genuine failure below — a 401, a
  // 500, malformed JSON — still throws with its stack, because that is a bug
  // and the trace is the useful part.
  if (!CARTESIA_KEY) {
    console.error("No CARTESIA_API_KEY.\n  1. get one at play.cartesia.ai\n  2. add CARTESIA_API_KEY=… to .env.local\n  3. re-run: node scripts/rebuild-showcase.mjs --voices");
    process.exit(1);
  }
  const res = await cartesia("/voices?limit=100");
  if (!res.ok) throw new Error(`cartesia /voices ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  for (const v of body.data ?? body) console.log(`${v.id}  ${v.name}  [${v.language ?? "?"}]  ${v.description ?? ""}`.trim());
  process.exit(0);
}

/**
 * One narration line → a wav on disk.
 *
 * /tts/bytes is a single POST that returns the audio inline. The streaming
 * websocket API exists and is not wanted here: these are one-sentence lines
 * written to a file, so there is nothing to stream to.
 */
async function recordCartesia(text, voiceId, out) {
  const res = await cartesia("/tts/bytes", {
    method: "POST",
    body: JSON.stringify({
      model_id: CARTESIA_MODEL,
      transcript: text,
      voice: { id: voiceId },
      language: "en",
      output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
    }),
  });
  if (!res.ok) throw new Error(`cartesia /tts/bytes ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

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
  //
  // The hash key is unchanged from the `say`-only era on purpose: a Cartesia
  // UUID can never collide with a macOS voice NAME, so the speaker already
  // identifies the engine and existing audio stays valid. Adding "cartesia|" to
  // the key would have re-recorded all 29 committed shots for no audible change.
  //
  // The engine is decided by the COMMITTED storyboard, never by what this
  // machine happens to have — so the wanted hash is the same everywhere, and a
  // box without the key (or without `say`) throws instead of re-recording the
  // line through the other engine and committing the downgrade.
  const audioDir = join(showcaseDir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const engine = board.voiceId ? "cartesia" : "say";
  const speaker = board.voiceId ?? board.voice;
  const audioHashes = [];
  for (const [i, shot] of board.shots.entries()) {
    const n = i + 1;
    const want = sha(`${speaker}|${shot.narration}`);
    const m4a = join(audioDir, `shot${n}.m4a`);
    const sidecar = join(audioDir, `shot${n}.hash`);
    const have = existsSync(sidecar) ? readFileSync(sidecar, "utf8").trim() : "";
    if (!existsSync(m4a) || have !== want) {
      const raw = join(audioDir, `shot${n}.${engine === "cartesia" ? "wav" : "aiff"}`);
      if (engine === "cartesia") {
        if (!CARTESIA_KEY) {
          throw new Error(
            `[${slug}] shot ${n} needs re-recording through Cartesia but CARTESIA_API_KEY is unset — put it in .env.local, then npm run showcase`,
          );
        }
        await recordCartesia(shot.narration, speaker, raw);
      } else {
        if (!hasSay) {
          throw new Error(
            `[${slug}] shot ${n} narration changed but \`say\` is unavailable — re-record locally on macOS (npm run showcase), or give this storyboard a Cartesia voiceId`,
          );
        }
        run("say", ["-v", speaker, "-o", raw, shot.narration]);
      }
      run("ffmpeg", ["-nostdin", "-y", "-i", raw, "-c:a", "aac", "-b:a", "96k", m4a]);
      rmSync(raw);
      writeFileSync(sidecar, want);
      console.log(`[${slug}] re-recorded voiceover shot ${n} (${engine})`);
    }
    audioHashes.push(want);
  }

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
