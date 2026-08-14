import { ArrowUpRight } from "lucide-react";
import { AppIcon } from "./ShippedTile.tsx";
import { archiveMonth, shortDate } from "./shippedFormat.ts";

/**
 * One client, with everything it shipped.
 *
 * Almost every client on this shelf put out a matched pair — one app for riders,
 * one for drivers — which as separate rows meant the same company appearing
 * twice in a row with the same logo, the same publisher and a name differing by
 * one word. Ninety rows collapse to forty-odd companies this way, and the page
 * reads as what it is: a list of businesses, not a list of binaries.
 *
 * The company is the heading; the apps are the links inside it.
 */

type ClientApp = {
  id: string;
  name: string | null;
  url: string;
  side?: string;
  installs?: string | null;
  rating?: number | null;
  updated?: string | null;
  lastSeen?: string;
};

export type Client = {
  key: string;
  name: string;
  developer?: string | null;
  icon: string | null;
  color?: string | null;
  setUpByHim?: boolean;
  rating?: number | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  apps: readonly ClientApp[];
};

/** "rider" → "Rider app". The label a person would use for it. */
const SIDE_LABEL: Record<string, string> = {
  rider: "Rider",
  driver: "Driver",
  merchant: "Merchant",
};

export function ShippedClient({ client, past = false }: { client: Client; past?: boolean }) {
  return (
    <div
      style={client.color ? { borderLeftColor: client.color, borderLeftWidth: 2 } : undefined}
      className={`flex h-full flex-col rounded-2xl border border-line p-4 transition hover:border-zinc-600 ${
        past ? "border-dashed" : "bg-card/50"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* AppIcon only reads name/icon/colour; the id and url are its type
            asking for an app, and a client is not one. */}
        <AppIcon
          app={{ id: client.key, name: client.name, icon: client.icon, color: client.color, url: "" }}
          size={past ? 34 : 40}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`truncate text-sm font-semibold ${past ? "text-zinc-400" : "text-zinc-100"}`}
            >
              {client.name}
            </span>
            {client.setUpByHim && (
              <span
                title="I set this client up"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              />
            )}
          </div>
          {client.developer && client.developer !== client.name && (
            <span className="block truncate text-xs text-muted">{client.developer}</span>
          )}
          {past && client.lastSeen && (
            <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-muted">
              on the store until {archiveMonth(client.lastSeen)}
            </span>
          )}
        </div>
      </div>

      {/* The apps themselves. Two lines for a pair, one for a single — and each
          is its own link, so the grouping costs nobody a destination. */}
      <ul className="mt-3 flex flex-col gap-1">
        {client.apps.map((app) => (
          <li key={app.id}>
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              title={app.name ?? app.id}
              className="group flex items-baseline gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]"
            >
              <span className="w-[52px] shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted">
                {SIDE_LABEL[app.side ?? ""] ?? "App"}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted">
                {[
                  app.installs,
                  app.rating != null ? `${app.rating.toFixed(1)}★` : null,
                  app.updated ? shortDate(app.updated) : null,
                  past && app.lastSeen ? archiveMonth(app.lastSeen) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "open listing"}
              </span>
              <ArrowUpRight
                size={12}
                className="shrink-0 text-zinc-700 transition group-hover:text-accent"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
