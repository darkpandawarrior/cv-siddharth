import { Link } from "@tanstack/react-router";
import { AmbientBackground } from "./AmbientBackground.tsx";

const PRIMARY_CLASS = "inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim";
const SECONDARY_CLASS = "inline-flex items-center gap-1.5 rounded-full border border-line px-5 py-2 text-sm font-semibold text-zinc-300 transition hover:border-accent hover:text-accent";

/**
 * Shared control-room fallback panel — reused by the 404 splat route
 * (src/routes/$.tsx) and the root route's errorComponent (__root.tsx).
 * Pure/presentational: no browser globals at module scope, SSR-safe.
 */
export function ErrorPanel({
  code,
  title,
  message,
  onReload,
  extraLinks = [],
}: {
  code: string;
  title: string;
  message: string;
  onReload?: () => void;
  extraLinks?: { label: string; to: string; params?: { slug: string } }[];
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-24">
      <AmbientBackground />
      <div className="glass-panel relative w-full max-w-lg rounded-2xl px-8 py-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent2/80">{code}</p>
        <h1 className="font-display mt-3 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{message}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {onReload && (
            <button type="button" onClick={onReload} className={PRIMARY_CLASS}>
              Reload
            </button>
          )}
          <Link to="/" className={onReload ? SECONDARY_CLASS : PRIMARY_CLASS}>
            Return to base
          </Link>
          {extraLinks.map((l) => (
            <Link key={l.label} to={l.to} params={l.params} className={SECONDARY_CLASS}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
