import { useNow } from "./lib/useSky.ts";
import { useLiveSignal } from "./lib/useLiveSignal.ts";
import { useSignals } from "./lib/useLive.ts";
import type { GithubActivity } from "../api/_lib/github-activity-handler.ts";
import type { CiRepoSlug, DownloadRepoSlug } from "../api/_lib/signals-handler.ts";

/** reality-spec.md and live-data-spec.md have no per-project repo field to
 *  read — never one shy of the two known private cases (candidai has no
 *  self-repo link by design, stutter's `links` is empty), so this is a
 *  2-entry list, not a generated one. Kept in sync with signalsText.ts's own
 *  PRIVATE_REPOS by hand (owned by a different lane; a 2-item constant isn't
 *  worth crossing a lane-ownership boundary to import). */
const PRIVATE_SLUGS = new Set(["candidai", "stutter"]);

/**
 * The GitHub "owner/Name" this project's OWN repo lives at, or `null` when
 * none of its links points at one — a project whose repo doesn't match its
 * own slug (kmp-family: a toolkit family, not one repo) renders nothing
 * rather than a fabricated or mislabeled row.
 */
export function repoOf(slug: string, links: { label: string; url: string }[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const link of links) {
    const m = /github\.com\/([^/]+)\/([^/#?]+)/i.exec(link.url);
    if (m && norm(m[2]) === norm(slug)) return `${m[1]}/${m[2]}`;
  }
  return null;
}

/** "3 h ago", live-ticking off the shared minute clock (`useNow`). `null`
 *  before that clock's first client tick (SSR / first paint), matching every
 *  other live-ticking label on this site. */
export function agoLabel(iso: string, now: Date | null): string | null {
  if (!now) return null;
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} m ago`;
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/**
 * reality-spec.md §6 + live-data-spec.md §3: one live row on `/project/$slug`
 * — this repo's last public push (from `/api/github-activity`), plus, for
 * the three flagship slugs `/api/signals` tracks (doori, gaddi,
 * paymentslab-kmp), main-branch CI and the latest release's APK downloads.
 * A project with no public repo of its own renders the fixed
 * "private, not polled" label and fetches neither live source; one with a
 * repo but no slug match (kmp-family) renders nothing.
 */
export function CiStrip({ slug, links }: { slug: string; links: { label: string; url: string }[] }) {
  const now = useNow();
  const repo = repoOf(slug, links);
  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity");
  const { data: signals } = useSignals();

  if (!repo) {
    if (!PRIVATE_SLUGS.has(slug)) return null;
    return <p className="font-mono text-xs text-muted">private, not polled</p>;
  }

  const push = activity?.items.find((item) => item.repo.toLowerCase() === repo.toLowerCase());
  const age = push ? agoLabel(push.at, now) : null;
  const pushLabel = age ? `last public push ${age}` : "no public push in the last 20 events";

  const ci = signals?.ci?.[slug as CiRepoSlug];
  const ciLabel = ci && ci.state !== "none" ? `main CI ${ci.state === "pass" ? "✓" : "✗"}` : null;

  const download = signals?.downloads?.[slug as DownloadRepoSlug];
  const downloadsLabel = download ? `${download.apk} APK downloads (GitHub)` : null;

  const row = [pushLabel, ciLabel, downloadsLabel].filter((part): part is string => Boolean(part)).join(" · ");

  return <p className="font-mono text-xs text-muted">{row}</p>;
}
