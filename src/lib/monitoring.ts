/** Opt-in Sentry: real-user Core Web Vitals plus error tracking, wired only
 *  when a DSN is present. Unset `VITE_SENTRY_DSN` and this module does
 *  nothing at all — no network call, no dependency code running — so the
 *  site keeps working with zero configuration. Called once, client-side
 *  only, from __root.tsx alongside the existing SpeedInsights mount.
 *
 *  No PII: `sendDefaultPii` is explicitly false (Sentry's own v11 default
 *  flipped this to true — see MIGRATION.md — so this has to be spelled out
 *  rather than relying on the default), and nothing here ever attaches a
 *  user id, email or IP to an event. */
export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    // Real-user Core Web Vitals sampling. 20% keeps the free-tier quota safe
    // on a portfolio site while still giving a representative RUM sample —
    // ponytail: fixed rate, revisit if traffic ever outgrows Sentry's quota.
    tracesSampleRate: 0.2,
  });
}
