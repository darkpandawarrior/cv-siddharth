import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCanvasLoop } from "./useCanvasLoop.ts";
import { projectStats } from "../data/projectStats.ts";

/* ── PaymentsLab Gateway Lab ─────────────────────────────────────────── */
/* PaymentsLab's cataloged gateways, split by how each one is integrated and
   routed through one PaymentGateway abstraction. Every count comes from
   projectStats.ts, which gen-project-stats.mjs parses out of the repo's own
   generated README banner — the numbers used to be typed here four separate
   times, and the copy below drifted away from the chart above it. Only the
   colours are local: those are presentation, not a claim. */

const P = projectStats.paymentslab;
const CATEGORIES = [
  { id: "native-SDK", count: P.gatewaysNative, color: "#C4B5FD" },
  { id: "hosted-webview", count: P.gatewaysHosted, color: "#A78BFA" },
  { id: "mobile-money", count: P.gatewaysMobileMoney, color: "#8B5CF6" },
  { id: "stub / KYC-gated", count: P.gatewaysStub, color: "#6D28D9" },
];
const TOTAL_GATEWAYS = CATEGORIES.reduce((a, c) => a + c.count, 0);

type Call = { x: number; y: number; vx: number; vy: number; bin: number };

export function GatewayLab() {
  const [routed, setRouted] = useState(false);
  const routedRef = useRef(false);
  routedRef.current = routed;
  const [stats, setStats] = useState({ routed: 0, blocked: 0 });

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    const calls: Call[] = [];
    const bins = CATEGORIES.map(() => 0);
    let blocked = 0;
    let spawnAcc = 0;
    let statsAcc = 0;

    // Weighted by each category's real share of the catalog.
    const pickBin = () => {
      const r = Math.random() * TOTAL_GATEWAYS;
      let acc = 0;
      for (let i = 0; i < CATEGORIES.length; i++) {
        acc += CATEGORIES[i].count;
        if (r < acc) return i;
      }
      return CATEGORIES.length - 1;
    };

    const binX = (i: number) => getSize().width * ((i + 0.5) / CATEGORIES.length);
    const hubY = () => getSize().height * 0.22;
    const barrierY = () => getSize().height * 0.42;

    const updateStats = () => {
      setStats({ routed: bins.reduce((a, b) => a + b, 0), blocked });
    };

    const step = (dtMs: number) => {
      const { width, height } = getSize();
      spawnAcc += dtMs;
      while (spawnAcc > 160) {
        spawnAcc -= 160;
        calls.push({ x: width / 2 + (Math.random() - 0.5) * 24, y: -8, vx: 0, vy: 70 + Math.random() * 50, bin: pickBin() });
      }
      const dt = Math.min(dtMs, 64) / 1000;
      for (let i = calls.length - 1; i >= 0; i--) {
        const c = calls[i];
        if (routedRef.current) {
          if (c.y > hubY()) {
            const tx = binX(c.bin);
            c.vx += (tx - c.x) * 2.4 * dt * 10;
            c.vx *= 0.92;
          }
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          if (c.y > height - 46) {
            calls.splice(i, 1);
            bins[c.bin]++;
          }
        } else {
          c.y += c.vy * dt;
          if (c.y > barrierY()) {
            calls.splice(i, 1);
            blocked++;
          }
        }
      }
      statsAcc += dtMs;
      if (statsAcc > 600) {
        statsAcc = 0;
        updateStats();
      }
    };

    const draw = () => {
      const { width, height } = getSize();
      ctx.clearRect(0, 0, width, height);
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(232,239,233,0.5)";
      ctx.fillText("checkout", width / 2, 14);
      ctx.textAlign = "left";

      // falling calls
      for (const c of calls) {
        const color = routedRef.current ? CATEGORIES[c.bin].color : "#ff5c5c";
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = routedRef.current ? `${color}44` : "rgba(255,92,92,0.25)";
        ctx.fillRect(c.x - 0.5, c.y - 14, 1, 12);
      }

      if (!routedRef.current) {
        const by = barrierY();
        const h = Math.min(34, 6 + blocked * 0.16);
        ctx.strokeStyle = "rgba(255, 92, 92, 0.55)";
        ctx.beginPath();
        ctx.moveTo(16, by);
        ctx.lineTo(width - 16, by);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 92, 92, 0.25)";
        ctx.fillRect(20, by, width - 40, h);
        ctx.strokeStyle = "rgba(255, 92, 92, 0.6)";
        ctx.strokeRect(20, by, width - 40, h);
        ctx.fillStyle = "rgba(255, 92, 92, 0.9)";
        ctx.textAlign = "center";
        ctx.fillText("✕ custom SDK integration needed", width / 2, by + h + 16);
        ctx.textAlign = "left";
      } else {
        // hub
        const hy = hubY();
        ctx.fillStyle = "rgba(167, 139, 250, 0.18)";
        ctx.strokeStyle = "#A78BFA";
        ctx.beginPath();
        ctx.roundRect(width / 2 - 52, hy - 12, 104, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#A78BFA";
        ctx.textAlign = "center";
        ctx.fillText("PaymentGateway", width / 2, hy + 3);
        ctx.textAlign = "left";

        // bins, sized by live proportion of each category's real share
        const total = bins.reduce((a, b) => a + b, 0) || 1;
        CATEGORIES.forEach((cat, i) => {
          const x = binX(i);
          const w = width / CATEGORIES.length - 18;
          const h = 8 + (bins[i] / total) * 100;
          ctx.fillStyle = `${cat.color}33`;
          ctx.fillRect(x - w / 2, height - 40 - h, w, h);
          ctx.strokeStyle = `${cat.color}aa`;
          ctx.strokeRect(x - w / 2, height - 40 - h, w, h);
          ctx.fillStyle = cat.color;
          ctx.textAlign = "center";
          ctx.fillText(`${Math.round((bins[i] / total) * 100)}%`, x, height - 46 - h);
          ctx.fillStyle = "rgba(232,239,233,0.6)";
          ctx.fillText(cat.id, x, height - 22);
          ctx.fillText(`(${cat.count})`, x, height - 10);
          ctx.textAlign = "left";
        });
      }
    };

    return { step, draw };
  });

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        PaymentsLab catalogs {TOTAL_GATEWAYS} real payment gateways — {P.gatewaysNative} native-SDK
        integrations, {P.gatewaysHosted} hosted-webview providers, {P.gatewaysMobileMoney} mobile-money
        flows and {P.gatewaysStub} catalog-only/KYC-gated entries — behind one PaymentGateway interface.
        Toggle the abstraction off and every checkout call needs its own bespoke integration; switch it
        on and the same call routes through a single contract into whichever of the {TOTAL_GATEWAYS}
        gateways is on the other end.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        <div className="relative h-[340px] sm:h-[400px]">
          <canvas ref={canvasRef} className="h-full w-full" role="img" aria-label="PaymentsLab gateway routing simulation" />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input type="checkbox" checked={routed} onChange={(e) => setRouted(e.target.checked)} className="accent-signal" />
            route through PaymentGateway contract
          </label>
          {routed ? (
            <span className="font-mono text-xs text-accent">
              {stats.routed} calls routed · {TOTAL_GATEWAYS} gateways reachable · 0 gateway-specific code touched
            </span>
          ) : (
            <span className="font-mono text-xs text-muted">{stats.blocked} calls blocked · custom integration required per gateway</span>
          )}
          <Link
            to="/project/$slug"
            params={{ slug: "paymentslab" }}
            className="ml-auto font-mono text-[11px] text-muted transition hover:text-accent"
          >
            the full story → PaymentsLab's {TOTAL_GATEWAYS} gateways
          </Link>
        </div>
      </div>
    </div>
  );
}
