import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCanvasLoop } from "./useCanvasLoop.ts";
import { Figure } from "./Figure.tsx";

/**
 * The Routing Lab (idea-atlas CRAFT-7, "the Fleet"): AgentHarness's own
 * routing rule, running live: "the-captain-never-rows.md" and its own
 * numbers only. Model tiers are roles, not ranks. A captain node decides and
 * routes; it never rows. Worker nodes carry the volume, almost all real work
 * lives there. A mechanical tier ticks fast on the small, repetitive stuff.
 *
 * Flip the toggle and overload the captain with volume instead: every task,
 * mechanical or not, now queues for its one slot at the most expensive rate
 * available. That is the published lesson's own failure, reproduced as a
 * queue: "two runs died on rate limits in the same week" because the
 * orchestrator picked up an oar. No harness internals here beyond what the
 * lesson itself discloses.
 */

export type TaskKind = "mechanical" | "volume" | "judgment";

export interface RoutingState {
  tMs: number;
  captainQueue: number;
  workerQueue: number;
  mechQueue: number;
  processed: number;
  captainOwnExecutionMs: number;
  rateLimited: boolean;
  wavesKilled: number;
}

/** Every task the captain personally processes, its own judgment call or
 *  someone else's row, takes this long: the most expensive path available. */
export const CAPTAIN_TASK_MS = 950;
export const WORKER_TASK_MS = 420;
export const MECHANICAL_TASK_MS = 150;
export const WORKER_SLOTS = 3;
export const MECHANICAL_SLOTS = 2;

/** ponytail: a demo pacing threshold, not one of the lesson's own numbers.
 *  Picked so "the captain routes" stays flat indefinitely and "the captain
 *  rows" visibly backs up within a few seconds, matching the real shape
 *  ("two runs died on rate limits in the same week") without waiting for it. */
export const RATE_LIMIT_QUEUE = 18;

// ponytail: arrival rates are simulation-only pacing, tuned only so the two
// toggle states read as flat vs backed-up on screen. The published facts are
// the labelled captions below, never these four numbers.
const JUDGMENT_RATE_PER_MS = 1 / 4000;
const VOLUME_RATE_PER_MS = 1 / 500;
const MECHANICAL_RATE_PER_MS = 1 / 700;

export function initialRoutingState(): RoutingState {
  return {
    tMs: 0,
    captainQueue: 0,
    workerQueue: 0,
    mechQueue: 0,
    processed: 0,
    captainOwnExecutionMs: 0,
    rateLimited: false,
    wavesKilled: 0,
  };
}

/**
 * Pure simulation step, no DOM and no randomness, so it is exactly as
 * testable as signalEngine.ts's pipeline. `rowing=false` is "the captain
 * routes": judgment goes to the captain's one slot, volume to the three
 * worker slots, mechanical work to its own two-slot tier, each at its own
 * native pace. `rowing=true` is "the captain rows": every arrival, of every
 * kind, queues for the captain's single slot at CAPTAIN_TASK_MS.
 *
 * Once `rateLimited` is set the state freezes (no more arrivals or
 * processing) until `initialRoutingState()` resets it, the same way a real
 * rate limit stops a run rather than degrading it gracefully.
 */
export function stepRouting(state: RoutingState, dtMs: number, rowing: boolean): RoutingState {
  if (state.rateLimited) return state;

  const judgmentArrival = dtMs * JUDGMENT_RATE_PER_MS;
  const volumeArrival = dtMs * VOLUME_RATE_PER_MS;
  const mechanicalArrival = dtMs * MECHANICAL_RATE_PER_MS;

  let captainQueue = state.captainQueue + judgmentArrival;
  let workerQueue = state.workerQueue;
  let mechQueue = state.mechQueue;

  if (rowing) {
    captainQueue += volumeArrival + mechanicalArrival;
  } else {
    workerQueue += volumeArrival;
    mechQueue += mechanicalArrival;
  }

  const captainCapacity = dtMs / CAPTAIN_TASK_MS;
  const workerCapacity = (dtMs * WORKER_SLOTS) / WORKER_TASK_MS;
  const mechCapacity = (dtMs * MECHANICAL_SLOTS) / MECHANICAL_TASK_MS;

  const captainProcessed = Math.min(captainQueue, captainCapacity);
  const workerProcessed = Math.min(workerQueue, workerCapacity);
  const mechProcessed = Math.min(mechQueue, mechCapacity);

  captainQueue -= captainProcessed;
  workerQueue -= workerProcessed;
  mechQueue -= mechProcessed;

  const rateLimited = captainQueue > RATE_LIMIT_QUEUE;

  return {
    tMs: state.tMs + dtMs,
    captainQueue,
    workerQueue,
    mechQueue,
    processed: state.processed + captainProcessed + workerProcessed + mechProcessed,
    // Only the volume/mechanical share the captain personally ran counts as
    // "picking up an oar": its own judgment calls are the job it exists for.
    captainOwnExecutionMs: state.captainOwnExecutionMs + (rowing ? (volumeArrival + mechanicalArrival > 0 ? Math.min(volumeArrival + mechanicalArrival, captainCapacity) : 0) * CAPTAIN_TASK_MS : 0),
    rateLimited,
    wavesKilled: state.wavesKilled + (rateLimited && !state.rateLimited ? 1 : 0),
  };
}

type Kind = TaskKind;
const LANE_ORDER: Kind[] = ["judgment", "volume", "mechanical"];
const LANE_LABEL: Record<Kind, string> = { judgment: "captain", volume: "workers", mechanical: "mechanical" };
const LANE_COLOR: Record<Kind, string> = { judgment: "#f2a13d", volume: "#4fd6e0", mechanical: "#8ff0b4" };

export function RoutingLab() {
  const [rowing, setRowing] = useState(false);
  const rowingRef = useRef(false);
  rowingRef.current = rowing;
  const resetRequestRef = useRef(false);
  const [display, setDisplay] = useState(initialRoutingState());

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    let state = initialRoutingState();
    let statsAcc = 0;
    let pulse = 0; // captain glow, one pulse per "decision" or "row"

    const step = (dtMs: number) => {
      if (resetRequestRef.current) {
        resetRequestRef.current = false;
        state = initialRoutingState();
      }
      const before = state.processed;
      state = stepRouting(state, Math.min(dtMs, 64), rowingRef.current);
      if (state.processed > before) pulse = 1;
      pulse *= 0.9;

      statsAcc += dtMs;
      if (statsAcc > 200) {
        statsAcc = 0;
        setDisplay(state);
      }
    };

    const draw = () => {
      const { width, height } = getSize();
      ctx.clearRect(0, 0, width, height);
      const laneH = height / 3;
      const queueFor: Record<Kind, number> = { judgment: state.captainQueue, volume: state.workerQueue, mechanical: state.mechQueue };
      const capFor: Record<Kind, number> = { judgment: RATE_LIMIT_QUEUE, volume: 8, mechanical: 8 };

      LANE_ORDER.forEach((kind, i) => {
        const y = i * laneH;
        const color = LANE_COLOR[kind];
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = `${color}cc`;
        ctx.textBaseline = "middle";
        ctx.fillText(LANE_LABEL[kind], 10, y + laneH / 2 - 14);

        // The node: captain is one slot (glows brightest, briefest); workers
        // and mechanical are drawn as their own slot count.
        const slots = kind === "judgment" ? 1 : kind === "volume" ? WORKER_SLOTS : MECHANICAL_SLOTS;
        for (let s = 0; s < slots; s++) {
          const cx = 90 + s * 26;
          const cy = y + laneH / 2 - 14;
          const glow = kind === "judgment" ? pulse : Math.min(1, queueFor[kind] / 3);
          ctx.beginPath();
          ctx.arc(cx, cy, kind === "mechanical" ? 5 : 7, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.35 + glow * 0.65;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Queue bar: how much is waiting for this lane right now.
        const barX = 90 + 4 * 26 + 14;
        const barW = width - barX - 16;
        const filled = Math.min(1, queueFor[kind] / capFor[kind]);
        ctx.fillStyle = "rgba(232,239,233,0.10)";
        ctx.fillRect(barX, y + laneH / 2 - 20, barW, 8);
        ctx.fillStyle = kind === "judgment" && state.rateLimited ? "#ff5c5c" : `${color}aa`;
        ctx.fillRect(barX, y + laneH / 2 - 20, barW * filled, 8);
        ctx.fillStyle = "rgba(232,239,233,0.5)";
        ctx.fillText("queue", barX, y + laneH / 2 - 4);
      });

      if (state.rateLimited) {
        ctx.fillStyle = "rgba(255,92,92,0.10)";
        ctx.fillRect(0, 0, width, height);
        ctx.font = 'bold 12px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = "#ff5c5c";
        ctx.textAlign = "center";
        ctx.fillText("rate limited: the captain never reached the judgment calls", width / 2, height - 10);
        ctx.textAlign = "left";
      }
    };

    return { step, draw };
  });

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Model tiers arrive looking like a quality ladder, so the instinct is to use the best one for
        everything. They are roles, not ranks: mechanical work stays a small-model job, bulk execution is
        where almost all real work lives, and the largest tier earns its price on orchestration and
        judgment alone. AgentHarness's own routing rule, running live below: flip the captain from routing
        to rowing and watch it try to execute the volume itself.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[220px] sm:h-[260px]">
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            role="img"
            aria-label="Three routing tiers, captain, workers, mechanical, with the captain's queue backing up when it rows instead of routes"
          />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          <Figure label="processed" value={String(Math.round(display.processed))} sub="tasks completed" tone="good" />
          <Figure
            label="captain's queue"
            value={display.captainQueue.toFixed(1)}
            sub={`limit ${RATE_LIMIT_QUEUE}`}
            tone={display.rateLimited ? "bad" : "neutral"}
          />
          <Figure
            label="captain executing"
            value={`${Math.round((display.captainOwnExecutionMs / Math.max(1, display.tMs)) * 100)}%`}
            sub="of its own time, on someone else's work"
            tone={rowing ? "bad" : "good"}
          />
          <Figure
            label="status"
            value={display.rateLimited ? "rate limited" : "steering"}
            sub={`${display.wavesKilled} run${display.wavesKilled === 1 ? "" : "s"} lost this session`}
            tone={display.rateLimited ? "bad" : "good"}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={rowing} onChange={(e) => setRowing(e.target.checked)} className="accent-accent" />
            the captain rows
          </label>
          {display.rateLimited && (
            <button
              onClick={() => {
                resetRequestRef.current = true;
              }}
              className="rounded-full border border-accent/40 px-3 py-1 font-mono text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent/10"
            >
              reset the run
            </button>
          )}
          <span className="font-mono text-xs text-zinc-400">
            {rowing
              ? "every task queues for the captain's one slot, at the most expensive rate available"
              : "judgment to the captain, volume to the workers, the rest to the mechanical tier"}
          </span>
          <Link
            to="/read/$slug"
            params={{ slug: "the-captain-never-rows" }}
            className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent"
          >
            the full story, the captain never rows
          </Link>
        </div>
      </div>
    </div>
  );
}
