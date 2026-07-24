import { useRef, useState } from "react";
import { useCanvasLoop } from "./useCanvasLoop.ts";

/* ── Deadlock Replay Lab ─────────────────────────────────────────────── */
// Deadlock's determinism contract in one line: an InputFrame records intent
// — a move vector, jump, dash — never a position. Motion.step(state, frame)
// replays through the same fixed-timestep physics tick every time, so
// (state, InputFrame) -> state always reproduces identically. Two replays of
// one fixed recorded log run below; by default they're bit-identical, so
// only one line is visible. "Perturb frame" edits ONE frame in the second
// log only — the zero-tolerance determinism gate rejects that, and from
// that frame on the paths visibly split.

type InputFrame = { mx: number; my: number; jump: boolean; dash: boolean };
type P = { x: number; y: number };

// Mulberry32 — deterministic PRNG so the recorded sequence is fixed, not
// re-randomized on every load (same pattern as SignalLab's rng).
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRAME_COUNT = 160;
const PATH_LEN = FRAME_COUNT + 1; // path includes the initial state
const SEED = 20260724;

// The one recorded input log — fixed at module load, replayed as many times
// as asked. This is the "record intent, never position" tape.
function recordFrames(): InputFrame[] {
  const rand = mulberry32(SEED);
  const frames: InputFrame[] = [];
  let angle = rand() * Math.PI * 2;
  for (let i = 0; i < FRAME_COUNT; i++) {
    angle += (rand() - 0.5) * 0.85; // wandering turn — the recorded move vector
    frames.push({ mx: Math.cos(angle), my: Math.sin(angle), jump: rand() < 0.05, dash: rand() < 0.06 });
  }
  return frames;
}
const RECORDED = recordFrames();
const PERTURB_INDEX = Math.floor(FRAME_COUNT * 0.4); // the one frame "perturb" edits
const DIVERGE_AT = PERTURB_INDEX + 1; // first path point the edit can affect

function withPerturbedFrame(frames: InputFrame[]): InputFrame[] {
  const copy = frames.slice();
  const f = copy[PERTURB_INDEX];
  copy[PERTURB_INDEX] = { ...f, mx: -f.mx, my: -f.my }; // one edited frame — inverted intent
  return copy;
}

// Deadlock's fixed-timestep physics step: state' = step(state, InputFrame).
// Pure function of its inputs — same state + same frame always reproduces
// the same state out.
const DT = 1 / 60;
const SPEED = 70;
const PULL = 0.6; // gentle centering so the wander stays on-canvas
const DASH_MULT = 2.1;
const JUMP_KICK = 5;

function physicsStep(s: P, f: InputFrame, cx: number, cy: number): P {
  const mult = f.dash ? DASH_MULT : 1;
  const vx = f.mx * SPEED * mult + (cx - s.x) * PULL;
  const vy = f.my * SPEED * mult + (cy - s.y) * PULL;
  return { x: s.x + vx * DT, y: s.y + vy * DT - (f.jump ? JUMP_KICK : 0) };
}

function replay(frames: InputFrame[], w: number, h: number): P[] {
  const cx = w * 0.5;
  const cy = h * 0.5;
  let s: P = { x: cx, y: cy };
  const path: P[] = [s];
  for (const f of frames) {
    s = physicsStep(s, f, cx, cy);
    path.push(s);
  }
  return path;
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const PLAY_MS_PER_FRAME = 42; // replay pace — one full loop ~6.7s

export function ReplayLab() {
  const [perturbed, setPerturbed] = useState(false);
  const cmdRef = useRef({ perturb: false, reset: false });
  const [stat, setStat] = useState({ drift: 0, blocked: false });

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    let isPerturbed = false;
    let playhead = 0;

    const updateStat = () => {
      if (!isPerturbed) {
        setStat({ drift: 0, blocked: false });
        return;
      }
      const { width, height } = getSize();
      const pathA = replay(RECORDED, width, height);
      const pathB = replay(withPerturbedFrame(RECORDED), width, height);
      let sum = 0;
      let n = 0;
      for (let i = DIVERGE_AT; i < pathA.length; i++) {
        sum += dist(pathA[i], pathB[i]);
        n++;
      }
      setStat({ drift: n ? sum / n / 1000 : 0, blocked: true });
    };
    updateStat();

    const step = (dtMs: number) => {
      if (cmdRef.current.perturb) {
        cmdRef.current.perturb = false;
        isPerturbed = true;
        playhead = 0;
        updateStat();
      }
      if (cmdRef.current.reset) {
        cmdRef.current.reset = false;
        isPerturbed = false;
        playhead = 0;
        updateStat();
      }
      playhead += dtMs / PLAY_MS_PER_FRAME;
      if (playhead >= PATH_LEN) playhead = 0;
    };

    const drawSegment = (path: P[], from: number, to: number, color: string) => {
      if (to <= from) return;
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const p = path[i];
        if (i === from) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const draw = () => {
      const { width, height } = getSize();
      ctx.clearRect(0, 0, width, height);

      // Recomputed fresh every frame (cheap — 160 steps) so a resize never
      // leaves the path stale, and replay B always reflects the live
      // isPerturbed flag with no separate rebuild bookkeeping.
      const pathA = replay(RECORDED, width, height);
      drawSegment(pathA, 0, pathA.length - 1, "#3ddc84");

      if (isPerturbed) {
        const pathB = replay(withPerturbedFrame(RECORDED), width, height);
        drawSegment(pathB, DIVERGE_AT, pathB.length - 1, "#FF5C7A");

        const m = pathA[PERTURB_INDEX];
        ctx.beginPath();
        ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#FF5C7A";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = "rgba(255, 92, 122, 0.75)";
        ctx.fillText(`frame ${PERTURB_INDEX} perturbed`, m.x + 8, m.y - 8);

        const upto = Math.floor(playhead);
        if (upto >= DIVERGE_AT) {
          const hb = pathB[upto];
          ctx.beginPath();
          ctx.arc(hb.x, hb.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#FF5C7A";
          ctx.fill();
        }
      }

      const ha = pathA[Math.floor(playhead)];
      ctx.beginPath();
      ctx.arc(ha.x, ha.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#e8efe9";
      ctx.fill();
    };

    return { step, draw };
  });

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Deadlock's determinism contract in one line: an InputFrame records intent — a move vector, jump,
        dash — never a position. The same fixed-timestep physics step turns (state, InputFrame) into
        state every time, so a recording always replays identically. Two replays of one fixed input log
        run below. Perturb a single frame in the second log and the zero-tolerance gate — bit-exact
        equality, plus a check that a changed input must change the output — has to reject it: the paths
        visibly split from that frame on.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <canvas ref={canvasRef} className="h-full w-full" aria-label="Deterministic replay divergence simulation" />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <button
            onClick={() => {
              cmdRef.current.perturb = true;
              setPerturbed(true);
            }}
            disabled={perturbed}
            className="rounded-full border border-line px-3 py-1 font-mono text-xs text-zinc-300 transition hover:border-accent/40 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            perturb frame #{PERTURB_INDEX}
          </button>
          <button
            onClick={() => {
              cmdRef.current.reset = true;
              setPerturbed(false);
            }}
            disabled={!perturbed}
            className="rounded-full border border-line px-3 py-1 font-mono text-xs text-zinc-300 transition hover:border-accent/40 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            reset
          </button>
          <span className={`font-mono text-xs ${stat.blocked ? "text-[#ff5c5c]" : "text-accent"}`}>
            drift: {stat.drift.toFixed(stat.blocked ? 3 : 6)} · gate: {stat.blocked ? "BLOCKED — change rejected" : "PASS"}
          </span>
          <a
            href="/#project/deadlock"
            onClick={() => window.scrollTo({ top: 0 })}
            className="ml-auto font-mono text-[11px] text-zinc-500 transition hover:text-accent"
          >
            the full story → Deadlock's determinism gate
          </a>
        </div>
      </div>
    </div>
  );
}
