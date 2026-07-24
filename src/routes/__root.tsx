import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import "../index.css";
// Self-hosted fonts (replaces the old Google Fonts CDN <link>).
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/rozha-one/400.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import spaceGrotesk700 from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?url";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";

const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Siddharth Pandalai",
  url: "https://cv-siddharth.vercel.app/",
  jobTitle: "Senior Android Engineer",
  worksFor: { "@type": "Organization", name: "Dice.tech" },
  email: "mailto:siddharthpandalai990@gmail.com",
  alumniOf: "NIT Bhopal",
  address: { "@type": "PostalAddress", addressLocality: "Pune", addressCountry: "IN" },
  knowsAbout: ["Android", "Kotlin", "Kotlin Multiplatform", "Jetpack Compose", "Location Engineering", "Sensor Fusion", "Mobile Security", "Structured Concurrency"],
  sameAs: [
    "https://github.com/darkpandawarrior",
    "https://linkedin.com/in/siddharth-pandalai-3712b215a",
    "https://dev.to/darkpandawarrior",
    "https://medium.com/@darkpandawarrior",
    "https://darkpandawarrior.hashnode.dev",
    "https://booksbeforebros.wordpress.com",
  ],
};

const PROFILEPAGE_LD = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  name: "Siddharth Pandalai | Senior Android Engineer",
  url: "https://cv-siddharth.vercel.app/",
  mainEntity: { "@type": "Person", name: "Siddharth Pandalai" },
  isPartOf: {
    "@type": "WebSite",
    name: "sid.android",
    url: "https://cv-siddharth.vercel.app/",
  },
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Siddharth Pandalai | Senior Android Engineer" },
      { name: "description", content: "Senior Android Engineer. Platform owner at 50k MAU scale. GPS accuracy 50%→95%, 80% crash reduction, 92% Jetpack Compose. Ask my AI assistant anything." },
      { name: "author", content: "Siddharth Pandalai" },
      { name: "theme-color", content: "#0b0f0d" },
      { name: "color-scheme", content: "dark" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://cv-siddharth.vercel.app/" },
      { property: "og:site_name", content: "sid.android" },
      { property: "og:title", content: "Siddharth Pandalai | Senior Android Engineer" },
      { property: "og:description", content: "Interactive CV with an AI assistant. GPS accuracy 50%→95%, 80% crash reduction, 92% Jetpack Compose at 738k LOC." },
      { property: "og:image", content: "https://cv-siddharth.vercel.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Siddharth Pandalai | Senior Android Engineer" },
      { name: "twitter:description", content: "Interactive CV with an AI assistant, 3D storyboard and an infinite blueprint canvas. Android · Kotlin · KMP." },
      { name: "twitter:image", content: "https://cv-siddharth.vercel.app/og-image.png" },
    ],
    links: [
      { rel: "canonical", href: "https://cv-siddharth.vercel.app/" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "Agent-readable profile" },
      { rel: "icon", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230b0f0d'/%3E%3Ctext x='50' y='68' font-size='52' font-family='sans-serif' font-weight='bold' fill='%233ddc84' text-anchor='middle'%3ES%3C/text%3E%3C/svg%3E" },
      { rel: "preload", as: "font", type: "font/woff2", href: spaceGrotesk700, crossOrigin: "anonymous" },
      { rel: "preload", as: "font", type: "font/woff2", href: inter400, crossOrigin: "anonymous" },
    ],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(PERSON_LD) },
      { type: "application/ld+json", children: JSON.stringify(PROFILEPAGE_LD) },
    ],
  }),
  component: RootDocument,
});

// Real route paths this site owns. Any legacy `#hash` matching one of these
// (or `?project=<slug>`) is redirected to the real path; on-page section
// anchors (#work, #projects, #skills, #writing, #contact, #experience) are
// left alone so home-page scroll links keep working.
const HASH_ROUTES = new Set(["resume", "loopdown", "terminal", "blueprint", "compose", "playground", "lab", "map", "forge"]);

function HashCompat() {
  const router = useRouter();
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash.startsWith("project/")) {
        router.navigate({ to: "/project/$slug", params: { slug: hash.slice("project/".length) }, replace: true });
        return;
      }
      if (HASH_ROUTES.has(hash)) {
        router.navigate({ to: `/${hash}`, replace: true });
        return;
      }
      // LinkedIn Featured strips the #fragment but keeps ?project=<slug>.
      const project = new URLSearchParams(window.location.search).get("project");
      if (project) router.navigate({ to: "/project/$slug", params: { slug: project }, replace: true });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [router]);
  return null;
}

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <HashCompat />
        <Outlet />
        <SpeedInsights />
        <Scripts />
        <noscript>
          <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem", fontFamily: "system-ui", color: "#e8efe9" }}>
            <h1>Siddharth Pandalai — Senior Android Engineer</h1>
            <p>Platform owner of a 738k-LOC, 92%-Compose financial SaaS app serving 50,000+ monthly users. GPS accuracy 50%→95%, 80% crash reduction. Kotlin · Jetpack Compose · Kotlin Multiplatform.</p>
            <p>This portfolio is interactive and needs JavaScript. Text versions:</p>
            <ul>
              <li><a href="/llms.txt" style={{ color: "#3ddc84" }}>Profile summary (llms.txt)</a></li>
              <li><a href="/llms-full.txt" style={{ color: "#3ddc84" }}>Full profile (llms-full.txt)</a></li>
              <li><a href="https://github.com/darkpandawarrior" style={{ color: "#3ddc84" }}>GitHub</a></li>
              <li><a href="https://linkedin.com/in/siddharth-pandalai-3712b215a" style={{ color: "#3ddc84" }}>LinkedIn</a></li>
              <li><a href="mailto:siddharthpandalai990@gmail.com" style={{ color: "#3ddc84" }}>siddharthpandalai990@gmail.com</a></li>
            </ul>
          </main>
        </noscript>
      </body>
    </html>
  );
}
