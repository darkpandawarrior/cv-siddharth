import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Ops, OpsRun } from "../api/_lib/ops-handler.ts";
import { perimeter, leverage, drift, opsGeneratedAt } from "./data/ops.ts";
import { ageDays, stateForAge, type OpsState } from "./data/freshnessSla.ts";
import { fleet, fleetStats, storeGeneratedAt } from "./data/store.ts";
import { incidents } from "./data/incidents.ts";
import { projects } from "./data/profile.ts";
import { SiteFooter } from "./SiteFooter.tsx";
import { LauncherButton } from "./Launcher.tsx";

/**
 * /ops — a control loop rendered as a page.
 *
 * Every other surface on this site argues the work was good. This one argues
 * the work is STILL TRUE, and shows the machinery that would notice if it
 * stopped being. Spec: docs/ops-board.md.
 *
 * ── THE GRAMMAR ──────────────────────────────────────────────────────────
 * Four fields, in this order, and never a fifth:
 *
 *     LED   SUBJECT (+ its context)      STATE      VERIFIED
 *
 * The context is not a column — it is the rest of SUBJECT's line, the way a
 * console line has always been a fixed tag followed by a message. That is what
 * made it possible to stop truncating: 24 of 46 rows were being ellipsised,
 * and every incident row lost 20-50 characters of its actual point.
 *
 * ── WHY DEGRADED IS THE WHOLE IDEA ───────────────────────────────────────
 * Green-or-red is what GitHub already gives you. DEGRADED — passing,
 * succeeding daily, and quietly aging toward its deadline — is the state every
 * failure this board was built after actually lived in: a daily refresh red for
 * eight days with a green test suite, a 5,150-line generated file 21 days old
 * and invisible to its own alarm, a chess dataset 29 days stale with 16 more
 * days of legal silence still to run.
 *
 * ── WHAT IS ON SCREEN AT SECOND ZERO ─────────────────────────────────────
 * The escalation rail is sticky and holds the ACTUAL non-OK rows, not a
 * summary of them. A board about failure nobody noticed cannot make you scroll
 * to find the failure. Those rows stay in their own block below and that
 * block's census still counts them, because hoisting a row out silently would
 * make the block read clean when it is not.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────
 * Only BROKEN moves, in two places that are the same BROKEN thing: the LED
 * breathes, and the rail counts how long the worst row has been wrong.
 * Nothing else animates. Both stop under reduced motion, and BROKEN is still
 * carried by colour, a word and a static outline without them.
 *
 * ── PROVENANCE ───────────────────────────────────────────────────────────
 * Nothing on this page claims current access to an employer's code. The Dice
 * and Jugnoo work is measured history: public Play listings that anyone can
 * re-check, and counts taken once, during employment, from repos that are not
 * his and are not tracked here. The fleet block says so in its own note.
 */

const REPO = "https://github.com/darkpandawarrior/cv-siddharth";
const ACTIONS = `${REPO}/actions`;

const STATE_COLOR: Record<OpsState, string> = {
  OK: "var(--color-signal)",
  DEGRADED: "var(--color-accent)",
  BROKEN: "var(--color-danger)",
};

const RANK: Record<OpsState, number> = { BROKEN: 0, DEGRADED: 1, OK: 2 };

type RowModel = {
  key: string;
  state: OpsState;
  subject: string;
  subjectHref: string;
  detail: React.ReactNode;
  verified: string;
  verifiedHref?: string;
  /** Set only where an elapsed time is meaningful — drives the rail's clock. */
  sinceIso?: string;
  /** Which block this row belongs to, shown when it is hoisted into the rail. */
  lane?: string;
};

const bySeverity = (a: RowModel, b: RowModel) => RANK[a.state] - RANK[b.state];

/** Whole days, rendered the way an operator reads them. */
function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(0, Math.floor(ms / 60_000))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Time REMAINING, not elapsed.
 *
 * "21d / 45d" makes a reader do the subtraction. "24d left of 45d" is the same
 * fact already reduced to the part that matters, and it turns the perimeter
 * from trivia into a countdown — which is what it actually is.
 */
function budget(age: number, sla: number): string {
  const left = sla - age;
  if (left < 0) return `${-left}d OVER the ${sla}d SLA`;
  if (left === 0) return `due today · ${sla}d SLA`;
  return `${left}d left of ${sla}d`;
}

const bytes = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;

/** The LED. The only thing on the page allowed to move, and only when BROKEN. */
function Led({ state }: { state: OpsState }) {
  return (
    <span
      aria-hidden
      className={`ops-led inline-block h-2 w-2 shrink-0 rounded-full ${state === "BROKEN" ? "ops-pulse" : ""}`}
      style={{ background: STATE_COLOR[state] }}
    />
  );
}

/**
 * One row. Four fields, always.
 *
 * SUBJECT links to the thing and VERIFIED links to the evidence — the spec
 * makes connectivity mechanical, and ops.test.ts asserts both are present.
 */
function Row({ m, lane = false }: { m: RowModel; lane?: boolean }) {
  const external = m.subjectHref.startsWith("http");
  return (
    <div className="ops-row" data-state={m.state}>
      <Led state={m.state} />
      <div className="ops-cell">
        <a
          href={m.subjectHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {m.subject}
        </a>
        {lane && m.lane && <span className="ops-lane">{m.lane}</span>}
        <span className="ops-detail">{m.detail}</span>
      </div>
      <span className="ops-state" style={{ color: STATE_COLOR[m.state] }}>{m.state}</span>
      {m.verifiedHref ? (
        <a className="ops-verified" href={m.verifiedHref} target="_blank" rel="noreferrer">{m.verified}</a>
      ) : (
        <span className="ops-verified">{m.verified}</span>
      )}
    </div>
  );
}

/** A block heading is a rule line carrying its own census, not a card. */
function Block({ title, note, rows }: { title: string; note: React.ReactNode; rows: RowModel[] }) {
  const id = `ops-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const n = (s: OpsState) => rows.filter((r) => r.state === s).length;
  return (
    <section className="ops-block" aria-labelledby={id}>
      <div className="ops-rule">
        <h2 id={id} className="ops-rule__title">{title}</h2>
        <span className="ops-rule__census">
          <b style={{ color: STATE_COLOR.BROKEN }}>{n("BROKEN")}</b> broken ·{" "}
          <b style={{ color: STATE_COLOR.DEGRADED }}>{n("DEGRADED")}</b> degraded ·{" "}
          <b style={{ color: STATE_COLOR.OK }}>{n("OK")}</b> ok
        </span>
        <span className="ops-rule__note">{note}</span>
      </div>
      {rows.length === 0
        ? <p className="ops-empty">— nothing reporting here yet</p>
        : rows.map((m) => <Row key={m.key} m={m} />)}
    </section>
  );
}

/**
 * The one ticking readout on the page, and the only thing that says "right
 * now" rather than "as of".
 *
 * Its own component so the 1Hz setState re-renders ONE span instead of
 * reconciling every row on the board every second. Mounted only when a BROKEN
 * row exists, and it does not start under prefers-reduced-motion — with a
 * change listener, so toggling the OS setting mid-session actually stops it.
 */
function BrokenClock({ sinceIso }: { sinceIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let id = 0;
    const sync = () => {
      window.clearInterval(id);
      id = mq.matches ? 0 : window.setInterval(() => setNow(Date.now()), 1000);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => { window.clearInterval(id); mq.removeEventListener("change", sync); };
  }, []);
  const ms = Math.max(0, now - Date.parse(sinceIso));
  const d = Math.floor(ms / 86_400_000);
  const t = new Date(ms % 86_400_000).toISOString().slice(11, 19);
  return <span className="ops-clock">worst unchanged for {d}d {t}</span>;
}

/** A workflow's conclusion, mapped onto the board's three states. */
function stateForRun(r: OpsRun): OpsState {
  if (r.conclusion === "success") return r.recentFailures > 0 ? "DEGRADED" : "OK";
  if (r.conclusion === "skipped") return "DEGRADED";
  return "BROKEN";
}

/** The web builds this domain serves — derived, so a new one appears here. */
const LIVE_BUILDS = projects.flatMap((p) => {
  const t = p.targets?.find((x) => x.liveUrl);
  return t?.liveUrl ? [{ slug: p.slug, name: p.name.split(/\s*[—–:]\s+/)[0], url: t.liveUrl }] : [];
});

export function OpsBoard() {
  const [ops, setOps] = useState<Ops | null>(null);
  const [failed, setFailed] = useState(false);
  /** slug → HTTP status of its embed, checked same-origin in the browser. */
  const [builds, setBuilds] = useState<Record<string, number | "err">>({});

  useEffect(() => {
    let live = true;
    fetch("/api/ops")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Ops) => live && setOps(d))
      .catch(() => live && setFailed(true));

    // The one check on this page a reader's own browser performs. Every live
    // build is same-origin, so it costs no API and cannot be faked by the
    // server: if an embed 404s, the row claiming it is playable goes red.
    for (const b of LIVE_BUILDS) {
      fetch(b.url, { method: "HEAD" })
        .then((r) => live && setBuilds((s) => ({ ...s, [b.slug]: r.status })))
        .catch(() => live && setBuilds((s) => ({ ...s, [b.slug]: "err" })));
    }
    return () => { live = false; };
  }, []);

  /* Stamped once at mount, to the second. It is literally true — it IS the
     instant every age on this page was computed — and it costs zero motion. */
  const loadedAt = useMemo(() => new Date().toISOString().slice(0, 19) + "Z", []);

  const towerRows = useMemo<RowModel[]>(() => [
    ...(ops?.runs ?? []).map((r): RowModel => ({
      key: `tower:${r.workflow}`,
      lane: "tower",
      state: stateForRun(r),
      subject: r.workflow,
      subjectHref: ACTIONS,
      detail: `${r.event} · ${r.recentFailures} of the last ${r.recentTotal} runs failed`,
      verified: ago(r.at),
      verifiedHref: r.url,
      sinceIso: r.at,
    })),
    ...(ops?.neverRan ?? []).map((w): RowModel => ({
      key: `tower:${w}`,
      lane: "tower",
      state: "DEGRADED",
      subject: w,
      subjectHref: ACTIONS,
      detail: "no completed run on record",
      verified: "never",
    })),
  ].sort(bySeverity), [ops]);

  /**
   * What is published, signed by whom, and how a reader checks it themselves.
   *
   * The one chain on this site that is cryptographically verifiable end to
   * end, and it was missing from the board entirely.
   */
  const chainRows = useMemo<RowModel[]>(() => {
    const chain = ops?.supplyChain;
    if (!chain?.connected) return [];
    const rows: RowModel[] = chain.apps.map((a): RowModel => ({
      key: `chain:${a.pkg}`,
      lane: "published",
      state: a.signerMatches ? "OK" : "BROKEN",
      subject: a.pkg,
      subjectHref: a.fdroidUrl,
      detail: (
        <>
          v{a.versionName} ({a.versionCode}) · {bytes(a.sizeBytes)} ·{" "}
          {a.signerMatches ? "signed with the pinned key" : "SIGNED WITH AN UNEXPECTED KEY"}
          {a.antiFeatures.length > 0 && ` · ${a.antiFeatures.join(", ")}`}
        </>
      ),
      verified: "release",
      verifiedHref: a.releaseUrl,
    }));
    if (chain.indexBuiltAt) {
      const age = ageDays(chain.indexBuiltAt.slice(0, 10));
      rows.push({
        key: "chain:index",
        lane: "published",
        state: stateForAge(age, 45),
        subject: "F-Droid index",
        subjectHref: "https://darkpandawarrior.github.io/fdroid/repo/",
        detail: `signed by a different key from the APKs, so compromising this site cannot forge an app update · ${budget(age, 45)}`,
        verified: chain.indexBuiltAt.slice(0, 10),
        verifiedHref: "https://darkpandawarrior.github.io/fdroid/",
        sinceIso: chain.indexBuiltAt,
      });
    }
    return rows.sort(bySeverity);
  }, [ops]);

  /** The perimeter, aged at render time so the board is never staler than the
   *  moment it loaded — even if nothing has rebuilt for a week. */
  const perimeterRows = useMemo<RowModel[]>(() => {
    const rows = perimeter.map((p): RowModel => {
      const age = ageDays(p.generatedAt);
      return {
        key: `perimeter:${p.file}`,
        lane: "perimeter",
        state: stateForAge(age, p.slaDays),
        subject: p.file,
        subjectHref: `${REPO}/blob/main/src/data/${p.file}`,
        detail: `${budget(age, p.slaDays)} · ${p.generator.replace("npm run ", "")}`,
        verified: p.generatedAt,
        verifiedHref: `${REPO}/actions/workflows/refresh-media.yml`,
        sinceIso: p.generatedAt,
      };
    });
    const sweepAge = ageDays(storeGeneratedAt);
    rows.push({
      key: "perimeter:sweep",
      lane: "perimeter",
      state: stateForAge(sweepAge, 45),
      subject: "Play Store fleet sweep",
      subjectHref: `${REPO}/blob/main/scripts/gen-store.mjs`,
      detail: `${budget(sweepAge, 45)} · gen:store · run by hand, not on a cron`,
      verified: storeGeneratedAt,
      sinceIso: storeGeneratedAt,
    });
    return rows.sort(bySeverity);
  }, []);

  /** The five web builds this domain serves, checked by your own browser. */
  const buildRows = useMemo<RowModel[]>(
    () => LIVE_BUILDS.map((b): RowModel => {
      const status = builds[b.slug];
      const state: OpsState = status === undefined ? "DEGRADED" : status === 200 ? "OK" : "BROKEN";
      return {
        key: `build:${b.slug}`,
        lane: "surfaces",
        state,
        subject: b.name,
        subjectHref: b.url,
        detail:
          status === undefined ? `${b.url} · checking…`
          : status === 200 ? `${b.url} · served from this domain`
          : `${b.url} · ${status === "err" ? "unreachable" : `HTTP ${status}`}`,
        verified: status === undefined ? "…" : status === 200 ? "just now" : "failed",
      };
    }).sort(bySeverity),
    [builds],
  );

  /**
   * How far each app is behind the shared foundation it vendors.
   *
   * Real SHA distance: every consumer pins kmp-toolkit and kmp-build-logic as
   * git submodules, so "behind" is `rev-list --count <pin>..HEAD`. A pin the
   * clone has never fetched reports as unmeasured rather than as zero.
   */
  const driftRows = useMemo<RowModel[]>(
    () => drift.map((d): RowModel => ({
      key: `drift:${d.repo}:${d.upstream}`,
      lane: "drift",
      // No BROKEN here, and deliberately no threshold. "8 commits behind" as a
      // failure line would be a number invented to make a row red — the exact
      // thing this board refuses elsewhere. Drift has no declared SLA, so it
      // reports two honest states: level, or behind by a measured amount.
      state: d.behind === 0 ? "OK" : "DEGRADED",
      subject: `${d.repo} → ${d.upstream}`,
      subjectHref: `https://github.com/darkpandawarrior/${d.upstream}`,
      detail: d.behind === null
        ? `pinned at ${d.pin}, a commit this clone has never fetched — distance unmeasured rather than assumed zero`
        : d.behind === 0
          ? `pinned at ${d.pin} · level with upstream`
          : `pinned at ${d.pin} · ${d.behind} commit${d.behind === 1 ? "" : "s"} behind upstream`,
      verified: d.pinnedAt ?? "unknown",
    })).sort(bySeverity),
    [],
  );

  /* All of them, oldest release first. Eight rows with a dot is a status
     badge; the whole fleet is somebody noticing what nobody else did.

     STATE is "confirmed listed on the last sweep", never "shipped recently".
     gen-store.mjs drops anything whose listing does not resolve, so every row
     present IS live. An app quiet since 2023 is a quiet app, not a broken one,
     and the staleness that CAN go wrong here — the sweep's — has its own row
     on the perimeter above. */
  const fleetRows = useMemo<RowModel[]>(
    () => [...fleet]
      .filter((f) => f.updated)
      .sort((a, b) => Date.parse(a.updated!) - Date.parse(b.updated!))
      .map((f): RowModel => ({
        key: `fleet:${f.id}`,
        lane: "fleet",
        state: "OK",
        subject: f.name,
        subjectHref: f.url,
        detail: (
          <>
            {f.developer} · {f.installs} installs · last shipped{" "}
            <span className="ops-atom">{new Date(f.updated!).toISOString().slice(0, 10)}</span>
          </>
        ),
        verified: storeGeneratedAt,
        verifiedHref: f.url,
      })),
    [],
  );

  /**
   * Convention plugins by the modules that apply them.
   *
   * A plugin applied by nothing is DEGRADED, and ten of the seventeen are.
   * That is a real finding about his own toolchain rather than a rendering
   * accident: the generator used to walk each consumer's vendored `external/`
   * submodules, which counted upstream modules once per consumer and counted
   * every plugin's own declaration file as a consumer of itself. It reported
   * shared.android.library at 63 against a true 24, and painted all ten of the
   * zeros green.
   */
  const leverageRows = useMemo<RowModel[]>(
    () => leverage.map((l): RowModel => ({
      key: `leverage:${l.id}`,
      lane: "leverage",
      state: l.modules > 0 ? "OK" : "DEGRADED",
      subject: l.id,
      subjectHref: "https://github.com/darkpandawarrior/kmp-build-logic",
      detail: l.modules > 0
        ? l.repos.join(" · ")
        : "authored, applied by no consumer module — the id appears in no build file outside its own declaration",
      verified: `${l.modules} modules`,
    })).sort(bySeverity),
    [],
  );

  const ledgerRows = useMemo<RowModel[]>(
    () => incidents.map((i): RowModel => ({
      key: `ledger:${i.id}`,
      lane: "ledger",
      state: i.resolved ? "OK" : "BROKEN",
      subject: i.subject,
      subjectHref: i.subjectHref,
      detail: i.what,
      verified: i.resolved ? `${i.days}d to fix` : "open",
      verifiedHref: i.evidenceHref,
    })).sort(bySeverity),
    [],
  );

  const all = [
    ...towerRows, ...chainRows, ...perimeterRows, ...buildRows,
    ...driftRows, ...fleetRows, ...leverageRows, ...ledgerRows,
  ];
  const escalated = [...all].filter((m) => m.state !== "OK").sort(bySeverity);
  const brokenCount = escalated.filter((m) => m.state === "BROKEN").length;
  const worst = escalated[0];
  const worstState: OpsState = worst?.state ?? "OK";

  const loop = [
    ["DETECT", all.length, false],
    ["ANNOUNCE", escalated.length, escalated.length > 0],
    ["ESCALATE", brokenCount, brokenCount > 0],
    ["REPAIR", incidents.filter((i) => !i.resolved).length, false],
    ["RECORD", incidents.length, false],
  ] as const;

  const closed = incidents.filter((i) => i.resolved);
  const guarded = closed.filter((i) => i.evidenceHref.includes(".test.")).length;

  return (
    <>
      {/* The skip link in __root.tsx targets #main-content, and every other
          route provides it. Without it "Skip to content" lands nowhere, which
          is both a real keyboard trap and what made e2e/a11y.spec.ts time out
          here rather than report a violation. */}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[92rem] px-6 py-10">
        {/* A way out. A route a visitor can land on and only leave with the
            back button is the failure surfaces.test.ts calls the loopdown bug,
            and it would be a poor joke on a page about noticing things. */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link to="/" className="kicker-accent transition hover:opacity-80">← Back to portfolio</Link>
          <LauncherButton />
        </div>
        <p className="section-eyebrow mb-2">// the control loop</p>
        <h1 className="font-display mb-3 text-h2 font-bold tracking-tight">Still true, or only once true</h1>
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Every other page here argues the work was good. This one argues it is still true, and shows
          the machinery that would notice if it stopped being. Three states:{" "}
          <b style={{ color: STATE_COLOR.OK }}>OK</b> is a check that ran and passed,{" "}
          <b style={{ color: STATE_COLOR.BROKEN }}>BROKEN</b> is a check that failed or an SLA that is
          blown, and <b style={{ color: STATE_COLOR.DEGRADED }}>DEGRADED</b> —{" "}
          <i>passing, succeeding daily, and quietly aging toward its deadline</i> — is the state every
          failure this board was built after actually lived in.
        </p>

        <div className="ops-console font-mono-os">
          <div className="ops-banner" data-worst={worstState}>
            <div className="ops-banner__line">
              <span className="ops-banner__mark">SID//OS</span>
              <span className="ops-banner__name">ops console</span>
              <a className="ops-banner__link" href={REPO} target="_blank" rel="noreferrer">darkpandawarrior/cv-siddharth</a>
              <span>aged at load {loadedAt}</span>
              <span>actions api {failed ? "unreachable" : ops ? "connected" : "reading…"}</span>
            </div>

            <div className="ops-banner__line">
              {loop.map(([label, n, hot]) => (
                <span key={label} className="ops-stat" data-hot={hot}>
                  {label}<b>{String(n).padStart(3, "0")}</b>
                </span>
              ))}
            </div>

            {/* THE RAIL. The actual non-OK rows, so the worst thing in the
                system is on screen at every scroll position. They stay in
                their own blocks below and the census there still counts them. */}
            <section className="ops-rail" aria-labelledby="ops-rail-h">
              <div className="ops-banner__line">
                <h2 id="ops-rail-h" className="ops-rail__badge">
                  {escalated.length ? "escalated" : "all clear"}
                </h2>
                <span><b>{brokenCount}</b> broken</span>
                <span><b>{escalated.length - brokenCount}</b> degraded</span>
                <span><b>{all.length - escalated.length}</b> steady</span>
                <span>
                  {escalated.length
                    ? "pinned here and still counted in their own blocks below"
                    : "nothing is escalating; every row is inside the SLA it declares"}
                </span>
                {worstState === "BROKEN" && worst?.sinceIso && <BrokenClock sinceIso={worst.sinceIso} />}
              </div>
              {escalated.length > 0 && (
                <div className="ops-rail__list">
                  {escalated.map((m) => <Row key={`esc:${m.key}`} m={m} lane />)}
                </div>
              )}
            </section>
          </div>

          <Block
            title="Control tower"
            note="every workflow in the repo that ships this site, read live from the Actions API"
            rows={towerRows}
          />
          <Block
            title="Published and signed"
            note="what is on the F-Droid repo right now, and the two keys that put it there — run apksigner verify --print-certs on any download and compare"
            rows={chainRows}
          />
          <Block
            title="Freshness perimeter"
            note="generated data against the SLA its own test enforces · worst first · aged as you loaded this page"
            rows={perimeterRows}
          />
          <Block
            title="Live surfaces"
            note="the web builds this domain serves — checked by your own browser, same-origin, when this page loaded"
            rows={buildRows}
          />
          <Block
            title="Vendored drift"
            note="how far each app is behind the shared foundation it pins as a git submodule"
            rows={driftRows}
          />
          <Block
            title="Fleet heartbeat"
            note={
              <>
                {fleetStats.live} apps re-verified against their live Play listings on the last
                sweep · {fleetStats.installFloor.toLocaleString()} installs floor ·{" "}
                {fleetStats.delisted} since delisted. No SLA on a row here: a quiet app is not a
                broken one, and the sweep has its own perimeter row. These shipped from employer
                work — the listings are public and anyone can re-check them, the source was never
                his and is not tracked on this board.
              </>
            }
            rows={fleetRows}
          />
          <Block
            title="Leverage"
            note="convention plugins by the modules that apply them — a plugin nothing applies is DEGRADED, not absent"
            rows={leverageRows}
          />
          <Block
            title="Incident ledger"
            note="every failure a green check did not catch · each entry is about a row above it"
            rows={ledgerRows}
          />

          <p className="ops-empty">
            {guarded} of {closed.length} closed by a check that now sits on this board — which is the
            loop shut.
          </p>
        </div>

        <p className="kicker mt-6">
          Perimeter, leverage and drift generated {opsGeneratedAt} from repos on the build machine;
          ages computed as you loaded this page; the control tower, the published chain and the live
          surfaces all read at load. Employment-era figures are measured history, not a live feed.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
