/**
 * One app, as a tile. Shared by the homepage shelf and the /shipped page so the
 * two never drift into showing the same app two different ways.
 *
 * THE ICON AND THE COLOUR ARE THE POINT. Each white-label build was rebranded
 * for its client, so each one has an icon and a theme colour of its own. Both
 * are resolved at generation time, which is why an app that was pulled from the
 * store years ago can still be shown as the thing it was rather than as a grey
 * rectangle.
 */
import { archiveMonth, shortDate } from "./shippedFormat.ts";

export type ShippedApp = {
  id: string;
  name: string | null;
  icon: string | null;
  color?: string | null;
  side?: string;
  installs?: string | null;
  rating?: number | null;
  developer?: string | null;
  url: string;
  setUpByHim?: boolean;
  /** Play's "Updated on" for a live app: when the installable build went out. */
  updated?: string | null;
  /** Earliest archived crawl — on the store since AT LEAST this. */
  firstSeen?: string | null;
  /** Last archived crawl of a listing that is gone. */
  lastSeen?: string;
};

export function AppIcon({ app, size = 40 }: { app: ShippedApp; size?: number }) {
  if (app.icon) {
    return (
      <img
        src={app.icon}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-[22%] bg-void object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: app.color ?? undefined }}
      className="font-display grid shrink-0 place-items-center rounded-[22%] bg-void text-sm font-bold text-muted"
    >
      {(app.name ?? app.id).slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ShippedTile({ app, past = false }: { app: ShippedApp; past?: boolean }) {
  const meta = [app.side, app.installs, app.rating != null ? `${app.rating.toFixed(1)}★` : null]
    .filter(Boolean)
    .join(" · ");

  // The dates get their own line rather than joining the pile above, because
  // they are what makes an entry checkable: an app whose last build went out
  // after he arrived is an app his work could be in, and one whose didn't is
  // not on this page at all.
  const dates = past
    ? [
        app.firstSeen ? `on Play by ${archiveMonth(app.firstSeen)}` : null,
        app.lastSeen ? `gone after ${archiveMonth(app.lastSeen)}` : null,
      ]
    : [
        app.firstSeen ? `on Play by ${archiveMonth(app.firstSeen)}` : null,
        app.updated ? `updated ${shortDate(app.updated)}` : null,
      ];
  const dateLine = dates.filter(Boolean).join(" · ");

  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      title={app.id}
      // The client's own brand colour, as a 2px edge. Enough to make a wall of
      // these read as a wall of different companies, which is the whole claim.
      style={app.color ? { borderLeftColor: app.color, borderLeftWidth: 2 } : undefined}
      className={`group flex items-center gap-3 rounded-xl border border-line p-2.5 transition hover:border-accent ${
        past ? "border-dashed bg-transparent" : "bg-card/60"
      }`}
    >
      <AppIcon app={app} size={past ? 32 : 40} />
      <span className="block min-w-0 flex-1">
        {/* min-w-0 on the ROW as well as the column. A flex item's default
            min-width is auto, so without it this row refuses to shrink below
            the app's full name and `truncate` on the child never engages —
            which pushed the tile 50px past the viewport on a 390px phone. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`truncate text-sm font-medium transition group-hover:text-accent ${past ? "text-zinc-400" : ""}`}
          >
            {app.name ?? app.id}
          </span>
          {app.setUpByHim && (
            <span
              title="I added this client's package id"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
          )}
        </span>
        {app.developer && (
          <span className="block truncate text-xs text-muted">{app.developer}</span>
        )}
        <span className="kicker block truncate">
          {meta}
        </span>
        {dateLine && (
          <span className="block truncate font-mono text-[10px] tracking-wider text-muted">
            {dateLine}
          </span>
        )}
      </span>
    </a>
  );
}
