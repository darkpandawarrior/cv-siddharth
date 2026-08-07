/**
 * One app, as a tile. Shared by the homepage shelf and the /shipped page so the
 * two never drift into showing the same app two different ways.
 *
 * THE ICON AND THE COLOUR ARE THE POINT. A white-label build is a product
 * flavour that rebrands the app, so it carries its own launcher icon and its own
 * `resValue "color", 'theme_color'`. Both are recovered at generation time —
 * from the live listing where there still is one, otherwise out of the branch
 * that built it — which is why an app that was pulled from the store in 2019 can
 * still be shown as the thing it was instead of a grey rectangle.
 */
import { archiveMonth } from "./shippedFormat.ts";

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
  const meta = [
    app.side,
    app.installs,
    app.rating != null ? `${app.rating.toFixed(1)}★` : null,
    past && app.lastSeen ? `last seen ${archiveMonth(app.lastSeen)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          <span className="block truncate text-xs text-zinc-500">{app.developer}</span>
        )}
        <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-muted">
          {meta}
        </span>
      </span>
    </a>
  );
}
