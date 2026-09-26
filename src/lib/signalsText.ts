// Pure row formatters over /api/signals (live-data-spec §1.3), same shape as
// ledgerText.ts's weather/air/river/season rows: every place that renders a
// live signal imports these instead of restating the wording.
import type { CiRepoSlug, DownloadRepoSlug, SignalsResponse } from "../../api/_lib/signals-handler.ts";

function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

/** M18 / idea-atlas §I1: private registry repos are never fetched by
 *  /api/signals at all, so a caller passes their slug straight through with
 *  no `ci` entry to look up and gets this fixed label back. */
const PRIVATE_REPOS = new Set(["candidai", "stutter"]);

/**
 * One repo's own CI token: "private, not polled" for a private registry
 * repo (never fetched, section 5), "<slug> unmeasured" for a repo whose
 * Actions have never produced a completed run on main (idea-atlas: a
 * billing-gated repo), "<slug> ✓" for pass, "<slug> ✗ (<workflow,
 * workflow>)" for fail.
 */
export function ciRepoLabel(slug: string, ci: SignalsResponse["ci"]): string {
  if (PRIVATE_REPOS.has(slug)) return "private, not polled";
  const entry = ci?.[slug as CiRepoSlug];
  if (!entry || entry.state === "none") return `${slug} unmeasured`;
  if (entry.state === "pass") return `${slug} ✓`;
  return `${slug} ✗ (${entry.failing.join(", ")})`;
}

/** The combined family-CI ledger row, one token per repo in CI_REPOS order
 *  (doori, gaddi, paymentslab-kmp, kmp-toolkit, kmp-build-logic). */
export function ciRow(ci: SignalsResponse["ci"], at: string): string {
  if (!ci) return "CI · unavailable right now · GitHub Actions, main";
  const repos = Object.keys(ci) as CiRepoSlug[];
  const tokens = repos.map((slug) => ciRepoLabel(slug, ci));
  return `CI · ${tokens.join(" ")} · GitHub Actions, main · live ${istTime(at)} IST`;
}

/** `current-game` was rejected for this row (it reads the last FINISHED game
 *  as live) — `lichess` here always comes from the `users/status` presence
 *  endpoint (live-data-spec §1.3). */
export function chessRow(lichess: SignalsResponse["lichess"], at: string): string {
  if (!lichess) return "Chess · unavailable right now · lichess.org";
  const status = lichess.playing ? "playing now" : lichess.online ? "online, not playing" : "not playing";
  return `Chess · lichess: ${status} · lichess.org · live ${istTime(at)} IST`;
}

/** `totalLessons` is the build-time Loopdown lesson count (writing.ts,
 *  owned elsewhere, M21) — this formatter stays a pure function of whatever
 *  count its caller already has, rather than importing that module. */
export function kitesRow(devto: SignalsResponse["devto"], totalLessons: number, at: string): string {
  if (!devto) return "Kites · unavailable right now · dev.to";
  const engagement = devto.reduce((sum, a) => sum + a.reactions + a.comments, 0);
  const unit = engagement === 1 ? "reaction or comment" : "reactions or comments";
  return `Kites · ${devto.length} of ${totalLessons} lessons on dev.to, ${engagement} ${unit} in total · dev.to · live ${istTime(at)} IST`;
}

/** F-Droid keeps no download count (honesty constraint, live-data-spec §5) —
 *  this row is GitHub Releases only, and says so. */
export function downloadsRow(downloads: SignalsResponse["downloads"]): string {
  if (!downloads) return "Downloads · unavailable right now · GitHub Releases";
  const repos = Object.keys(downloads) as DownloadRepoSlug[];
  const parts = repos.map((slug) => `${slug} ${downloads[slug].apk}`);
  return `Downloads · ${parts.join(", ")} APK downloads, latest release · GitHub Releases (F-Droid keeps no download count)`;
}
