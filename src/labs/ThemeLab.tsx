import { useState } from "react";
import { useSectionNav } from "../lib/navigation.ts";

/**
 * The White-label Lab — the "80% faster delivery" claim, running live. Brand
 * is a token, not a codebase: these are the site's own 6 real per-project
 * theme tokens (src/data/profile.ts `theme` fields), not fictional colors.
 * Picking Kursi also swaps in its real display font (Rozha One) to prove the
 * token layer carries typography, not just color. A layout-engine toggle
 * (Card / Hero) proves it drives which UI archetype renders, not just paint.
 */

type BrandToken = { name: string; label: string; color: string; font?: string };

const BRANDS: BrandToken[] = [
  { name: "portfolio", label: "Portfolio", color: "#3ddc84" },
  { name: "kursi", label: "Kursi", color: "#E8C874", font: "'Rozha One', Georgia, serif" },
  { name: "mileway", label: "Mileway", color: "#5ee6ff" },
  { name: "paymentslab", label: "PaymentsLab", color: "#A78BFA" },
  { name: "hiresignal", label: "HireSignal", color: "#3B82F6" },
  { name: "deadlock", label: "Deadlock", color: "#FF5C7A" },
];

const CLIENTS = ["FleetCo", "ZipRide", "HaulHub", "GoTrux"];
// The other 16 of the real 20+ white-label clients — shown as a compressed
// strip, not full cards. Numbered rather than named: the "20+" is the real
// claim, these fill it out without inventing 16 fictional company names.
const MORE_CLIENTS = Array.from({ length: 16 }, (_, i) => `C${String(i + 5).padStart(2, "0")}`);

function HeroPreview({ client, brand }: { client: string; brand: BrandToken }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full" style={{ background: brand.color }} />
          <span className="text-lg font-bold text-ink" style={{ fontFamily: brand.font, color: "#e8efe9" }}>
            {client}
          </span>
        </div>
        <div className="hidden gap-5 font-mono text-xs text-zinc-500 sm:flex">
          <span>Rides</span>
          <span>Fleet</span>
          <span>Support</span>
        </div>
        <div className="rounded-full px-4 py-1.5 text-xs font-bold text-ink" style={{ background: brand.color }}>
          Book now
        </div>
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div
            className="text-xl font-bold"
            style={{ fontFamily: brand.font, color: brand.color }}
          >
            {client} runs on one token
          </div>
          <div className="mt-2 h-2 w-4/5 rounded bg-zinc-800" />
          <div className="mt-1.5 h-2 w-3/5 rounded bg-zinc-800" />
          <div className="mt-4 inline-flex rounded-full px-5 py-2 text-sm font-bold text-ink" style={{ background: brand.color }}>
            Get started
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-ink"
            style={{ background: brand.color, fontFamily: brand.font }}
          >
            {client[0]}
          </div>
          <div className="flex gap-5">
            <div>
              <div className="text-lg font-bold" style={{ color: brand.color }}>20+</div>
              <div className="font-mono text-[10px] text-zinc-500">clients, one token</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: brand.color }}>80%</div>
              <div className="font-mono text-[10px] text-zinc-500">faster delivery</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeLab() {
  const { goToSection } = useSectionNav();
  const [brand, setBrand] = useState<BrandToken>(BRANDS[0]);
  const [flips, setFlips] = useState(0);
  const [layout, setLayout] = useState<"card" | "hero">("card");
  const [heroClient, setHeroClient] = useState(CLIENTS[0]);

  const pickBrand = (b: BrandToken) => {
    setBrand(b);
    setFlips((f) => f + 1);
  };

  return (
    <div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Twenty-plus clients used to mean twenty-plus forks. The pipeline made brand a token, not a
        codebase: change it once and every client app follows — down to the display font. These are
        the site's own 6 real theme tokens; pick one and watch color, and for Kursi even typography,
        propagate everywhere at once.
      </p>
      <div className="card-elevated overflow-hidden rounded-2xl border border-line bg-void/70">
        {layout === "card" ? (
          <>
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              {CLIENTS.map((c, i) => (
                <div
                  key={c}
                  className="overflow-hidden rounded-xl border border-line bg-card"
                  style={{ transition: `border-color 0.4s ${i * 90}ms`, borderColor: `${brand.color}44` }}
                >
                  <div
                    className="px-3 py-2 text-[11px] font-bold text-ink"
                    style={{ background: brand.color, fontFamily: brand.font, transition: `background 0.4s ${i * 90}ms` }}
                  >
                    {c}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="h-1.5 w-4/5 rounded bg-zinc-700" />
                    <div className="h-1.5 w-3/5 rounded bg-zinc-700" />
                    <div
                      className="mt-3 rounded-full px-2 py-1 text-center text-[10px] font-bold text-ink"
                      style={{ background: brand.color, transition: `background 0.4s ${i * 90}ms` }}
                    >
                      Book now
                    </div>
                    <div className="flex gap-1 pt-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: brand.color, transition: `background 0.4s ${i * 90}ms` }} />
                      <span className="h-2 w-2 rounded-full border border-line" />
                      <span className="h-2 w-2 rounded-full border border-line" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-line px-5 py-3">
              <p className="mb-2 font-mono text-[10px] text-zinc-600">+16 more clients on the same brand token</p>
              <div className="flex flex-wrap gap-1.5">
                {MORE_CLIENTS.map((code, i) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] text-zinc-400"
                    style={{ borderColor: `${brand.color}33`, transition: `border-color 0.4s ${i * 20}ms` }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: brand.color, transition: `background 0.4s ${i * 20}ms` }} />
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
              <span className="font-mono text-[10px] text-zinc-600">preview client:</span>
              {CLIENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setHeroClient(c)}
                  aria-pressed={heroClient === c}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition ${
                    heroClient === c ? "border-accent text-accent" : "border-line text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <HeroPreview client={heroClient} brand={brand} />
          </>
        )}

        {/* Static — anchors the 80% claim in the actual before/after, not just the label. */}
        <div className="border-t border-line px-5 py-4">
          <p className="mb-2 font-mono text-[10px] text-zinc-600">delivery time, per client</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 font-mono text-[10px] text-zinc-500">manual</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-zinc-600" style={{ width: "100%" }} />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] text-zinc-400">~3 weeks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 font-mono text-[10px] text-zinc-500">pipeline</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-800">
                <div className="h-2 rounded-full" style={{ width: "14%", background: brand.color }} />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] text-accent">~3 days</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={layout === "hero"}
              onChange={(e) => setLayout(e.target.checked ? "hero" : "card")}
              className="accent-[#3ddc84]"
            />
            hero layout
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-zinc-500">brand token:</span>
            {BRANDS.map((b) => (
              <button
                key={b.name}
                onClick={() => pickBrand(b)}
                aria-label={`Theme ${b.label}`}
                aria-pressed={brand.name === b.name}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition hover:scale-105"
                style={{
                  borderColor: brand.name === b.name ? b.color : "transparent",
                  color: brand.name === b.name ? b.color : "#a1a1aa",
                  background: brand.name === b.name ? `${b.color}1a` : "transparent",
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                {b.label}
              </button>
            ))}
          </div>
          {flips > 0 && (
            <span className="font-mono text-xs text-accent">
              {flips} {flips === 1 ? "change" : "changes"} · {flips * (CLIENTS.length + MORE_CLIENTS.length)} client updates · 0 forks
            </span>
          )}
          <button type="button" onClick={() => goToSection("work")} className="ml-auto font-mono text-[11px] text-zinc-500 transition hover:text-accent">
            the full story → 20+ clients, one pipeline
          </button>
        </div>
      </div>
    </div>
  );
}
