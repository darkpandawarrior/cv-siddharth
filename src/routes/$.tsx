import { createFileRoute, notFound } from "@tanstack/react-router";
import { ErrorPanel } from "../ErrorPanel.tsx";

// Catch-all splat route (file name "$" is TanStack Router's file-based
// convention for a route matching any otherwise-unmatched path). It must
// `throw notFound()` from beforeLoad rather than just rendering a plain
// `component` — a route that resolves normally is a 200, and this repo's
// `vite preview` server falls through to the SSR router for ANY unresolved
// static asset (verified: /favicon.ico and /_vercel/speed-insights/script.js
// both hit this route locally, since neither exists on disk and there's no
// Vercel edge in front of `vite preview` to intercept them first). A plain
// 200 HTML response breaks the SpeedInsights <script> tag ("Unexpected
// token '<'" — the browser tries to execute the HTML body as JS). Throwing
// notFound() keeps the framework's real 404 status code (confirmed against
// the router's own pre-existing unmatched-route behavior) while still
// rendering our on-brand notFoundComponent instead of the generic default.
export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw notFound();
  },
  head: () => ({
    meta: [
      { title: "404 — Signal Lost | Siddharth Pandalai" },
      { name: "description", content: "This route doesn't exist. Head back to the signal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  const { _splat } = Route.useParams();
  return (
    <ErrorPanel
      code="404 // NO CARRIER"
      title="Signal lost"
      message={_splat ? `No route matches "/${_splat}".` : "That route doesn't exist."}
      extraLinks={[
        { label: "Mileway", to: "/project/$slug", params: { slug: "mileway" } },
        { label: "Résumé", to: "/resume" },
      ]}
    />
  );
}
