// Extracted from __root.tsx (arch-L15) so src/lib/csp.ts can hash these
// two JSON-LD <script> tags' exact bytes without importing a JSX/React
// file into a plain-Node context (scripts/gen-csp.mjs, vite.config.ts).
//
// Load-bearing for THAT reason, not just tidiness: TanStack Start's
// `scripts` head entries never render into the server-sent HTML at all
// — the browser inserts them client-side on every route, including the
// ssr:false ones whose own SSR body has nothing else in it either. Since
// PERSON_LD/PROFILEPAGE_LD never change per request or per route, their
// hash is a fixed constant every response's script-src must always carry
// — not something a per-response body scan can discover on those routes.
import { currentRoles } from "./resumeMeta.ts";
import { profile, education, experience } from "../data/profile.ts";

// experience[0] — index 0 is whichever role was added most recently, and an
// index-based read silently demoted Dice.tech the day the consulting role
// landed above it. Shared with resume.tsx's own Person JSON-LD via
// resumeMeta.ts's currentRoles(), so this can never drift from that one.
export const currentRoleList = currentRoles(experience);

// The title, name and links a crawler reads, in one place. Nobody looking at
// the site would ever notice this block going stale, which is exactly why it
// derives from profile.ts instead of restating it — the linkedin URL here had
// already drifted from the one the résumé prints.
export const PAGE_TITLE = `${profile.name} | ${profile.title}`;

export const PERSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: profile.name,
  url: `${profile.portfolio}/`,
  jobTitle: profile.title,
  // schema.org takes an array here, but a one-element array is noisier for a
  // scraper that just reads the first value, so a single current role stays a
  // bare object and only a genuine second one makes it a list.
  worksFor:
    currentRoleList.length === 1
      ? { "@type": "Organization", name: currentRoleList[0].company }
      : currentRoleList.map((e) => ({ "@type": "Organization", name: e.company })),
  email: `mailto:${profile.email}`,
  alumniOf: { "@type": "CollegeOrUniversity", name: education.school },
  address: { "@type": "PostalAddress", addressLocality: "Pune", addressCountry: "IN" },
  // Hand-written, and staying that way: there is no list of these in
  // src/data/, and the writing platforms below are not in profile.ts either.
  knowsAbout: ["Android", "Kotlin", "Kotlin Multiplatform", "Jetpack Compose", "Location Engineering", "Dead Reckoning", "Kalman Filtering", "Mobile Security", "Structured Concurrency"],
  sameAs: [
    profile.github,
    profile.linkedin,
    "https://dev.to/darkpandawarrior",
    "https://medium.com/@siddharthpandalai990",
    "https://darkpandawarrior.hashnode.dev",
    "https://booksbeforebros.wordpress.com",
  ],
};

export const PROFILEPAGE_LD = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  name: PAGE_TITLE,
  url: `${profile.portfolio}/`,
  mainEntity: { "@type": "Person", name: profile.name },
  isPartOf: {
    "@type": "WebSite",
    name: "sid.android",
    url: `${profile.portfolio}/`,
  },
};
