
import { providerCount, upstreamStars } from "./hiresignal.ts";
import { repoStats } from "./repoStats.ts";
import { surfaces } from "./surfaces.ts";
import { fleetStats } from "./store.ts";
import { writing } from "./writing.ts";
import { cast, titleize } from "./writingMeta.ts";

export const profile = {
  name: "Siddharth Pandalai",
  title: "Senior Android Engineer",
  resumeTitle: "Senior Android Engineer, Mobile Architecture & Platform",
  tagline: "I take Android apps from prototype to platform.",
  location: "Pune, India",
  email: "siddharthpandalai990@gmail.com",
  phone: "+91 8848852062",
  github: "https://github.com/darkpandawarrior",
  linkedin: "https://linkedin.com/in/siddharth-pandalai",
  portfolio: "https://cv-siddharth.vercel.app",
  // No "available immediately" here. Dice.tech runs to Present on the same
  // page, and in this market a notice period is assumed — the two together
  // read as either hiding unemployment or not intending to serve notice.
  // Location and remote preference are the parts a recruiter can act on; put
  // a real notice period back only when there is a real number to state.
  availability: "Open to remote (worldwide / India) and hybrid in Pune / Bengaluru",
  // Same fact at a third of the width, for the one-pager header where a wrap
  // costs a whole line.
  availabilityShort: "Remote or Pune / Bengaluru",
  // Casual blurb shown on the portfolio homepage hero
  intro:
    "5+ years building production Android. I own the platform behind a ~964k-LOC financial SaaS app serving 50,000+ monthly users. I joined it with zero Kotlin in the codebase. ~87% of the UI layer is Compose today. Location accuracy, crash-free sessions, architecture a team can move fast in.",
  // One-pager summary. Same claims, a third of the lines — on a single page
  // every line the summary takes is a line the experience section loses, and
  // the experience section is what gets him called.
  summaryShort:
    "Senior Android Engineer, 5+ years in Kotlin. Technical owner and Product Owner of a ~964k-LOC, 50,000+ MAU financial SaaS app, inherited as Java, now ~87% Jetpack Compose on Clean Architecture, Coroutines, Flow and Hilt. Dead-reckoning location, Keystore security, 80% fewer crashes.",
  // Formal summary shown on the résumé view (ATS-friendly, keyword-dense)
  summary:
    "Senior Android Engineer, 5+ years in Kotlin. Technical owner and Product Owner of a ~964k-LOC, 50,000+ MAU financial SaaS app, inherited as Java with no Kotlin in it and now ~87% Jetpack Compose across the UI layer. Clean Architecture with MVVM/MVI, Coroutines and Flow, Hilt, Room. Hard-systems depth where it counts: staged dead-reckoning location with Kalman smoothing (GPS accuracy 50% to 95%), VAPT-grade on-device security (Android Keystore, SSL pinning), and an 80% production crash reduction at 22,000+ DAU won on the concurrency model, not defensive catches.",
};

export const education = {
  school: "NIT Bhopal (MANIT)",
  degree: "B.Tech, Computer Science & Engineering",
  period: "2017 - 2021",
};

export const metrics = [
  { value: "50k+", label: "monthly active users", detail: "22k+ daily, platform owner at Dice.tech" },
  { value: "95%", label: "GPS accuracy", detail: "up from 50%, by predictive dead reckoning" },
  { value: "80%", label: "crash reduction", detail: "Crashlytics + structured concurrency fixes" },
  { value: "~87%", label: "UI-layer Compose", detail: "455k of 523k UI-layer LOC, verified screen by screen against the legacy XML" },
];

// Key Results on the résumé. The homepage metric band is a hard 4-up grid with
// a parallel METRIC_TARGETS array, so the Play Store turnaround has no cell
// there — but it is one of the strongest numbers on the page and the résumé
// line has room, so it rides along here instead of distorting the grid.
export const resumeMetrics = [
  ...metrics,
  // ASCII only. `★` and `→` come from a fallback font, so Chromium emits them
  // as separate text runs and pdftotext pulls them out of order — this line
  // extracted as "1.6 / 4.5 / ★ Play Store rating", which is what an ATS reads.
  { value: "1.6 to 4.5 stars", label: "on the Play Store", detail: "67 to 27,300 reviews, via in-app review prompting" },
];

// Core competency chips — shown in the résumé header and on LinkedIn
export const competencies = [
  "Kotlin & Jetpack Compose",
  "Clean Architecture (MVVM / MVI)",
  "Kotlin Coroutines & Flow",
  "Hilt Dependency Injection",
  "Room (2 DBs, 24 production migrations)",
  // The one-pager's "Core:" line is this array verbatim, and it had no
  // networking token at all — Retrofit/REST is a hard filter on most Android
  // reqs. The longer cuts already carry it under Data & Networking.
  "Retrofit / OkHttp & REST APIs",
  "Location Engineering (Dead Reckoning, Kalman)",
  "Mobile Security (Android Keystore, SSL Pinning)",
  "CI/CD (Fastlane, Gradle)",
];

export interface ExperiencePoint {
  label?: string;
  text: string;
  /**
   * Smallest cut this bullet survives into:
   *   1  — the one-pager, and everything longer
   *   2  — the two-pager and the full record
   *   absent — the full record only
   * Nothing is ever deleted to make a shorter cut fit, so the full record
   * stays the complete, defensible version and the three can never disagree.
   */
  tier?: 1 | 2;
}

export interface Experience {
  company: string;
  role: string;
  period: string;
  points: ExperiencePoint[];
}

export const experience: Experience[] = [
  {
    company: "Neev Consulting",
    role: "Consulting Engineer, Platform & AI",
    period: "April 2026 - Present",
    points: [
      {
        label: "Agentic ERP",
        text: "Built the LLM assistant layer of an ERPNext/Frappe consulting ERP: business-context resolution, capability discovery, and an AI capability gate that defaults OFF with a test proving it. Models client to project to PO to milestone to GST invoice to payment end to end.",
        // Deliberately not tier 1. Four months of concurrent consulting reads as
        // a side engagement next to the Dice platform ownership, and on a single
        // page it was spending a heading plus four lines to say so. Dropping the
        // whole role off the one-pager bought back the leadership and security
        // bullets below, which is what a Lead loop actually asks about. Intact
        // on both longer cuts.
        tier: 2,
      },
      {
        label: "Platform",
        text: "Shipped the platform on Python and Frappe over MariaDB under Docker Compose, with a LibreChat deployment and MCP tool wiring for Atlassian and Playwright. Four repositories, all of it reviewed.",
        // Full record only. Promoting the leadership bullet above pushed the
        // two-pager 15px past its budget, and a second bullet about a
        // concurrent Python engagement is the cheapest thing on an Android
        // résumé to spend — the role still states itself on the two-pager.
      },
    ],
  },
  {
    company: "Dice.tech",
    role: "SDE-2, Android & Product Owner",
    period: "June 2023 - Present",
    points: [
      {
        label: "Platform Ownership",
        // "so requirements and delivery are one job rather than a handoff" was
        // the third statement of Product Owner on one page — the header title
        // and the summary already say it. Cut, and the line it was costing
        // went to the crash bullet the summary needed backing.
        // The Room migration count moved to the skills line: a schema-migration
        // number is a detail sitting inside a scope bullet, and it reads as
        // hard evidence either way while costing a line and a half less there.
        text: "Own the Android platform end to end, a ~964k-LOC Kotlin app serving 50,000+ MAU, as both technical owner and Product Owner. Set the module architecture, release process and review standards the team builds against.",
        tier: 1,
      },
      {
        label: "Scope",
        text: "Owned requirements as well as delivery on the same platform. Here they are one job, not a handoff. Sprint planning, feature and code allocation across the team, review, release, deployment, and the crash dashboard the morning after. The platform work is deliberately the kind other people build on: a new client ships without anyone writing UI code, nobody forks the app to brand it, and every release goes out through the pipeline.",
      },
      {
        label: "Team",
        // The one claim a Lead loop opens with, and the only one the summary
        // and Key Results don't already carry — full-record-only until the
        // concurrent consulting role came off the top of the one-pager.
        // "He now manages this app at the company that acquired it" is the
        // proof the mentoring took, but next to "own the Android platform end
        // to end" four lines above it reads as a contradiction — and it was the
        // last line the crash bullet needed. It survives on both longer cuts,
        // where the Scope bullet gives it the room to make sense.
        text: "Led interview loops and helped hire onto both the frontend and the React Native mobile teams; mentored a junior engineer from Flutter to production Kotlin, Java and React.",
        tier: 1,
      },
      {
        // Always renders directly under Team, so "that engineer" has its
        // referent. Untiered — full record only.
        label: "Mentorship Outcome",
        text: "That engineer now manages this app at the company that acquired it.",
      },
      {
        label: "Compose Migration",
        // "checked screen by screen ... so nothing regressed" was a paraphrase
        // of "zero regressions" written to slip past the claim-audit regex that // claim-audit:allow
        // forbids exactly that phrase — Dice has 31 unit-test files, 4
        // androidTest and ZERO Compose UI tests, so there is no safety net to
        // claim. This is the wording claims.json itself prescribes, and it says
        // the mechanism instead of promising an outcome nothing measured.
        text: "Led the migration off legacy Java and XML: ~87% of the UI layer is now Compose, migrated incrementally through interop with per-screen parity checks against the legacy XML baseline.",
        tier: 1,
      },
      {
        label: "Location Engineering",
        text: "Own the GPS pipeline behind a location-type foreground service for 22,000+ DAU: staged dead reckoning over GPS/IMU with a 1D Kalman smoother and spike rejection so implausible jumps never reach the buffer, taking tracking accuracy from 50% to 95%.",
        tier: 1,
      },
      {
        label: "Crash Reduction",
        // The short summary asserts "80% fewer crashes" and, until this was
        // promoted, nothing on the one-pager evidenced it — the strongest
        // number on the page was a claim with no body behind it.
        text: "Reduced production crashes 80% at 22,000+ daily users. The fix was the concurrency and threading model, not defensive try/catch. Crashlytics and Sentry catch regressions before users report them.",
        tier: 1,
      },
      {
        label: "Security Hardening",
        text: "Hardened the app to VAPT/banking compliance: AES-256 Android Keystore field-level encryption, a biometric access gate, and SSL pinning across 9 domains (5 SHA-256 pins) via build flavors.",
        // The summary says "VAPT-grade security" and nothing else on the short
        // cut backed it. These are the numbers that turn that phrase into a
        // checkable claim, and they fit in the space the consulting role left.
        tier: 1,
      },
      {
        label: "Data Layer",
        text: "Own the Room persistence layer across two databases with 24 verified production schema migrations.",
      },
      {
        label: "Product Growth",
        text: "Built the in-app review prompting that moved the Play Store listing from 1.6★ across 67 reviews to 4.5★ across 27,300, the rating a prospective customer sees before they install anything.",
      },
      {
        label: "Travel Platform",
        text: "Shipped the Android side of Trip V2: Itinerary V2, GIN screens, and full Mixpanel instrumentation.",
      },
      {
        label: "UI Platform",
        text: "Built the multi-tenant theme platform: a server-supplied tenant seed colour resolves into a full Material 3 scheme at runtime (MaterialKolor), with the client owning dark mode, user colour override, palette style, Material You and variant, cutting UI development friction 60% without touching feature code per client.",
        tier: 2,
      },
      {
        label: "CI/CD & Automation",
        text: "Own the build platform: automated Fastlane build, signing and release pipelines, and drove the AGP 9 upgrade across the whole app, and wired agent tooling into the build itself (Firebender over MCP).",
      },
    ],
  },
  {
    company: "Jugnoo / Tookan / Jungleworks",
    role: "Software Engineer, Android & Vertical Owner",
    period: "January 2021 - May 2023",
    points: [
      {
        label: "Multi-Tenant Platform Ownership",
        text: "Owned Android across a multi-vertical super-app (ride-hailing, carpool, delivery, grocery, bike and car rental, shuttle and wallet) spanning customer, driver and merchant apps. Joined a nine-year-old codebase seven years in, and became one of its primary maintainers.",
        tier: 2,
      },
      {
        label: "White-Label Platform, Productising Variation",
        // Dropped "instead of the per-client fork that would have been
        // unmaintainable within a year" — it argues for the decision rather
        // than reporting it, and the line bought the crash bullet its space.
        text: "Built a per-tenant flavour system (build config, resource overlays, isolated storage and branding) so 150+ clients ship from one codebase across the customer and driver apps, rather than a fork per client. Cut per-client delivery time 80%.",
        tier: 1,
      },
      {
        label: "Product-Line Ownership",
        text: "Owned both the requirements and the implementation for the P2P carpool, trucking, e-bike and super-app verticals, writing the specs I then had to build.",
        tier: 1,
      },
      {
        label: "Payments at Scale",
        text: "Implemented Razorpay, Stripe, Beyonic and HyperPay gateway integrations across checkout flows; built Stripe 3DS payment retry/recovery handling and a corporate-account KYC verification flow from scratch.",
        tier: 2,
      },
      {
        label: "Platform Modernization",
        text: "Migrated the toolchain across a multi-branch, multi-client codebase: Kotlin plugin and Gradle 7.0 migrations, ViewBinding adoption, and Android 13 (API 33) compliance, without breaking any of the 150+ client builds riding on it.",
      },
      {
        label: "Cross-Functional Engineering",
        text: "Collaborated cross-team on roadmaps with product and backend, cutting engineering overhead 40%.",
      },
    ],
  },
  {
    company: "John Deere India",
    role: "GET Intern",
    period: "May 2020 - July 2020",
    points: [
      // Deliberately not `core`: a 2020 college internship earns nothing on a
      // senior résumé, and cutting it drops the whole role — which is what
      // finally bought the short cut its second page back. It creates no gap
      // (Jugnoo starts Jan 2021) and it survives intact on the full cut.
      { text: "Built a proof of concept integrating social-media sentiment analysis into financial lending systems to enhance credit-risk modeling." },
    ],
  },
];

export interface CaseStudy {
  slug: string;
  title: string;
  metric: string;
  summary: string;
  problem: string;
  approach: string[];
  outcome: string;
  tags: string[];
}

export const caseStudies: CaseStudy[] = [
  {
    slug: "doori",
    title: "Doori: offline-first mileage tracker (Android · iOS · Wear OS · watchOS · Desktop)",
    metric: "46 modules · 5 platforms · offline AI",
    summary:
      "An open-source app I designed and built end-to-end: mileage, travel & expense tracking that runs entirely offline across Android, iOS, Wear OS, watchOS and Compose Desktop from one shared Kotlin codebase. Offline-first on Room + DataStore, with a real Kotlin/Ktor backend built and tested, off by default, so the whole thing stays reproducible and reviewable by anyone.",
    problem:
      "I wanted a clean, inspectable reference for the architecture I advocate for at scale: Compose Multiplatform, strict module isolation, MVI state, a real location engine and a real policy/reimbursement layer. Built offline-first, with the real backend opt-in, so the whole thing stays reproducible and reviewable by anyone.",
    approach: [
      "46-module clean architecture: 13 feature modules that never depend on each other, meeting only at the :app composition root, wired with Koin.",
      "Shared commonMain core: design system, Room (KMP) + DataStore, and every check-in / hardware-event screen. It drives Android, iOS, Wear OS, a watchOS SwiftUI app and a Compose Desktop window from one snapshot model.",
      "A location engine that treats GPS as a noisy signal: jitter suppression, spike detection, a four-bucket distance accumulator, IMU (accelerometer) fusion and device-tier-adaptive sampling, with a deterministic simulated-drive source so the whole engine is unit-testable without hardware.",
      "A policy engine that computes reimbursement from configurable per-vehicle rate rules and flags policy violations on approvals. The real logic a live expense platform needs, all local.",
      "A durable submit-outbox: a track/voucher submission is journaled locally and reconciled deterministically, so a kill mid-submit never loses or double-counts a record. The repository already looks one implementation-swap away from a real API.",
      "An on-device AI assistant: retrieval-grounded chat over real local trip/expense/card data, Room-backed history with 5-minute session resume, chunked streaming and on-device speech I/O. No remote LLM, no server.",
      "A super-profile & plugin-composition platform (V24, shipped, with a V25→V37 series landed on top spanning on-device intelligence, JWT auth, closeout hardening, home-screen cards/advances and a What's New feature): a single plugin registry drives four persona presets (Corporate Commuter, Super-App Consumer, Gig Driver, Minimal Guest) that reshape hubs, auth flows and tracking behaviour from one account, plus act-on-behalf session delegation, a verification centre, growth/membership surfaces and wallet/payout identity. Every tile, capability and tunable value gates through that registry, resolved by layering FORCED > USER > PRESET > DEFAULT.",
      "Dual gms / noGms distribution (Google Play + F-Droid) with a dependency-guard that fails the build if proprietary libraries leak into the FOSS flavor; quality gated by 159 Roborazzi JVM screenshot tests (no emulator, no network), Napier logging, detekt, ktlint, Kover and CI.",
    ],
    outcome:
      "All five targets build, run and pass every quality gate from one shared Kotlin codebase, with a real location engine, a policy/reimbursement layer, a durable submit-outbox, a persona-driven plugin-composition platform and an on-device AI assistant layered on the offline data model. Explore the app, architecture diagrams and all rendered screens at github.com/darkpandawarrior/Doori.",
    tags: ["Kotlin Multiplatform", "Compose Multiplatform", "Android · iOS · Wear OS · watchOS · Desktop", "46 modules", "Offline AI", "Open source"],
  },
  {
    slug: "gps-accuracy",
    title: "Predictive dead reckoning for billing-grade mileage",
    metric: "50% → 95%",
    summary: "Predictive dead reckoning for a mileage-tracking app whose raw GPS was wrong half the time.",
    problem:
      "Field users' trip distances were off by large margins from urban canyons, tunnels, and OEM-throttled location updates.",
    approach: [
      "Ran staged dead reckoning over the GPS/IMU fix stream, smoothed by a separate 1D Kalman filter to estimate position between fixes.",
      "Rejected physically impossible fixes with spike detection, plus gap-filling for weak signal.",
      "Ran a foreground service with a floating bubble UI to survive OEM battery restrictions.",
    ],
    outcome: "Staged dead reckoning plus Kalman smoothing made mileage reliable enough to bill expense reimbursement against.",
    tags: ["Location", "Dead reckoning", "Kalman filtering", "Foreground services"],
  },
  {
    slug: "crash-reduction",
    title: "Systematic crash triage at 50k-MAU scale",
    metric: "-80% crashes",
    summary: "Systematic triage with Crashlytics turned a noisy crash feed into a fixable backlog.",
    problem:
      "A fast-growing ~964k-LOC app had a crash rate hurting its Play Store rating, driven by untraceable threading bugs.",
    approach: [
      "Clustered crashes to collapse dozens of stack traces into a handful of root bugs.",
      "Reconstructed the user journey before each crash with structured breadcrumb instrumentation.",
      "Hunted concurrency bugs: main-thread violations, coroutine race conditions, lifecycle leaks.",
    ],
    outcome: "At 22k DAU the Play Store listing went 1.6★/67 reviews to 4.5★/27.3K, closing 85% of the gap to a perfect 5.0, +181% rating, 407x review volume.",
    tags: ["Crashlytics", "Structured concurrency", "Coroutines"],
  },
  {
    slug: "compose-migration",
    title: "The theme platform behind a ~964k-LOC Compose migration",
    metric: "~87% UI-layer Compose",
    summary: "Migrated a ~964k-LOC app to Jetpack Compose verified per-screen against the legacy XML baseline and built a theme engine the whole team ships on.",
    problem:
      "XML views made UI changes slow and inconsistent, and design's theming requests meant touching dozens of files.",
    approach: [
      "Migrated incrementally via interop, keeping Expenses, Travel, and Invoices shipping throughout.",
      "Standardized on a single immutable UiState per screen with StateFlow and MVI.",
      "Built a Dynamic Theme Engine on CompositionLocal: a server-supplied tenant seed colour resolves into a full Material 3 scheme at runtime (MaterialKolor), with the client owning dark mode, user colour override, palette style, Material You and variant.",
    ],
    outcome: "Reached ~87% UI-layer Compose coverage (455k of 523k LOC) verified per-screen against the legacy XML baseline; UI development friction dropped 60%.",
    tags: ["Jetpack Compose", "MVI", "Design systems"],
  },
  {
    slug: "white-label",
    title: "Configuration-driven pipeline for multi-tenant Android",
    metric: "858 branches · 80% faster delivery",
    summary: "A configuration-driven pipeline that turned weeks of per-client Android work into days, at a scale where per-client forks were the constraint.",
    problem:
      "Every new white-label client meant manually forking, rebranding, and re-releasing the app: weeks of error-prone work, and the constraint that mattered was not building the feature once. It was doing that without forking the codebase per tenant.",
    approach: [
      "Built configuration-driven theming and feature flags so one codebase served every client.",
      "Automated per-client signing, asset generation, and Play Store packaging end-to-end.",
      "Unified brand tokens and vertical-specific flows into a single reusable app template.",
    ],
    outcome: "858 white-label-named branches across two Android repos carry my commits (459 autos, 399 driver, a subset of the 1,179 total) spanning 150+ client codebases, with delivery time cut 80% versus manual per-client builds.",
    tags: ["Build systems", "Multi-tenant", "Automation"],
  },
];

export const languages = ["Kotlin", "Java", "Dart", "C++"];

// 4-group layout for portfolio homepage skill cards
export const skills: { group: string; items: string[] }[] = [
  {
    group: "UI & Architecture",
    items: ["Jetpack Compose + Material 3", "MVVM + Clean Architecture", "MVI / single UiState", "Modular architecture", "Repository pattern", "Kotlin/Compose Multiplatform", "Dynamic theme engines"],
  },
  {
    group: "Concurrency & Data",
    items: ["Kotlin Coroutines", "Flow / StateFlow / SharedFlow", "Room (SQLite, 24 migrations · 2 DBs)", "DataStore + WorkManager", "Retrofit + OkHttp (REST APIs)"],
  },
  {
    group: "Platform & Systems",
    items: ["Android SDK", "Location engineering (dead reckoning + Kalman)", "Foreground services", "Hilt / Dagger (dependency injection)", "Firebase Crashlytics + Sentry + Mixpanel"],
  },
  {
    // Every item here is evidenced in the experience bullets and verified by
    // claim-audit: mentoring and hiring loops at Dice, cross-team roadmap work
    // at Jugnoo, the review standards he sets, and the sprint planning he runs
    // as Product Owner. They are named here because the bullets carrying them
    // live on the full record only, and a recruiter searching "mentoring" or
    // "code review" should still find him on the shorter cuts.
    group: "Leadership & Process",
    items: ["Cross-functional collaboration", "Mentoring & hiring loops", "Code review standards", "Agile sprint planning"],
  },
  {
    group: "Security & Ops",
    items: ["Android Keystore field-level encryption (AES-256)", "SSL pinning (9 domains, 5 SHA-256 pins)", "BiometricPrompt access gate", "EncryptedSharedPreferences / DataStore + Tink", "Fastlane CI/CD · AGP 9 · Gradle KTS · Git", "Agentic workflows (Firebender, MCP)"],
  },
];

// Granular 7-group layout for the résumé view — matches PDF structure for ATS coverage
export const resumeSkills: { group: string; items: string[] }[] = [
  {
    group: "UI",
    items: ["Jetpack Compose (~87% of UI-layer code)", "Material 3", "Compose-View interop", "Compose Multiplatform"],
  },
  {
    group: "Architecture",
    items: ["Clean Architecture", "MVVM", "MVI", "Modular architecture", "Repository pattern", "Kotlin Multiplatform (KMP, building depth)"],
  },
  {
    group: "Concurrency & DI",
    items: ["Kotlin Coroutines", "Flow", "StateFlow / SharedFlow", "Structured concurrency", "Hilt", "Dagger"],
  },
  {
    group: "Data & Networking",
    items: ["Room (SQLite, 24 schema migrations across 2 databases)", "DataStore", "Retrofit", "OkHttp", "Ktor", "REST APIs"],
  },
  {
    group: "Platform",
    items: ["Android SDK", "WorkManager", "Foreground Services", "Location / dead reckoning + Kalman filtering", "Firebase Crashlytics + Sentry", "Mixpanel"],
  },
  {
    group: "Security",
    items: ["Android Keystore (AES-256)", "SSL pinning", "BiometricPrompt", "EncryptedSharedPreferences", "VAPT compliance"],
  },
  {
    group: "Leadership & Process",
    items: ["Cross-functional collaboration", "Mentoring & hiring loops", "Code review standards", "Agile sprint planning"],
  },
  {
    group: "Build, CI/CD & Tools",
    items: ["Gradle (Kotlin DSL)", "AGP 9", "Fastlane", "Git", "Play Store release management", "Android Studio", "Jira", "Figma", "Postman", "Firebender + MCP agentic workflows"],
  },
];

// ── Projects & open source ────────────────────────────────────────────────
// Single source of truth for everything I've built outside employer work.
// Rendered on the homepage + résumé and fed to Panda, the chat assistant.
export interface ProjectDetailSection {
  heading: string;
  body: string;
}

export interface ProjectVideo {
  src: string;
  caption: string;
}

export interface ProjectDetailData {
  overview: string;
  sections: ProjectDetailSection[];
  videos?: ProjectVideo[];
  metrics?: { value: string; label: string }[];
  techStack?: { group: string; items: string[] }[];
  extraLinks?: { label: string; url: string }[];
  // Mermaid diagram sources, rendered (dark-themed) on the detail page.
  diagrams?: { title: string; code: string }[];
  // Optional roster (e.g. Gaddi's six roles), rendered as a colour-coded grid.
  roles?: { name: string; power: string; color: string }[];
}

// One codebase, N surfaces — the multiplatform thesis, made data-driven.
// deviceFrame picks which chrome DeviceWall renders the screens in; liveUrl
// (Web only) embeds the deployed build live instead of showing screenshots.
export interface ProjectTarget {
  platform: "Android" | "iOS" | "Wear OS" | "watchOS" | "Desktop" | "Web";
  // "widget" = a bezel-less card for wide-short widget/Live-Activity
  // captures — never stuff those into a phone bezel, they aren't full
  // device screens.
  deviceFrame: "phone" | "watch" | "desktop" | "browser" | "widget";
  screens: string[]; // filenames under public/projects/<slug>/screenshots/
  liveUrl?: string;
  note?: string; // shown under the frame — e.g. "same Compose UI, Android capture shown"
}

export interface Project {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  stack: string[];
  highlights: string[];
  links: { label: string; url: string }[];
  status: string;
  // Where this project is actually installable right now, as opposed to where
  // its source lives. Every entry is checkable: a repo proves it was written,
  // a listing proves it ships.
  deployments?: { channel: string; detail: string; url?: string }[];
  badges: string[];
  // Optional deep-dive page at /#project/<slug>. Screenshots come from the
  // auto-generated galleries.ts (public/projects/<slug>/screenshots/).
  detail?: ProjectDetailData;
  // Optional device-wall target switcher on the detail page — "one codebase,
  // N surfaces" shown per-platform with the right device chrome.
  targets?: ProjectTarget[];
  // Optional curated, captioned screenshot set (filenames under
  // public/projects/<slug>/screenshots/). If present, the carousel uses this
  // instead of the full auto-generated gallery.
  screens?: { file: string; caption: string }[];
  // Optional per-project palette — overrides the site accent on this project's
  // detail page (e.g. Gaddi's teak/brass/cream "License Raj Deco" identity).
  theme?: {
    accent: string;
    accentDim: string;
    ink?: string;
    surface?: string;
    card?: string;
    line?: string;
    displayFont?: string;
  };
  // Optional brand icon (public/projects/<slug>/brand/*.svg) — swapped into the
  // browser tab favicon while viewing this project's detail page.
  icon?: string;
  /**
   * Smallest cut that writes this project up in prose, same scale as
   * ExperiencePoint.tier. Anything below the bar still ships — it collapses
   * into one linked line, because a recruiter reading a side project's prose
   * is a recruiter not reading the employment history. On the one-pager that
   * is every project; the full record writes up all of them.
   */
  tier?: 1 | 2;
}

/* Re-exported so the résumé and the repo showcase keep reading upstream facts
 * from profile.ts, the one import path they already use for `upstreamMergedPRs`.
 * See hiresignal.ts for why the declaration cannot live in this file. */
export { providerCount, upstreamStars };

/* ── The Loopdown, counted rather than remembered ─────────────────────────
 *
 * writing.ts is regenerated from the-loopdown on every prebuild, and the case
 * study below used to restate its contents in hand-typed prose: seventeen
 * lessons, eight series, a ten-piece archive, which series ran longest, which
 * pillar carried the most, which lesson had actually been published. Every one
 * of those is a query over data this file already imports, and every one of
 * them was a number somebody had to remember to change.
 *
 * Rank claims are derived too, not just counts. "Sensors Who Lie runs longest"
 * is as capable of going stale as "5 episodes", and rather more embarrassing,
 * because it reads as editorial judgement instead of arithmetic.
 */
const lessons = writing.lessons;
const seriesByLength = [...writing.series].sort((a, b) => b.episodes - a.episodes);
const lessonsByPillar = Object.entries(
  lessons.reduce<Record<string, number>>((acc, l) => {
    const key = l.pillar ?? "other";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {}),
).sort((a, b) => b[1] - a[1]);
const published = lessons.filter((l) => l.status === "published");
const archiveByForm = writing.archive.reduce<Record<string, number>>((acc, a) => {
  const key = a.form ?? "other";
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
// The recurring cast, most-appeared first — same derive-don't-type-it
// discipline as the series/pillar ranks above.
const castByAppearances = [...cast].sort((a, b) => b.appearances - a.appearances);

export const projects: Project[] = [
  {
    slug: "gaddi",
    name: "Gaddi",
    tagline: "A Hinglish social-deduction bluffing game of power, satire & second chances. Gaddi ke liye kuch bhi karega.",
    description:
      "Deterministic Kotlin Multiplatform social-deduction game with ISMCTS bot AI, shipped across Android, iOS, Desktop, and Web.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Android", "iOS", "Desktop", "Web (Wasm)"],
    highlights: [
      "Pure (GameState, Intent) → GameState reducer drives the AI, UI, and a future server.",
      "ISMCTS AI with 10 bot personas plus a DARBAR social layer for bluffing and alliances.",
    ],
    links: [{ label: "GitHub", url: "https://github.com/darkpandawarrior/Gaddi" }],
    // 14, not 13: Gaddi gained a `:cli` module on 2026-08-26 ("headless client
    // proving :engine is a real SDK"), and this hand-written line went stale
    // the moment it landed. gen-project-stats.mjs counts the repo's own
    // settings.gradle.kts, so `repoStatLine` was already printing 14 directly
    // under this 13 on the same card.
    status: "14 modules · 4 platforms · 10 bot personas",
    deployments: [
      {
        channel: "F-Droid",
        detail:
          "Live in a self-hosted repository. 16.5 MB, signed, with no Google Play Services and no Firebase in the build.",
        url: "https://darkpandawarrior.github.io/fdroid/repo",
      },
      {
        channel: "GitHub Releases",
        detail: "Signed APK per tag, plus desktop and web builds.",
        url: "https://github.com/darkpandawarrior/Gaddi/releases",
      },
      {
        channel: "Headless CLI",
        detail:
          "The engine runs with no UI at all. ./gradlew :cli:run simulates 500 games and reports per-seat win rates.",
      },
    ],
    badges: ["Kotlin Multiplatform", "Game engine", "ISMCTS AI"],
    theme: {
      accent: "#E8C874",
      accentDim: "#C99A3B",
      ink: "#1E1008",
      surface: "#291a12",
      card: "#33241c",
      line: "#4a3724",
      displayFont: "'Rozha One', Georgia, serif",
    },
    icon: "/projects/gaddi/brand/kursi-icon.svg",
    targets: [
      {
        platform: "Android",
        deviceFrame: "phone",
        screens: ["home_phone.png", "4p_focus_phone.png", "setup_phone.png", "darbar_table_phone.png", "gazette_roles_phone.png", "results_phone.png"],
        note: "Rendered at phone dimensions from the shared Compose UI.",
      },
      {
        platform: "iOS",
        deviceFrame: "phone",
        screens: ["4p_coach_action_phone.png", "tutorial_coup_phone.png", "career_phone.png", "settings_phone.png"],
        note: "Compose Multiplatform renders pixel-identical UI on iOS. The same composables at phone size.",
      },
      {
        platform: "Desktop",
        deviceFrame: "desktop",
        screens: ["review_replay.png", "home_ranked.png"],
        note: "Same engine, windowed. Compose Desktop (JVM) build.",
      },
      {
        platform: "Web",
        deviceFrame: "browser",
        screens: ["home.png"],
        liveUrl: "/kursi-app/index.html",
        note: "Live: the real Compose/Wasm build, playable right here. One codebase, running in your browser.",
      },
    ],
    detail: {
      overview:
        "Gaddi is a Hinglish social-deduction bluffing game set in a satirical India corporate-political underworld where six archetypes scheme for an empty chair, the Gaddi, and everyone is lying about what they hold. The Neta makes promises he'll forget tomorrow, the Bhai owns silence, the Babu approves nothing, the Jugaadu knows a shortcut, the Vakil has read every exception. Satire targets the archetype, never the person. Under the deadpan Hinglish voice (\"सब मिले हुए हैं\") sits a serious engineering exercise: one deterministic Kotlin engine that runs identically on Android, iOS, desktop and the web, and powers the AI, the UI and a server-authoritative backend from the same code.",
      sections: [
        {
          heading: "Deterministic engine",
          body: "The whole game is a pure function: (GameState, Intent) → GameState, with the RNG seed living inside the state. The same module drives single-player, the bots and a future server. Any match can be replayed byte-for-byte from its seed and intent log.",
        },
        {
          heading: "Same game, three depths (launch overhaul)",
          body: "The board reveals itself in three density layers so a first-timer isn't handed an expert's dashboard. FOCUS shows only whose turn it is, one plain-language line of what just happened, your hand and your legal moves; GUIDED adds gentle coaching; ANALYST is the full instrument panel (suspicion pips, odds, teleprinter log). Players graduate FOCUS → GUIDED → ANALYST by playing. Paired with a tap-to-continue beat gate so the round never resolves faster than you can read it, and a tutorial-first onboarding funnel that teaches one mechanic at a time.",
        },
        {
          heading: "AI Munshi narrator",
          body: "A diegetic court-scribe turns raw engine events into one calm in-character line, grounded strictly on the redacted PlayerView so it narrates the beat without ever leaking a hidden card or inventing the board. It renders the deterministic templated line instantly and upgrades in place if an LLM is available (on-device Gemini Nano / Apple FoundationModels / BYOK cloud), never enters the intent log, and leaves byte-for-byte replay untouched.",
        },
        {
          heading: "ISMCTS expert AI + DARBAR social layer",
          body: "Bots use Information Set Monte Carlo Tree Search (1.5k-16k iterations depending on difficulty tier) with an optional cloud-LLM upgrade (Anthropic / OpenAI / Gemini). Built on kmp-toolkit's own generic bots-policy shell (Policy/GameRules/Ismcts/SearchBudget, zero deps), not a bespoke search implementation. Ten personas each have a personality profile driving targeting and bluff frequency. The DARBAR layer lets bots form alliances, hold grudges and trade Hinglish table-talk across four story arcs. Social manipulation that never breaks engine determinism.",
        },
        {
          heading: "Secrecy boundary",
          body: "A hidden-information game needs strict secrecy: redact(state, viewer) → PlayerView guarantees a client only ever sees what its player should. Two independent narrative RNG streams keep flavour separate from game logic.",
        },
        {
          heading: "“Sarkari Noir” visual system",
          body: "A bespoke lamplit visual language: teak/brass/cream palette, Rozha One display type, Canvas-drawn intaglio role glyphs and stamped-instrument motifs. The launch overhaul pushed it to an AAA bar: every screen dissolved from bordered boxes into one continuous lit table (depth via shadow, never outline), a shared component vocabulary, and an AGSL/Skia runtime-shader material layer (film grain + warm bloom on the felt) with a graceful no-shader fallback. All behind a full Fastlane + CI pipeline with headless screenshot rendering.",
        },
        {
          heading: "Game modes",
          body: "New Game (1v1-1v9, Easy→Grandmaster), a KISSA story campaign, GAUNTLET (Tarakki ki Seedhi, a 5-rung ladder ending in 6-player Grandmaster), TAMASHA (spectate ten AI personas scheme and betray), Team Khel (faction play with un-targetable allies), a Tutorial you can't leave until you catch a bluff, local pass-and-play with a handoff screen guard, and online + LAN multiplayer.",
        },
        {
          heading: "DARBAR: four live story arcs",
          body: "Four narrative arcs run at once, fuelled or suppressed by your chat suggestions: GATHBANDHAN (a quiet coalition, watch who breaks first), AFWAAH (a rumour the table acts on even when false), STING (a leaked claim that forces a read), and BADLA (a vendetta that outlives the round). They run on a separate deterministic narrative RNG that never touches card state and resumes byte-for-byte.",
        },
        {
          heading: "Built for everyone",
          body: "All six roles use the Okabe-Ito colourblind-safe palette plus a unique engraved bezel pattern (ring, hatch, dots, weave, double-rule, ticks) so identity reads without colour. Reduced-motion mode swaps every beat for a bespoke static end-frame (GHOTALA = held stamp, SUPARI = tipped chair). Accessibility never flattens the narrative.",
        },
        {
          heading: "Provider-agnostic AI",
          body: "An AiProvider interface abstracts Anthropic, OpenAI, Gemini, on-device Gemini Nano (Android) and Apple FoundationModels (iOS 26); ISMCTS is the always-available offline fallback. Bring-your-own-key, stored in each platform's encrypted storage.",
        },
        {
          heading: "Server-authoritative online",
          body: "Online and LAN play (private room codes, quick-match, Bonjour/mDNS discovery) run on a Ktor/Netty server that holds all state; clients receive only their redacted PlayerView, so another player's face-down roles can't appear on the wire by construction.",
        },
        {
          heading: "Seven toggle variants",
          body: "Seven additive rule variants (Bail Pe Bahar, Bali Khel, Hawala, Adhyadesh, Khazana Raj, Mehengai, Tangi) combine freely and default off. The engine is byte-for-byte unchanged when they're disabled, expanding the surface without touching core logic.",
        },
      ],
      roles: [
        { name: "Netaji Vachan", power: "The Politician: Tax +3 (GHOTALA); blocks Foreign Aid", color: "#0072B2" },
        { name: "Bhai Teja", power: "The Don: Assassinate −3 (SUPARI); unblockable except by the Vakil", color: "#D55E00" },
        { name: "Babu Filewala", power: "The Bureaucrat: Steal 2 (VASOOLI); blocks Steal", color: "#E69F00" },
        { name: "Jugaadu Chhotu", power: "The Fixer: Exchange cards (SETTING); blocks Steal", color: "#56B4E9" },
        { name: "Vakil Loophole", power: "The Lawyer: no action; blocks Assassinate only (power through procedure)", color: "#CC79A7" },
        { name: "Patrakaar", power: "The Journalist: Investigate a card (JAANCH); unblockable", color: "#009E73" },
      ],
      metrics: [
        { value: "4", label: "platforms · one engine" },
        { value: "10", label: "AI bot personas" },
        { value: "6", label: "roles · 4 story arcs" },
        { value: "7", label: "toggle rule variants" },
      ],
      techStack: [
        { group: "Language & UI", items: ["Kotlin 2.4.20-Beta1", "Compose Multiplatform 1.12", "Canvas + AGSL/Skia runtime shaders"] },
        { group: "Engine", items: ["Deterministic (GameState, Intent) → GameState", "RNG-in-state", "replay from (seed, intentLog)"] },
        { group: "AI", items: ["ISMCTS (offline)", "Anthropic / OpenAI / Gemini", "on-device Gemini Nano · Apple FoundationModels", "BYOK (encrypted)"] },
        { group: "Online", items: ["Ktor / Netty server", "server-authoritative", "Bonjour/mDNS LAN"] },
        { group: "Platforms", items: ["Android", "iOS (arm64)", "Desktop (JVM)", "Web (Wasm)"] },
        { group: "Build & quality", items: ["Koin", "Fastlane", "CI"] },
      ],
      extraLinks: [
        { label: "README (full rules)", url: "https://github.com/darkpandawarrior/Gaddi#readme" },
      ],
      diagrams: [
        {
          title: "Deterministic engine: one pure function",
          code: `graph LR
  s["GameState"] -->|"+ Intent"| r["reduce()<br/>pure · RNG in state"] --> s2["GameState'"]
  s2 -.->|"byte-for-byte replay"| s`,
        },
        {
          title: "Secrecy boundary: redact per viewer",
          code: `graph TD
  full["Full GameState<br/>(authoritative)"] -->|"redact(state, viewer)"| pv1["PlayerView, seat 1"]
  full -->|"redact(state, viewer)"| pv2["PlayerView, seat 2"]
  full -->|"redact(state, viewer)"| pv3["PlayerView, seat N"]`,
        },
      ],
    },
    screens: [
      { file: "home.gif", caption: "Home: live flow" },
      { file: "onboarding.gif", caption: "Onboarding: live flow" },
      { file: "modes.gif", caption: "Game modes: live flow" },
      { file: "turn.gif", caption: "A turn: claim, block, challenge" },
      { file: "darbar.gif", caption: "DARBAR arc: live flow" },
      { file: "coach.gif", caption: "AI coach: live flow" },
      { file: "online.gif", caption: "Online & LAN: live flow" },
      { file: "table_sizes.gif", caption: "Table sizes: 2p to 10p" },
      { file: "career.gif", caption: "Career: live flow" },
      { file: "reference.gif", caption: "In-game reference: live flow" },
      { file: "home.png", caption: "Home: mode grid" },
      { file: "home_ranked.png", caption: "Ranked & daily challenge" },
      { file: "home_mode_gauntlet.png", caption: "Gauntlet mode" },
      { file: "home_mode_story.png", caption: "KISSA story campaign" },
      { file: "setup.png", caption: "Game setup: players" },
      { file: "setup_teams.png", caption: "Team mode setup" },
      { file: "profile_setup.png", caption: "Profile setup" },
      { file: "tutorial_intro.png", caption: "Interactive tutorial" },
      { file: "gazette_roles.png", caption: "Niyam Gazette: the roles" },
      { file: "4p_pick_action.png", caption: "Your turn: pick an action" },
      { file: "4p_confirm.png", caption: "Declare, then confirm" },
      { file: "4p_reaction_block.png", caption: "Block: with odds" },
      { file: "4p_exchange.png", caption: "Card exchange on loss" },
      { file: "4p_pick_target.png", caption: "Target selection" },
      { file: "darbar_table.png", caption: "DARBAR arc at the table" },
      { file: "4p_coach_action.png", caption: "AI coach: suggested action" },
      { file: "4p_coach_reaction.png", caption: "AI coach: reaction" },
      { file: "4p_game_over.png", caption: "Game over: winner revealed" },
      { file: "results.png", caption: "Match results" },
      { file: "review_replay.png", caption: "Byte-for-byte replay" },
      { file: "leaderboard.png", caption: "ELO leaderboard" },
      { file: "career.png", caption: "Career overview" },
    ],
  },
  {
    slug: "doori",
    tier: 2,
    name: "Doori",
    tagline: "Offline-first mileage, travel & expense tracker on one Kotlin codebase across Android, iOS, Wear OS, watchOS & Desktop.",
    description:
      "Offline-first mileage, travel, and expense tracker spanning five platforms from one Kotlin codebase, with a real Kotlin/Ktor backend built in, off by default.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Android", "iOS", "Wear OS", "watchOS", "Desktop", "Room (KMP)", "Koin"],
    highlights: [
      "46-module clean architecture: 13 feature modules meeting only at the composition root.",
      "Real location engine, reimbursement policy engine, durable submit-outbox, and an on-device AI assistant.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/Doori" },
      { label: "Case study", url: "#work" },
      { label: "PaymentsLab-KMP (sibling KMP app)", url: "#project/paymentslab-kmp" },
    ],
    status: "46 modules · 5 platforms · 159 tests",
    deployments: [
      {
        channel: "F-Droid",
        detail:
          "Live in a self-hosted repository. 66 MB, signed, tagged NonFreeDep because location and on-device receipt OCR use Google Play Services components.",
        url: "https://darkpandawarrior.github.io/fdroid/repo",
      },
      {
        channel: "GitHub Releases",
        detail: "Signed APK per tag, for both the Play flavour and the Google-free one.",
        url: "https://github.com/darkpandawarrior/Doori/releases",
      },
    ],
    badges: ["Kotlin Multiplatform", "46 modules", "5 platforms", "Open source"],
    // Telemetry-cyan — the site's own "depth" accent, reused rather than
    // invented: fitting for a location/tracking app, distinct from Gaddi's
    // teak/brass and PaymentsLab-KMP's violet.
    theme: {
      accent: "#5ee6ff",
      accentDim: "#2fb8d6",
      ink: "#05070a",
      surface: "#0a1016",
      card: "#0f1720",
      line: "#1c2733",
    },
    icon: "/projects/doori/brand/mileway-icon.svg",
    targets: [
      {
        platform: "Android",
        deviceFrame: "phone",
        // ponytail: dropped track_miles_idle_screen / expense_entry_screen /
        // approvals_screen_pending_tab / analytics_home_screen — an older
        // capture batch (Jun 29) taken in the app's green Matrix theme,
        // inconsistent against the current amber theme used everywhere
        // else in this carousel. Replaced with the current-theme set below.
        screens: ["home_screen_loaded.png", "tracking_success_screen.png", "track_detail_screen.png", "set_pin_screen.png", "hardware_events_log_screen.png"],
      },
      {
        platform: "iOS",
        // Widget/Live-Activity captures are genuinely wide-short — a
        // bezel-less "widget" frame, not a phone bezel that would crop them.
        deviceFrame: "widget",
        screens: ["widget_ios_home.png", "live_activity.png", "live_activity_dynamic_island.png"],
        note: "Home-screen widget, Lock Screen widget and a Live Activity / Dynamic Island. Genuine iOS surfaces, shown at their real widget shape.",
      },
      {
        platform: "Wear OS",
        deviceFrame: "watch",
        screens: ["wear_dashboard.png", "wear_trip_list.png"],
      },
      {
        platform: "watchOS",
        deviceFrame: "watch",
        screens: ["watchos_app.png"],
        note: "Native SwiftUI app, same shared snapshot model.",
      },
      {
        platform: "Desktop",
        deviceFrame: "desktop",
        screens: ["desktop_dashboard.png"],
      },
      {
        platform: "Web",
        deviceFrame: "browser",
        screens: ["home_screen_loaded.png"],
        liveUrl: "/mileway-app/index.html",
        note: "Live, a Compose/Wasm preview shell: dashboard, live simulated tracking and the expense log, running the real design system and location math in your browser.",
      },
    ],
    detail: {
      overview:
        "Doori is an original, fully-offline mileage / travel / expense tracker I designed and built end-to-end in Kotlin & Compose Multiplatform. It runs on Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, offline-first with a real Kotlin/Ktor backend built in and off by default, so the whole thing stays reproducible and reviewable. It's my reference implementation for the architecture I advocate at scale: strict module isolation, a real location engine, a policy/reimbursement layer and a durable submit-outbox, all over local data.",
      sections: [
        {
          heading: "46-module clean architecture (36 local + 10 composed)",
          body: "Thirteen feature modules that never depend on each other, meeting only at the :app composition root and wired with Koin. A shared commonMain core holds the design system, Room (KMP) + DataStore, and every check-in / hardware-event screen, with platform services behind expect/actual. Convention plugins from my own kmp-build-logic keep every module's build consistent.",
        },
        {
          heading: "Location engine",
          body: "GPS is treated as a noisy signal: jitter suppression, spike detection to reject impossible fixes, a four-bucket distance accumulator, IMU (accelerometer) fusion and device-tier-adaptive sampling that trades battery against precision by hardware class. A deterministic simulated-drive source makes the whole engine unit-testable without hardware.",
        },
        {
          heading: "Policy & reimbursement engine",
          body: "A reimbursement-rate engine computes a payout from configurable per-vehicle rate rules, and the approvals flow flags policy violations against those rules. This is the real expense-platform logic a live product needs, implemented entirely against local data rather than stubbed with a snackbar.",
        },
        {
          heading: "Durable submit-outbox",
          body: "Submitting a track or voucher journals the intent locally and reconciles it deterministically, so a process kill mid-submit never loses a record or double-counts one. Repositories were written to look one implementation-swap away from a real API, and that bet paid off: a real Kotlin/Ktor `:server` module now exists, sharing `:contract` DTOs with the client so the wire format can't drift, with JWT auth guarding every route. Off by default behind one flag, so the offline guarantee above is unchanged until someone flips it.",
        },
        {
          heading: "Five targets, one snapshot model",
          body: "Beyond Android and iOS phones, the same shared SurfaceSnapshot drives a Wear OS app, a watchOS SwiftUI app and a Compose Desktop window, plus Android Glance + iOS WidgetKit home-screen widgets and an iOS Live Activity / Dynamic Island for an in-progress trip. Each surface has its own design-system skinning but reads the identical shared state.",
        },
        {
          heading: "Offline AI assistant",
          body: "A chat assistant grounded entirely in local Room data: trips, expenses, cards. Real chunked streaming (not a fake typing animation), persistent history with a 5-minute session-resume window, on-device speech-to-text/text-to-speech, and local usage analytics. No remote LLM, no server, same offline guarantee as the rest of the app.",
        },
        {
          heading: "Super-profile & plugin-composition platform (V24, shipped)",
          body: "The newest depth wave: a single plugin registry is the app's composition mechanism. TILE / CAPABILITY / VALUE plugins resolve by layering FORCED > USER > PRESET > DEFAULT, editable live from a Master Plugin page with source chips. Four persona presets (Corporate Commuter, Super-App Consumer, Gig Driver, Minimal Guest) reshape hubs, auth flows, tracking behaviour and tunables from one account. Built on top: act-on-behalf session delegation with an app-wide \"Acting as\" banner, a verification centre with corporate-email/OTP + card KYC, growth surfaces (referral, coupons, scratch rewards), membership (club, subscriptions, incentives), external wallet linking via OTP, and payout identity (masked bank + editable UPI handle + QR). All shipped, with a V25→V37 series landed on top (on-device intelligence, JWT auth, closeout hardening, home cards/advances, What's New), still offline-first by default with the real backend opt-in.",
        },
        {
          heading: "Master search, dynamic forms and document intelligence",
          body: "A registry-based master search fans one query across every feature module's own search provider from a single results screen, instead of a separate search box per hub. A dynamic form engine drives expense and claim entry: field validation, conditional visibility and GST auto-calc, with AI field suggestions fed by an on-device document-intelligence pipeline that combines on-device AI, text recognition and heuristics for OCR field-fill, doc-type classification and duplicate detection on a scanned receipt, degrading gracefully wherever a model isn't available.",
        },
        {
          heading: "FOSS-safe distribution & quality gates",
          body: "Dual gms / noGms builds (Google Play + F-Droid) with a dependency-prefix guard that fails the build if proprietary libraries leak into the FOSS flavor. 159 Roborazzi JVM screenshot tests (no emulator, no network) covering phone, watch and desktop, plus Napier logging, detekt, ktlint, Kover and CI.",
        },
      ],
      metrics: [
        { value: "46", label: "Gradle modules (36 local + 10 composed)" },
        { value: "13", label: "isolated feature modules" },
        { value: "5", label: "platforms · one codebase" },
        { value: "0", label: "backend calls by default, real Ktor server opt-in" },
      ],
      techStack: [
        { group: "Language & UI", items: ["Kotlin", "Compose Multiplatform", "Material 3", "SwiftUI (watchOS)"] },
        { group: "Data", items: ["Room (KMP)", "DataStore", "Coroutines + Flow", "Durable submit-outbox"] },
        { group: "Domain", items: ["Location engine (jitter · spike · IMU fusion)", "Reimbursement-rate policy engine", "Master search (provider registry)", "Dynamic form engine (GST auto-calc, conditional visibility)", "On-device document intelligence"] },
        { group: "Backend (opt-in, off by default)", items: ["Ktor + Exposed `:server`", "shared `:contract` DTOs", "JWT auth"] },
        { group: "DI & build", items: ["Koin", "kmp-build-logic convention plugins", "AGP", "Gradle KTS"] },
        { group: "Maps & platform", items: ["MapLibre (F-Droid)", "KrossMap (Play)", "Glance + WidgetKit widgets", "Live Activity / Dynamic Island"] },
        { group: "Quality", items: ["Roborazzi (159 JVM screenshot tests)", "detekt", "ktlint", "Kover", "CI"] },
      ],
      extraLinks: [
        { label: "Feature modules", url: "https://github.com/darkpandawarrior/Doori/tree/main/feature" },
        { label: "kmp-build-logic (shared)", url: "https://github.com/darkpandawarrior/kmp-build-logic" },
        { label: "README", url: "https://github.com/darkpandawarrior/Doori#readme" },
      ],
      videos: [
        { src: "/projects/doori/video/clipA_home.mp4", caption: "Home & dashboard: live capture" },
      ],
      diagrams: [
        {
          title: "46-module architecture, features meet only at :app",
          code: `graph TD
  app[":app composition root"]
  t["feature: tracking"]
  s["feature: logging"]
  tr["feature: travel"]
  ap["feature: approvals"]
  pa["feature: payables"]
  ag["feature: agent"]
  core["core: common · data · ui · network · security · maps<br/>design system · Room(KMP) · DataStore"]
  app --> t & s & tr & ap & pa & ag
  t & s & tr & ap & pa & ag --> core`,
        },
        {
          title: "Location pipeline: GPS treated as a noisy signal",
          code: `graph LR
  gps["Raw GPS"] --> jit["Jitter<br/>suppression"] --> spk["Spike<br/>detection"] --> fus["IMU<br/>fusion"] --> tier["Device-tier<br/>sampling"] --> acc["Four-bucket<br/>distance"] --> out["Clean track"]`,
        },
        {
          title: "One shared snapshot → five targets",
          code: `graph TD
  snap["commonMain<br/>SurfaceSnapshot"]
  snap --> a["Android phone"]
  snap --> i["iOS phone"]
  snap --> w["Wear OS"]
  snap --> wo["watchOS (SwiftUI)"]
  snap --> d["Compose Desktop"]`,
        },
      ],
    },
    screens: [
      { file: "super_profile_personas.gif", caption: "Super-profile & persona presets (V24)" },
      { file: "track_a_trip.gif", caption: "Track a trip: live flow" },
      { file: "delegation_manager.gif", caption: "Delegation: acting as a manager" },
      { file: "log_and_expense.gif", caption: "Log & expense: live flow" },
      { file: "approvals_payables.gif", caption: "Approvals & payables: live flow" },
      { file: "verification_growth.gif", caption: "Verification & growth: live flow" },
      { file: "membership.gif", caption: "Membership & subscription: live flow" },
      { file: "ai_assistant.gif", caption: "AI assistant: live flow" },
      { file: "onboarding_auth.gif", caption: "Onboarding & auth: live flow" },
      { file: "wallet_payout.gif", caption: "Wallet & payout: live flow" },
      { file: "account_sessions.gif", caption: "Account & sessions: live flow" },
      { file: "log_miles.gif", caption: "Log miles: live flow" },
      { file: "track_miles_idle_screen.png", caption: "Track Miles: ready to start" },
      { file: "tracking_success_screen.png", caption: "Tracking success + reimbursement" },
      { file: "track_detail_screen.png", caption: "Track detail: route stats" },
      { file: "track_insights_screen.png", caption: "Track insights: quality score" },
      { file: "geo_check_in_screen.png", caption: "Geo check-in with map overlay" },
      { file: "manual_check_in_screen.png", caption: "Manual check-in" },
      { file: "check_in_history_screen.png", caption: "Check-in history" },
      { file: "track_settings_screen.png", caption: "Tracking settings" },
      { file: "hardware_events_log_screen.png", caption: "Hardware-events log" },
      { file: "tracking_setup_guide_screen.png", caption: "Tracking setup guide" },
      { file: "spends_home_screen.png", caption: "Spends home" },
      { file: "log_miles_step1_screen.png", caption: "Log miles: location search" },
      { file: "log_miles_step2_screen.png", caption: "Log miles: travelled legs" },
      { file: "expense_entry_screen.png", caption: "Expense entry" },
      { file: "expense_detail_screen.png", caption: "Expense detail + receipt" },
      { file: "expense_history_screen.png", caption: "Expense history" },
      { file: "voucher_history_screen.png", caption: "Voucher history" },
      { file: "advance_history_screen.png", caption: "Advance-request history" },
      { file: "travel_home_screen.png", caption: "Travel hub" },
      { file: "create_trip_screen.png", caption: "Create trip request" },
      { file: "booking_history_screen.png", caption: "Booking history" },
      { file: "trip_history_screen.png", caption: "Trip history" },
      { file: "approvals_screen_pending_tab.png", caption: "Approvals: policy badges" },
      { file: "payables_home_screen.png", caption: "Payables hub" },
      { file: "create_payment_screen.png", caption: "Pay or request (UPI)" },
      { file: "payments_history_screen.png", caption: "Payments history" },
      { file: "cards_home_screen.png", caption: "Cards home" },
      { file: "profile_account_hub.png", caption: "Account hub" },
      { file: "settings_screen.png", caption: "Settings" },
      { file: "analytics_home_screen.png", caption: "Analytics: Canvas charts" },
      { file: "notification_centre_screen.png", caption: "Notification centre" },
      { file: "search_masterSearch_results.png", caption: "Master search" },
      { file: "media_attachment_selection_screen.png", caption: "Attachment sources" },
      { file: "media_cloud_library_screen.png", caption: "Media library" },
      { file: "agent_chat_screen.png", caption: "AI assistant chat" },
      { file: "agent_history_screen.png", caption: "AI assistant history" },
      { file: "assistant_home_sheet.png", caption: "Assistant home sheet" },
      { file: "theme_picker_matrix.png", caption: "Theme picker: Matrix" },
      { file: "home_screen_loaded.png", caption: "Home dashboard" },
      { file: "wear_dashboard.png", caption: "Wear OS: dashboard" },
      { file: "wear_trip_list.png", caption: "Wear OS: recent trips" },
      { file: "watchos_app.png", caption: "watchOS (SwiftUI) app" },
      { file: "widget_glance.png", caption: "Android widget (Glance)" },
      { file: "widget_ios_home.png", caption: "iOS home-screen widget" },
      { file: "live_activity.png", caption: "iOS Live Activity" },
      { file: "live_activity_dynamic_island.png", caption: "Dynamic Island: tracking" },
      { file: "desktop_dashboard.png", caption: "Compose Desktop window" },
      { file: "route_map.png", caption: "Route map: tracked trip" },
      { file: "login_screen.png", caption: "Login (demo credentials)" },
      { file: "set_pin_screen.png", caption: "Set PIN: app lock" },
      { file: "root_guard_screen_clean.png", caption: "Root guard: secure device" },
    ],
  },
  {
    slug: "paymentslab-kmp",
    tier: 2,
    name: "PaymentsLab-KMP",
    tagline: "An Integration Lab for the Android payments ecosystem: every gateway behind one abstraction, with a live look at what actually happens on each transaction.",
    description:
      "A Kotlin Multiplatform systems showcase: real payment flows across dozens of providers, all behind a single PaymentGateway abstraction, backed by a Ktor server that owns order creation, signature verification and webhook reconciliation.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Ktor", "Android", "iOS", "Room"],
    highlights: [
      "40-module registry (15 local + 25 composed) spans 66 cataloged payment gateways.",
      "Five money-movement rails plus split payments, all idempotency-keyed and MOCK_MODE-honest.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/PaymentsLab-KMP" },
      { label: "Doori (sibling KMP app)", url: "#project/doori" },
    ],
    status: "40 modules · 66 gateways · 5 rails",
    deployments: [
      {
        channel: "F-Droid",
        detail:
          "Live in a self-hosted repository. 33 MB, signed, tagged NonFreeDep and NonFreeNet because integrating real gateway SDKs is the whole point of the app.",
        url: "https://darkpandawarrior.github.io/fdroid/repo",
      },
      {
        channel: "GitHub Releases",
        detail: "Signed APK per tag.",
        url: "https://github.com/darkpandawarrior/PaymentsLab-KMP/releases",
      },
    ],
    badges: ["Kotlin Multiplatform", "40 modules", "66 gateways", "Open source"],
    theme: {
      accent: "#A78BFA",
      accentDim: "#7C3AED",
      ink: "#120A1F",
      surface: "#1B1130",
      card: "#241844",
      line: "#3F2B66",
    },
    icon: "/projects/paymentslab-kmp/brand/paymentslab-icon.svg",
    targets: [
      {
        platform: "Android",
        deviceFrame: "phone",
        screens: ["home_screen_dashboard.png", "lab_home_screen_catalog.png", "provider_lab_screen_running.png", "checkout_screen_order_summary.png", "history_screen_with_filters.png"],
      },
      {
        platform: "iOS",
        deviceFrame: "phone",
        screens: ["ios_catalog.png", "ios_catalog_stripe.png", "ios_catalog_all_native.png"],
        note: "Native Stripe iOS SDK alongside the shared KMP gateway contract.",
      },
      {
        platform: "Web",
        deviceFrame: "browser",
        // A real capture of THIS build running, at the browser frame's own
        // shape. LiveEmbed uses screens[0] as the floor while ~14 MB of Wasm
        // downloads, and this target shipped an EMPTY array — so the one
        // project whose whole subject is payment UIs showed a dead black
        // rectangle for the first several seconds, and kept showing one on any
        // browser that never painted. Its three siblings (kursi, mileway,
        // portfolio) each had a capture; this is the fourth.
        screens: ["web_home.png"],
        liveUrl: "/paymentslab-app/index.html",
        note: "Live, a Compose/Wasm preview shell running the gateway catalog and the explained-checkout demo in your browser, in MOCK_MODE: the real orchestrator FSM and hosted-webview archetype, in-memory fakes for the server.",
      },
    ],
    detail: {
      overview:
        "Payments is the hardest integration surface on Android: every gateway ships a different SDK, most of them are Activity-callback-era, the client can lie about the outcome, and the interesting logic (signatures, webhooks, idempotency, recovery) lives on the server. PaymentsLab-KMP runs real payment flows across a 66-gateway catalog behind a single PaymentGateway abstraction, and visualizes them step by step. A Ktor server does the order creation, signature verification and webhook reconciliation a real integration requires. Beyond one-shot pay-in it models five money-movement rails.",
      sections: [
        {
          heading: "The one idea worth stealing",
          body: "A client-side Success is a hint, never proof. Only the server decides the true state, after signature verification and webhook reconciliation. A server that owns price and truth, a client that always confirms before trusting, a journal written to Room before the SDK launches so a process death mid-payment is always recoverable, and a redaction layer so no secret or PII ever renders or logs.",
        },
        {
          heading: "40 modules, 66 gateways",
          body: "One Gradle module per native-SDK provider is contributed into a registry via Koin's getAll<PaymentGateway>(), so adding gateway N+1 touches no existing code. There are 15 local modules plus 25 composed from kmp-toolkit (19 of them standalone provider gateway modules). The in-app catalog spans 66 registered gateways: 7 native-SDK integrations, 47 hosted-webview gateways behind one archetype, 8 mobile-money flows and 4 catalog-only / KYC-gated entries, each with its own status badge and region.",
        },
        {
          heading: "Five money-movement rails + split payments",
          body: "Beyond one-shot checkout the server models payouts (/payouts: money out to a beneficiary), mandates & subscriptions (/mandates + scheduled debits and cancel), a card vault (/vault: tokenize once, charge later by id), marketplace Connect onboarding (/connect: sub-merchant KYC + split payouts) and an internal double-entry wallet ledger (/wallet: seed / debit / refund against a real running balance), plus split payments, a two-leg orchestration that compensates if one leg fails. Ten provider modules ride these rails (Paystack, Flutterwave, Paytm, Xendit, M-Pesa, Peach, NMI, Stripe Connect, plus wallet and a record-only cash gateway), every one MOCK_MODE-honest until real sandbox keys are set.",
        },
        {
          heading: "One contract, real SDKs",
          body: "Razorpay, Cashfree, Stripe (+ Google Pay), Square, Omise and a raw UPI intent flow all implement the same tiny PaymentGateway interface. The Activity-callback SDKs are bridged into suspending coroutines by a PaymentHost that never leaks an Activity upward. A generic hosted-webview archetype covers the whole class of gateways with no native SDK behind the same contract. Env-backed credentials auto-degrade from SANDBOX_READY to MOCK_MODE honestly instead of silently pretending to work.",
        },
        {
          heading: "Pure, replayable state machine",
          body: "The lifecycle is a pure (State, Event) → Effects reducer, zero coroutines/DI/IO, with the orchestrator just executing its effects. A payment's path is a recorded event log that replays byte-for-byte identically, the auditing property money movement wants. The MVI base comes from my own kmp-toolkit library, shared with other apps.",
        },
        {
          heading: "VAPT-grade security",
          body: "core:security holds real Android Keystore AES-256-GCM at-rest encryption, FLAG_SECURE + recursive tapjacking protection, device-integrity checks (root, emulator, debugger, Frida/Xposed hook detection, SSL-pinning-bypass detection), and a certificate-pinning config, with detection kept deliberately separate from enforcement policy.",
        },
      ],
      metrics: [
        { value: "40", label: "Gradle modules (15 local + 25 composed)" },
        { value: "66", label: "gateways cataloged" },
        { value: "5", label: "money-movement rails" },
        { value: "1", label: "PaymentGateway contract" },
      ],
      techStack: [
        { group: "Architecture", items: ["Kotlin Multiplatform", "Compose Multiplatform", "40 Gradle modules (15 + 25 composed)", "Koin registry (getAll)", "kmp-toolkit (shared MVI base)"] },
        { group: "Backend & rails", items: ["Ktor server", "HMAC-SHA256 signatures", "Webhook reconciliation", "Payouts · mandates · vault · connect · wallet ledger"] },
        { group: "Data & Security", items: ["Room (process-death journal)", "Android Keystore AES-256-GCM", "Certificate pinning", "Device-integrity checks"] },
        { group: "Build & quality", items: ["kmp-build-logic convention plugins", "Roborazzi screenshot tests", "ktlint", "detekt", "GitHub Actions CI"] },
      ],
      diagrams: [
        {
          title: "Gateway registry: adding provider N+1 touches no existing code",
          code: `graph TD
  reg["PaymentGateway registry<br/>Koin getAll()"]
  p1["provider: razorpay"] --> reg
  p2["provider: stripe"] --> reg
  p3["provider: cashfree"] --> reg
  p4["provider: hosted-webview<br/>(covers 44 gateways)"] --> reg
  pn["provider: N+1"] --> reg
  reg --> orch["PaymentOrchestrator"]`,
        },
        {
          title: "Client Success is a hint: the server decides truth",
          code: `graph LR
  cl["Client SDK<br/>callback"] -->|"hint only"| orch["Orchestrator"]
  orch -->|"confirm"| srv["Ktor server"]
  srv -->|"HMAC verify"| wh["Webhook<br/>reconcile"]
  wh -->|"true state"| orch`,
        },
        {
          title: "Five rails beyond one-shot pay-in",
          code: `graph TD
  srv["Ktor server<br/>(idempotency-keyed)"]
  srv --> pay["Pay-in /orders"]
  srv --> out["Payouts /payouts"]
  srv --> man["Mandates /mandates"]
  srv --> vlt["Card vault /vault"]
  srv --> con["Connect /connect"]
  srv --> wal["Wallet ledger /wallet"]`,
        },
      ],
      extraLinks: [
        { label: "kmp-toolkit (shared)", url: "https://github.com/darkpandawarrior/kmp-toolkit" },
        { label: "kmp-build-logic (shared)", url: "https://github.com/darkpandawarrior/kmp-build-logic" },
        { label: "README", url: "https://github.com/darkpandawarrior/PaymentsLab-KMP#readme" },
      ],
    },
    screens: [
      { file: "activity_flow.gif", caption: "Live activity flow" },
      { file: "checkout_flow.gif", caption: "Checkout flow" },
      { file: "explore_verify_flow.gif", caption: "Explore & verify flow" },
      { file: "home_screen_dashboard.png", caption: "Home dashboard: live stats" },
      { file: "lab_home_screen_catalog.png", caption: "Provider catalog" },
      { file: "provider_lab_screen_running.png", caption: "Live payment flow timeline" },
      { file: "provider_lab_screen_settled_success.png", caption: "Settled: verified success" },
      { file: "payment_flow_diagram_verified.png", caption: "Server-verified flow diagram" },
      { file: "payment_flow_diagram_unverified.png", caption: "Unverified: client hint only" },
      { file: "step_timeline_dark.png", caption: "Step timeline (dark)" },
      { file: "step_timeline_light.png", caption: "Step timeline (light)" },
      { file: "payload_card.png", caption: "Redacted payload card" },
      { file: "redaction_reveal.png", caption: "Redaction reveal" },
      { file: "mock_mode_badge_shimmer.png", caption: "MOCK_MODE badge" },
      { file: "gateway_badges.png", caption: "Gateway badges" },
      { file: "success_burst.png", caption: "Success animation" },
      { file: "failure_shake.png", caption: "Failure animation" },
      { file: "animated_amount.png", caption: "Animated amount" },
      { file: "checkout_screen_order_summary.png", caption: "Checkout: order summary" },
      { file: "history_screen_with_filters.png", caption: "Payment history + filters" },
      { file: "gateway_brand_badges.png", caption: "Gateway brand badges" },
      { file: "checkout_screen_paying.png", caption: "Checkout: paying" },
      { file: "checkout_screen_settled_success.png", caption: "Checkout: settled success" },
      { file: "history_screen_all.png", caption: "Payment history: all" },
      { file: "shield_pulse.png", caption: "Security shield pulse" },
      { file: "ios_catalog.png", caption: "iOS: provider catalog" },
      { file: "ios_catalog_stripe.png", caption: "iOS: Stripe native SDK" },
      { file: "ios_catalog_all_native.png", caption: "iOS: all native-SDK gateways" },
    ],
  },
  {
    slug: "candidai",
    tier: 2,
    name: "Candidai",
    tagline: "A native, multiplatform AI career-intelligence engine, and the open-source project it's built on.",
    description:
      "A local-first job-search engine rebuilt from scratch in Kotlin Multiplatform: resume onboarding, reverse-ATS discovery, evidence-based fit scoring and tailored résumés. Its scoring engine is ported and verified against the open-source career-ops project I actively contribute to upstream.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Spring Boot 4", "Room (KMP)", "Ktor", "85 ATS/board providers"],
    highlights: [
      "25-module Kotlin Multiplatform clean architecture (12 feature + 6 core modules) targeting Android, iOS, Desktop, Web and a Spring Boot 4 server from one shared engine.",
      "core:engine is a no-IO module: A-F fit scoring, ATS search, SimHash fingerprinting, and funnel math ported 1:1 from career-ops and verified against its own test vectors.",
      "85 ATS & job-board provider integrations and a zero-token scan path (direct Greenhouse/Ashby/Lever APIs, no LLM cost) inherited from the open-source engine it's built on.",
      `24 merged PRs to the public career-ops project (⭐${upstreamStars}): new ATS providers, an opt-in LLM re-ranker, an agent-inbox feature, and a run of correctness fixes, each with a reproduction and a regression test (full list below).`,
    ],
    // The native app is a private, v1-in-progress repo with no screenshots yet
    // — case study shown via the site's own detail page instead of a code link.
    // ONLY the public upstream is linked. Do not add a link to a personal
    // career-ops fork: a fork of a public repo is itself public (GitHub refuses
    // to make a public fork private), so it would publish the engine work that
    // is deliberately kept private. A public fork was deleted on 2026-08-01 for
    // exactly that reason.
    links: [
      { label: `Upstream (career-ops, ⭐${upstreamStars})`, url: "https://github.com/career-ops-hq/career-ops" },
    ],
    status: "Active · 24 PRs merged to public career-ops · member of the career-ops-hq org",
    badges: ["Kotlin Multiplatform", "25 modules", "Open-source contributor"],
    theme: {
      accent: "#3B82F6",
      accentDim: "#1D4ED8",
      ink: "#0A1120",
      surface: "#0F1B2E",
      card: "#16233A",
      line: "#28405E",
    },
    icon: "/projects/candidai/brand/hiresignal-icon.svg",
    targets: [
      {
        platform: "Android",
        deviceFrame: "phone",
        screens: ["dashboard_screen.png", "board_screen.png", "pipeline_screen.png"],
        note: "Real Roborazzi captures: first screenshots off the actual Compose UI, not mockups.",
      },
    ],
    detail: {
      overview:
        `Candidai is a local-first AI career-intelligence engine: resume onboarding, reverse-ATS discovery, evidence-based fit scoring and tailored résumés, in one pipeline. The product idea and scoring model started on career-ops, an open-source Node.js job-search engine (⭐${upstreamStars}) that I actively contribute to upstream. The native app is a from-scratch Kotlin Multiplatform rebuild: the same A-F fit-scoring engine, ported and verified line-for-line against the original, now running identically on Android, iOS, Desktop, Web and a Spring Boot server instead of a single Node process.`,
      sections: [
        {
          heading: "One engine, five targets",
          body: "A 25-module clean-architecture split, 12 feature modules and 6 core modules, targets Android, iOS, Desktop, Web (wasmJs) and a Spring Boot 4 server from one shared Kotlin codebase: 543 files, ~45,000 lines. core:designsystem, core:protocol, core:engine, core:data, core:network and core:ai sit underneath feature modules for dashboard, pipeline, explore, intel, ops, profile, auth, assistant and more.",
        },
        {
          heading: "A no-IO engine, ported and verified",
          body: "core:engine holds the A-F fit-scoring rubric, ATS search, SimHash fingerprinting for duplicate-listing detection, a liveness classifier, and the funnel math. None of it touches the network or disk. It's ported 1:1 from career-ops's original JavaScript implementation and checked against that implementation's own test vectors, so the scoring behaves identically whether it's running on Android, in a browser tab, or on the server.",
        },
        {
          heading: "Offline-first, agent-reachable",
          body: "Room (KMP) plus DataStore caches everything locally over a Ktor REST + NDJSON/SSE sync layer, so the dashboard stays usable offline and catches up when connectivity returns. An agent-interop surface lets other agents, and the OS itself, drive the app without going through the UI. It covers Android AppFunctions, iOS App Intents/Shortcuts, hiresignal:// deep links, and a documented OpenAPI contract.",
        },
        {
          heading: "On-device AI, with a fallback that always works",
          body: "Where an LLM adds real value, it runs on-device first: ML Kit GenAI / Gemini Nano on Android, Apple Foundation Models on iOS. Every AI-assisted step has a deterministic-heuristic fallback, so fit scoring and résumé tailoring keep working with zero model available, the same discipline career-ops applies with its zero-token scan path.",
        },
        {
          heading: "Zero tokens until an LLM is actually needed",
          body: "The engine's scan path hits Greenhouse, Ashby and Lever APIs plus per-company local parsers directly, at zero LLM cost, falling back to an agent-driven search only for companies with no structured source. Every scanned posting passes through one shared trust-validator that scores and flags it before it reaches the tracker. 85 ATS & job-board provider modules plug into that one contract instead of reinventing trust scoring each time.",
        },
        {
          heading: "One engine, many candidates",
          body: "career-ops's multi-profile architecture is a profiles.yml registry mapping each candidate to a private data root while sharing one engine install. That is the same shape the native app's per-candidate routing follows: one server, N profiles, a strict User/System data contract between them.",
        },
        {
          heading: "Bring your existing career-ops data",
          body: "Already running the career-ops CLI? Point Candidai at the existing checkout instead of starting over: the first-run wizard's Profiles screen has a Bring your data step, a doctor gate checks it's a usable career-ops root and says exactly what's missing if not, then imports it as an active profile. Reference mode leaves the folder where it is so the CLI can keep reading and writing it, guarded by a cross-process tracker lock; copy mode clones it onto the server volume for a host with no shared filesystem. The same path is exposed over HTTP for a server deploy.",
        },
        {
          heading: "The agent-interop contract, not just an OpenAPI label",
          body: "Any mutating request may carry an Idempotency-Key header; a retry with the same key on the same method and path is acknowledged without re-executing the write, the exact contract the mobile offline outbox itself relies on. Mutating requests to the API are rate-limited per client IP, with read-only GETs left unlimited. The scan and explore endpoints stream progress over SSE (text/event-stream) rather than blocking until a scan completes, so a caller sees offers arrive live instead of waiting on one long response.",
        },
        {
          heading: "Genuine upstream contribution, not a personal fork",
          body: "24 merged pull requests against the public career-ops repository (⭐" + upstreamStars + ", independently verifiable): two new ATS providers (BambooHR, Breezy HR), a dashboard rendering fix that rewrites only the changed Status cell instead of the whole row, an agent-inbox feature for queuing requests across sessions, an opt-in LLM relevance re-ranker for the pipeline, and a long run of correctness fixes. Most target one class of defect: code that reports success while doing the wrong thing. Distinct non-Latin company names collapsed to one key and silently deleted a tracked application; a `$` sequence in CV text spliced the template into the résumé while the build exited 0; a date filter was ignored in its `--flag=value` form, so a bounded scan silently ran unbounded; concurrent adds to the agent inbox dropped queued requests with no error; an unlocked append to shared scan history could interleave and corrupt it; and a `k`/`M`/`B` magnitude suffix walked an inflated claim straight past the fact-checker that exists to stop exactly that. Each shipped with a runnable reproduction and a regression test proving the fix.",
        },
      ],
      metrics: [
        { value: "25", label: "KMP modules · 5 targets" },
        { value: "45k", label: "lines of Kotlin · 543 files" },
        { value: "85", label: "ATS & job-board providers" },
        { value: "24", label: "PRs merged upstream" },
      ],
      techStack: [
        { group: "Native app", items: ["Kotlin Multiplatform", "Compose Multiplatform", "Spring Boot 4 server", "Room (KMP) + DataStore", "Ktor REST + NDJSON/SSE"] },
        { group: "On-device AI", items: ["ML Kit GenAI / Gemini Nano (Android)", "Apple Foundation Models (iOS)", "deterministic-heuristic fallback"] },
        { group: "Agent interop", items: ["Android AppFunctions", "iOS App Intents / Shortcuts", "hiresignal:// deep links", "OpenAPI contract"] },
        { group: "Open-source engine (career-ops)", items: ["Node.js", "85 ATS/job-board providers", "zero-token Greenhouse/Ashby/Lever scanning", "A-F fit rubric"] },
      ],
      extraLinks: [
        { label: "PR: agent-inbox feature", url: "https://github.com/career-ops-hq/career-ops/pull/1472" },
        { label: "PR: dashboard Status-cell fix", url: "https://github.com/career-ops-hq/career-ops/pull/1186" },
        { label: "PR: Breezy HR provider", url: "https://github.com/career-ops-hq/career-ops/pull/1185" },
        { label: "PR: BambooHR provider", url: "https://github.com/career-ops-hq/career-ops/pull/1141" },
      ],
      diagrams: [
        {
          title: "One engine, five targets",
          code: `graph LR
  eng["core:engine<br/>ported + verified vs career-ops test vectors"] --> and["Android"]
  eng --> ios["iOS"]
  eng --> desk["Desktop"]
  eng --> web["Web (wasmJs)"]
  eng --> srv["Spring Boot 4 server"]
  eng -.->|"no IO, pure scoring"| rules["A-F fit rubric · SimHash · funnel math"]`,
        },
        {
          title: "Zero tokens until an LLM is actually needed",
          code: `graph LR
  scan["scan"] --> apis["Greenhouse / Ashby / Lever APIs<br/>+ local parsers, zero LLM cost"]
  apis --> trust["shared trust-validator"]
  trust --> tracker["tracker"]
  scan -.->|"no structured source"| agent["agent-driven search, fallback only"] --> trust`,
        },
      ],
    },
    screens: [
      { file: "banner.gif", caption: "Candidai banner" },
      { file: "dashboard_screen.png", caption: "Dashboard: today's action queue, follow-ups due, awaiting decision" },
      { file: "board_screen.png", caption: "Job board: scored roles, re-scored live against your profile" },
      { file: "pipeline_screen.png", caption: "Pipeline inbox: keep/discard triage on freshly scanned roles" },
    ],
  },
  {
    // Was two entries — "portfolio" and "cv-siddharth-kmp" — and both were dead ends: one bounced
    // you to the live site you were already on, the other bounced you to GitHub. Neither ever
    // explained what either thing IS. One entry now, with the breakdown on the page.
    slug: "portfolio",
    name: "Portfolio Twin",
    tagline: "The site you're reading, plus Panda the assistant that answers for me, and the whole thing rebuilt a second time in Compose Multiplatform, one commonMain to Web, Desktop, Android and iOS.",
    description:
      `An interactive résumé built twice, on purpose. The React 19 original runs on Vercel Edge with a provider-agnostic LLM assistant grounded in this same profile data. The Compose Multiplatform port renders the same portfolio from ${(repoStats.kotlinLines / 1000).toFixed(1)}k lines of Kotlin to Kotlin/Wasm, Desktop, Android and iOS. An honest test of how far CMP reaches on the web, including where it doesn't.`,
    stack: ["cv-siddharth", "React 19", "Vite 7", "Tailwind v4", "Vercel Edge", "Multi-provider LLM", "Kotlin Multiplatform", "Compose Multiplatform", "Kotlin/Wasm"],
    highlights: [
      "Two full implementations of one portfolio: the same content rendered by React on the web and by Compose Multiplatform to four targets, which makes the comparison concrete rather than theoretical.",
      "Provider-agnostic chat backend (Groq / Gemini / Claude) with prompt-injection guards. Panda is grounded in this file, the same source of truth the pages render from, so the assistant cannot drift from the site.",
      "Every claim on this site is checked mechanically before it ships, not recalled: a claim-audit script verifies the facts and scans every outward-facing surface for phrases already disproven.",
    ],
    links: [
      { label: "Live", url: "https://cv-siddharth.vercel.app" },
      { label: "React source", url: "https://github.com/darkpandawarrior/cv-siddharth" },
      { label: "Compose Multiplatform source", url: "https://github.com/darkpandawarrior/cv-siddharth-kmp" },
      { label: "kmp-app-template", url: "https://github.com/darkpandawarrior/kmp-app-template" },
      { label: "kmp-family (this site's own case study)", url: "#project/kmp-family" },
    ],
    targets: [
      {
        // One target, not two. A "React" entry would be a device frame around the page the reader
        // is already looking at — redundant, and it proves nothing that being here does not.
        platform: "Web",
        deviceFrame: "browser",
        // The actual compiled Compose-Multiplatform/Wasm build of this same portfolio, running
        // beside the React one. Built from cv-siddharth-kmp's :cmp-web wasmJsBrowserDistribution —
        // 14.7 MB on disk (du -sk public/portfolio-app), in line with the kursi/mileway/paymentslab
        // embeds already here.
        //
        // This is the whole point of the project, and until now the page could only assert it. A
        // screenshot of a cross-platform build proves nothing that a screenshot of anything else
        // does not; the build actually running is the only checkable version of the claim.
        liveUrl: "/portfolio-app/index.html",
        // Screenshot floor under the live embed. LiveEmbed uses screens[0] as the
        // fallback while the ~13 MB of Wasm downloads and compiles — without one the
        // frame is a dead black box for the first several seconds, and stays one on a
        // browser that never paints. This capture is of the running build itself.
        screens: ["cmp_web.png"],
        note: "Live: the Compose Multiplatform build of this very site, compiled to Wasm and running in your browser. Same content, one commonMain, a different stack entirely.",
      },
    ],
    status: "Live · React on Vercel, CMP across 4 targets",
    badges: ["React 19", "Vercel", "LLM chat", "Compose Multiplatform", "Wasm"],
    detail: {
      overview:
        "A CV that is also the portfolio piece. Rather than describe the work, the site is built the way the work is built, and then rebuilt a second time on an entirely different stack to see what survives the move. The React version renders everything from one TypeScript file of profile data, which is also what the AI assistant, the résumé, the OG images and the two /llms.txt files are generated from, so none of them can disagree with each other. The Compose twin transcribes that file by hand, which is a different contract and a weaker one.",
      sections: [
        {
          heading: "The React site: how it is put together",
          body: "React 19 + Vite 7 + Tailwind v4, file-routed with TanStack Router and server-rendered, deployed on Vercel Edge. There is no CMS and no database: profile.ts is the single source of truth, and a set of prebuild generators derive everything else from disk: galleries from the screenshot folders, comparison sets, the sitemap, the RSS feed, OG images, llms.txt, and AVIF/WebP derivatives for every raster. Adding a screenshot is a file drop, never a list edit, which is the only reason the media stays honest as it grows.",
        },
        {
          heading: "The surfaces: a guide to what is where",
          body: "The home page carries the case studies and experience. /resume is the printable résumé; /shipped is the shelf and timeline of apps that actually reached a store; /project/<slug> is a project breakdown like this one, including a slide-to-compare viewer for design work. Then the rooms, which are the point of the site as much as the CV is: /map is The 3D Storyboard, the projects as a constellation; /forge is The Particle Forge, physics on a canvas; /blueprint is a 3D walkthrough; /compose is a live Compose-subset interpreter that parses a snippet and renders real composables rather than a screenshot; /terminal and /playground are interactive toys; /pulse and /lab are instrument views over the site's own data. /loopdown is Notes From The Loop, /read/<slug> the writing itself, /excelsior a magazine archive, /ink The Board, seven years of games, mined, /chess a chess corpus, /weeb a hand-kept list read as evidence. /hire runs a job description against the documented experience and reports the fit, including the gaps.",
        },
        {
          heading: "Panda, and why it cannot oversell",
          body: "A provider-agnostic assistant over Groq, Gemini and Claude with prompt-injection guards, running on Vercel Edge functions. It is grounded in this same profile data rather than a separate prompt-authored biography, so it cannot invent a role or a metric that the site does not also show. The job-description check is explicitly instructed to be straight about where the fit is weak. An assistant that oversells its own person is worth nothing to a recruiter, and the honesty is what makes the rest credible.",
        },
        {
          heading: "The Compose Multiplatform twin",
          body: `${repoStats.kotlinLines.toLocaleString("en-US")} lines of hand-written Kotlin across ${repoStats.kotlinFiles} files and four Gradle modules (cmp-shared, cmp-web, cmp-desktop, cmp-android, plus an Xcode project on top of the shared one) rendering the same portfolio to Kotlin/Wasm, Desktop, Android and iOS from one commonMain. The corpora it renders are generated into Kotlin from this repo's own data rather than transcribed, so the two versions cannot disagree about a number. Deliberately bleeding edge: Kotlin ${repoStats.kotlin}, Compose Multiplatform ${repoStats.compose}, AGP ${repoStats.agp}, Gradle ${repoStats.gradle}, every version the newest published including pre-release. The question it exists to answer is where the edge actually is.`,
        },
        {
          heading: "What the CMP build refuses to depend on",
          body: "Almost nothing, by design: no navigation library, no DI framework, no markdown parser, no diagram renderer, no icon pack, no shader library. Routing, the Mermaid layout engine, the SkSL ambient wash, the SSE frame parser and every icon are hand-built on Compose and Ktor primitives. It is built on kmp-app-template, so it doubles as the proof that the template carries a real app to four targets rather than a hello-world.",
        },
        {
          heading: "Honest about the edges",
          body: "The CMP port is an experiment and is described as one. Compose Multiplatform on Wasm reaches further than most people expect and still costs something real in bundle size and first paint against a React build that was tuned for exactly this. Both versions exist here so the trade is visible rather than argued.",
        },
      ],
      // NOTHING BELOW IS HAND-KEPT ANY MORE, and the history is the argument.
      //
      // This comment used to list shell commands to re-derive these figures by
      // hand, while also explaining that the test counts had been taken OFF that
      // list because "a documented manual step is still a hand-kept number" and
      // had drifted to 619/46 against an actual 777/67.
      //
      // The twin's figures then did the same thing, one release later: measured
      // 2026-09-01 this block claimed 16,180 lines across 44 files against a real
      // 31,479 across 63, and named four toolchain versions that had all moved
      // on. A ritual that had already failed once was left in place for the
      // numbers it had not failed on yet.
      //
      // So they come from repoStats.ts, which gen-repo-stats.mjs derives from
      // the twin's own tree, and check-generated.mjs fails CI if the committed
      // file and the generator disagree. The route count is derived from the
      // route registry rather than a capture manifest, and the wasm size from
      // the directory that is actually served.
      metrics: [
        { value: String(surfaces.length), label: "surfaces · every one on the wall" },
        { value: String(repoStats.tests), label: `unit tests · ${repoStats.testFiles} files` },
        { value: `${(repoStats.kotlinLines / 1000).toFixed(1)}k`, label: "lines of Kotlin · the CMP twin" },
        { value: "14.7 MB", label: "the Wasm twin's honest cost" },
      ],
      techStack: [
        { group: "React site", items: ["React 19", "Vite 7", "Tailwind v4", "TanStack Router + Start", "three.js / R3F", "Vercel Edge", "Playwright", "Vitest"] },
        { group: "Assistant", items: ["Groq", "Gemini", "Claude", "SSE streaming", "Prompt-injection guards"] },
        { group: "CMP twin", items: ["Kotlin Multiplatform", "Compose Multiplatform", "Kotlin/Wasm", "Desktop (JVM)", "Android", "iOS", "Ktor"] },
      ],
      diagrams: [
        {
          // Checkable: every arrow below is a script in scripts/ that imports
          // ../src/data/profile.ts — gen-og, gen-sitemap, gen-system-prompt,
          // gen-project-heroes — plus print-resume.mjs, which prints /resume.
          title: "One profile.ts: every surface derived from it",
          code: `graph LR
  p["profile.ts<br/>single source"] --> pages["React pages<br/>+ /resume"]
  p --> og["gen-og<br/>OG cards"]
  p --> sm["gen-sitemap<br/>sitemap.xml"]
  p --> sp["gen-system-prompt<br/>Panda's grounding<br/>+ llms.txt"]
  p --> h["gen-project-heroes<br/>hero art"]`,
        },
        {
          // Checkable: cv-siddharth-kmp/settings.gradle.kts includes exactly
          // :cmp-shared, :cmp-android, :cmp-desktop, :cmp-web; cmp-ios is the
          // Xcode project consuming :cmp-shared.
          title: "Built twice: one portfolio, two stacks",
          code: `graph TD
  c["the same content"] --> r["React 19 + Vite<br/>TanStack Start"]
  c --> k["cmp-shared<br/>commonMain"]
  r --> v["Vercel Edge"]
  k --> w["cmp-web → Wasm"]
  k --> d["cmp-desktop → JVM"]
  k --> a["cmp-android"]
  k --> i["cmp-ios"]
  w -.->|"embedded at /portfolio-app"| v`,
        },
      ],
      extraLinks: [
        { label: "React source", url: "https://github.com/darkpandawarrior/cv-siddharth" },
        { label: "Compose Multiplatform source", url: "https://github.com/darkpandawarrior/cv-siddharth-kmp" },
        { label: "kmp-app-template", url: "https://github.com/darkpandawarrior/kmp-app-template" },
        { label: "kmp-family (this site's own case study)", url: "#project/kmp-family" },
      ],
    },
    // The gallery is this site's own route captures — docs/screenshots/site_*.png,
    // produced by `npm run capture:site` against a served build and copied into
    // public/projects/portfolio/screenshots/. A portfolio page whose argument is
    // "look how this is built" and which shows nothing is arguing with itself.
    screens: [
      { file: "site_home.png", caption: "Home: the case studies and the experience" },
      { file: "cmp_web.png", caption: "The Compose Multiplatform twin, running in the browser" },
      { file: "site_project_detail.png", caption: "/project/portfolio: this very page" },
      { file: "site_project_detail_with_compare.png", caption: "/project/doori: the slide-to-compare viewer" },
      { file: "site_resume.png", caption: "/resume: the printable résumé" },
      { file: "site_shipped.png", caption: "/shipped: apps that actually reached a store" },
      { file: "site_hire.png", caption: "/hire: a job description run against the documented experience" },
      { file: "site_map.png", caption: "/map: The 3D Storyboard" },
      { file: "site_forge.png", caption: "/forge: The Particle Forge" },
      { file: "site_blueprint.png", caption: "/blueprint: the 3D walkthrough" },
      { file: "site_compose.png", caption: "/compose: a live Compose-subset interpreter" },
      { file: "site_terminal.png", caption: "/terminal: the interactive shell" },
      { file: "site_playground.png", caption: "/playground: the toy box" },
      { file: "site_pulse.png", caption: "/pulse: an instrument view over the site's own data" },
      { file: "site_lab.png", caption: "/lab: the Lab Bench experiments" },
      { file: "site_loopdown.png", caption: "/loopdown: Notes From The Loop" },
      { file: "site_excelsior.png", caption: "/excelsior: the magazine archive" },
      { file: "site_ink.png", caption: "/ink: The Board, seven years of games" },
      { file: "site_chess.png", caption: "/chess: the chess corpus" },
      { file: "site_weeb.png", caption: "/weeb: a hand-kept list read as evidence" },
    ],
  },
  {
    slug: "stutter",
    name: "STUTTER",
    tagline: "A first-person time-loop game about a moment someone could not let end.",
    description:
      "Godot 4.7 in GDScript. A deterministic echo-replay spine powers cooperative echoes, ghosts, and boss desync from one system, with recorded input intent replayed through the same physics step. Built solo as an AI-orchestrated dev crew.",
    stack: ["Godot 4.7", "GDScript", "Deterministic fixed-timestep sim", "gdUnit4", "AI-orchestrated content pipeline"],
    highlights: [
      "One deterministic (state, InputFrame) → state step reused five ways: cooperative Echoes, ghosts, leaderboard replays, the Hunter, and boss desync.",
      "A bit-exact determinism gate guards every change to the time systems, wired into a hook that reruns it automatically on every edit.",
      "Design-first build: a 4,300+ line, 7-document codex and 24 animated SVG design boards, generated by a checked-in AI dev-crew script. 39 agents, 0 failures, one session.",
    ],
    // Repo is private — early solo build, not ready for public code review yet.
    // The case study below is real: verified against the actual source, not marketing copy.
    links: [],
    status: "In development · private repo, public case study",
    badges: ["Godot 4.7", "GDScript", "Time-loop", "Solo + AI dev crew"],
    // Brightened from the original #B3223C pick — that failed WCAG AA against
    // ink/surface/card (2.6-3.0:1) and its hover state was nearly invisible
    // (1.6:1). These clear AA everywhere they're used as text/CTA color
    // (5.1-7.1:1), verified with the real relative-luminance formula.
    theme: {
      accent: "#FF5C7A",
      accentDim: "#EE5577",
      ink: "#140A0C",
      surface: "#1F0F13",
      card: "#2A151A",
      line: "#4A2530",
    },
    icon: "/projects/stutter/brand/deadlock-icon.svg",
    targets: [
      {
        // The repo stays private; the BUILD does not have to be.
        //
        // A straight `--export-release Web` of this project is 310 MB — a
        // 280 MB .pck alone, which is over GitHub's 100 MB per-file limit and
        // unservable besides. Two things caused it, and neither was the game:
        // the preset exported `all_resources`, shipping 29 CC0 models that no
        // script in the project references, and every texture imported at
        // `compress/mode=0` (lossless), which turns a 500 KB JPG into ~4 MB of
        // uncompressed pixels — 258 times over.
        //
        // The web build now drops the unreferenced models and imports textures
        // lossy at a 512px cap, built from a throwaway copy of the project so
        // the game itself keeps its lossless masters for the desktop build.
        // Result: 65 MB on disk, ~36 MB over the wire, biggest file 38 MB.
        // Every chapter the menu offers is playable — this is a trimmed
        // build, not a trimmed game.
        platform: "Web",
        deviceFrame: "browser",
        liveUrl: "/deadlock-app/index.html",
        screens: ["web_home.png"],
        note: "Live: the real Godot build, compiled to WebAssembly. Pick a chapter, then click once to capture the mouse: WASD to move, R to rewind, Esc frees the cursor.",
      },
    ],
    detail: {
      overview:
        "STUTTER is a first-person time-loop game about a moment someone could not let end: a grieving mind's mathematics, rendered as a room that lies about its own floor. Under the mood sits one deterministic engine: every action is recorded as intent, never position, and replayed through the exact same physics step. That one idea is reused, unmodified, five different ways across the game's core systems: record intent, replay deterministically.",
      sections: [
        {
          heading: "Record intent, never position",
          body: "The determinism contract in one line: an InputFrame stores a move vector, jump, and dash, never a position. Motion.step(state, frame) replays it through the same fixed-timestep physics tick every time, so the same state plus the same frame always produces the same state out. Positions are outputs, never inputs, which is what makes an Echo standing on a pressure pad, a ghost racing a past run, and the Hunter's prediction the same handful of lines wearing three different narrative masks.",
        },
        {
          heading: "One spine, five faces",
          body: "Recorder is a ring buffer of InputFrames; Echo replays a slice of it tick-for-tick, either incrementally (once per physics tick, for a live cooperating Echo holding a pressure pad open) or in one shot (for ghosts, tests, and the Hunter's prediction). Cooperative Echoes hold a bridge open, ghosts race a past run, the leaderboard replays a full match, and the Hunter, the thing hunting you, predicts your position off the same replay math. No branch of that list touches a second system.",
        },
        {
          heading: "The gate that can't be skipped",
          body: "tests/test_determinism.gd asserts bit-exact field equality with no tolerance, plus a perturbation check that fails if a changed input ever produces an identical output, the test that would catch a gate that silently stopped testing anything. A PostToolUse hook reruns it automatically on any edit to the time or player systems, so drift surfaces the moment it's introduced, not at playtest.",
        },
        {
          heading: "The Hunter, built on the same replay math",
          body: "The Hunter wakes once the player's attention score crosses a threshold, can be frozen by the Stutter ability, and catches the player by proximity, a CharacterBody3D whose prediction runs on the exact same recorded-intent pipeline as the cooperative-Echo and boss-desync mechanics. It isn't a second AI system bolted on; it's the same fifteen lines of replay code with a different narrative job.",
        },
        {
          heading: "Design bible before geometry",
          body: "52 logged iterations, 10 entity dossiers, 24 hand-authored animated-SVG design boards, and a 4,300+ line, seven-document codex, written before most of the game's rooms exist. The frame test for every addition is one question: would a grieving mind hold this?",
        },
        {
          heading: "An AI dev crew, checked in, not described",
          body: "The codex wasn't hand-written. It was generated by a workflow script checked into the repo: three readers distill source material, seven documents generate in a pipeline where critique starts the moment each one finishes its own draft, the four widest creative documents run dual-lens ensembles merged by a judge pass, and every draft clears adversarial critics for frame, fairness, originality, and voice before a reviser is allowed to touch the file. One session: 39 agents, zero failures, ~4.8M tokens.",
        },
        {
          heading: "Honesty as a design constraint",
          body: "The project's own README states plainly which systems are playable versus designed-but-unbuilt, and backs every specific number with a literal command a reader could run against the source. The in-fiction lesson is asked of the documentation too. An unreliable room lies about the floor; sending an Echo reveals the truth.",
        },
      ],
      metrics: [
        { value: "5", label: "systems · one deterministic spine" },
        { value: "2,026", label: "lines of GDScript · 36 files" },
        { value: "39", label: "AI agents · one dev-crew session" },
        { value: "0", label: "tolerance in the determinism gate" },
      ],
      techStack: [
        { group: "Engine", items: ["Godot 4.7 (Forward+)", "GDScript", "fixed-timestep _physics_process"] },
        { group: "Determinism core", items: ["InputFrame (intent, not position)", "Recorder ring buffer", "Echo (incremental + one-shot replay)"] },
        { group: "Testing", items: ["gdUnit4", "bit-exact determinism gate", "PostToolUse re-run hook"] },
        { group: "Build", items: ["Single-threaded WASM web export", "Git LFS for binary assets"] },
        { group: "Content pipeline", items: ["Checked-in AI dev-crew workflow script", "voice/dash deterministic lints", "pre-commit enforced"] },
      ],
      diagrams: [
        {
          title: "One deterministic step, five uses",
          code: `graph LR
  s["state"] -->|"InputFrame (intent)"| step["Motion.step()<br/>pure · fixed timestep"] --> s2["state'"]
  step -.-> echo["Echo, cooperative"]
  step -.-> ghost["Ghost replay"]
  step -.-> board["Leaderboard replay"]
  step -.-> hunter["The Hunter, prediction"]
  step -.-> boss["Boss desync"]`,
        },
        {
          title: "The gate that can't be skipped",
          code: `graph TD
  edit["Edit to core/time/ or core/player/"] --> hook["PostToolUse hook"]
  hook --> gate["tests/test_determinism.gd<br/>bit-exact · zero tolerance"]
  gate -->|"pass"| ok["Change accepted"]
  gate -->|"fail"| block["Drift caught before playtest"]
  gate --> perturb["Perturbation check<br/>changed input -> must change output"]`,
        },
      ],
    },
    screens: [
      { file: "title.webp", caption: "Title: dark maroon, a room that lies about its own floor" },
      { file: "journey.gif", caption: "Title → false-floor room → two-Echo cooperation → Sense HUD → Pull ability" },
      { file: "echo-cooperation.webp", caption: "Two Echoes holding a bridge open: same replay math, cooperative use" },
      { file: "the-sense.webp", caption: "The Sense: reading the room for what it's hiding" },
      { file: "pull.webp", caption: "Pull ability: one verb, reused across encounters" },
      { file: "echo-stutter.svg", caption: "Echo / Stutter: the core verb, diagrammed" },
      { file: "pipeline.gif", caption: "The AI dev-crew pipeline that generated the design codex: 39 agents, one session" },
    ],
  },
  {
    slug: "sinc-p",
    tier: 2,
    name: "SINC-P",
    tagline: "A statutory student-grievance redressal system, built to survive a UGC inspection rather than a demo.",
    description:
      "Next.js 16 over Postgres with row-level security, rewriting a 2019 MANIT Bhopal final-year project (a downloaded complaint-box template, categories still reading E-commerce and Online Shopping) into a real compliance system: a statutory SLA clock, a hash-chained append-only audit trail, and published closure-time transparency with no login required.",
    stack: ["Next.js 16", "React 19", "TypeScript strict", "Postgres", "Drizzle ORM", "Tailwind v4", "Vitest"],
    highlights: [
      "A statutory SLA clock escalating officer, then admin, then the Ombudsperson tier the regulations require, plus a hash-chained audit trail a retro-edited remark cannot pass unnoticed.",
      "Tenant isolation across four independent layers, down to Postgres row-level security, verified by a script that tries to break it rather than trusted from the application side alone.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/SINC-P" },
      { label: "Doori (sibling KMP app)", url: "#project/doori" },
    ],
    status: "Active · AGPL-3.0 · UGC 2023-compliant",
    badges: ["Next.js 16", "Postgres RLS", "AGPL-3.0", "UGC 2023"],
    detail: {
      overview:
        "SINC-P rebuilds a 2019 final-year project from scratch: a statutory grievance-redressal system an Indian institution can put in front of a UGC inspector, with a clock on every case and a record nobody can quietly edit. Nothing from 2019 survived the rewrite, not the code, the schema, or the passwords, because almost every line of the original was an ordinary mistake (string-built SQL, unsalted md5, no ownership check on a grievance read) that is still running at real institutions today.",
      sections: [
        {
          heading: "A statutory clock that survives an audit",
          body: "Every grievance carries a due date computed from the category override or the institution default, in Asia/Kolkata, in calendar or working days. The timezone handling is deliberate: IST sits at a fixed +5:30, so a due date computed off UTC calendar days lands a day early or late depending on what time somebody filed, and that is the kind of drift an inspection finds, not a test. Breaches escalate officer, then admin, then the Ombudsperson tier the UGC regulations require.",
        },
        {
          heading: "An append-only trail that shows its teeth",
          body: "The grievance event log is hash-chained: each event commits to the one before it, so a retro-edited remark or a deleted escalation breaks verification at a nameable sequence number, enforced by a database trigger and a revoked privilege rather than good intentions. The UI calls this tamper-evident, not tamper-proof, because overselling it is the one lie an auditor could catch.",
        },
        {
          heading: "Tenant isolation you can attack",
          body: "Four independent layers assume any one of them will eventually have a bug: application-level scoping, a transaction-local tenant context, Postgres row-level security enforced even against table owners, and a runtime database role that is neither owner nor superuser. A verification script stands up a throwaway Postgres and actively tries to break every layer rather than asserting isolation from the application side alone.",
        },
        {
          heading: "What changed since 2019",
          body: "The 2019 tree ran unauthenticated SQL injection (string-concatenated queries), unsalted md5 passwords, an IDOR that let any logged-in student read every other student's grievance by counting upward through the URL, and an upload path that would execute an uploaded PHP file as a shell. The 2026 rewrite replaces each with parameterised queries under RLS, scrypt with a per-password salt, an explicit authorization check on every read path, and magic-byte-sniffed uploads capped in flight and stored outside the web root.",
        },
        {
          heading: "Published transparency, no login required",
          body: "A public transparency page shows median days to resolution per category, with any figure computed from a small handful of cases suppressed at the query layer so a single-digit count in one department can never read as a name. The buyer (a Registrar or Dean of Student Welfare) gets the audit trail; students get a public scoreboard, which is what makes them actually file into the system the compliance record depends on.",
        },
      ],
      techStack: [
        { group: "Framework", items: ["Next.js 16 (App Router)", "React 19", "Server Components"] },
        { group: "Data", items: ["Postgres", "Drizzle ORM", "Row-Level Security"] },
        { group: "Language & validation", items: ["TypeScript strict", "noUncheckedIndexedAccess", "Zod v4"] },
        { group: "Auth & ops", items: ["scrypt (node:crypto)", "server sessions", "Docker Compose deploy"] },
        { group: "Quality", items: ["Vitest", "integration tests against a real Postgres"] },
      ],
      extraLinks: [
        { label: "ADR-0001: product & architecture decision", url: "https://github.com/darkpandawarrior/SINC-P/blob/main/docs/decisions/0001-product-and-architecture.md" },
        { label: "2019 → 2026 migration writeup", url: "https://github.com/darkpandawarrior/SINC-P/blob/main/docs/migration-from-2019.md" },
      ],
      diagrams: [
        {
          title: "Tenant isolation: four layers, any one assumed to fail",
          code: `graph TD
  req["Request"] --> app["Application-level scoping"]
  app --> tx["Transaction-local tenant context"]
  tx --> rls["Postgres FORCE ROW LEVEL SECURITY"]
  rls --> role["Least-privilege runtime role"]
  role --> db[("Tenant's own rows only")]`,
        },
      ],
    },
    screens: [
      { file: "01-landing.png", caption: "Landing" },
      { file: "02-transparency.png", caption: "Published closure times, with small cells suppressed" },
      { file: "03-officer-queue.png", caption: "The officer queue, sorted by what breaches soonest" },
      { file: "04-case-view.png", caption: "A case, with its full hash-chained trail" },
      { file: "05-compliance.png", caption: "The compliance dashboard" },
      { file: "06-student-portal.png", caption: "The student portal: where each grievance actually is" },
      { file: "07-file-grievance.png", caption: "Filing: matching handbook entries surface before the form accepts anything" },
      { file: "08-systemic-patterns.png", caption: "The officer console surfacing a systemic issue" },
      { file: "09-disclosures.png", caption: "Statutory disclosures: SGRC composition, Ombudsperson, procedure" },
      { file: "10-status-lookup.png", caption: "Status lookup, no login required" },
      { file: "11-student-case.png", caption: "A student's own case detail" },
      { file: "12-news.png", caption: "Campus news" },
      { file: "13-handbook.png", caption: "The deflection handbook" },
    ],
  },
  {
    slug: "kmp-family",
    name: "The KMP toolkit family",
    tagline: "Three decoupled repos so a new app starts at \"write the feature\".",
    description:
      "The reusable libraries, the shared build logic and the app shape each live in their own repo, vendored into five consumers via Gradle includeBuild, so a version bump happens once instead of per project.",
    stack: ["Kotlin Multiplatform", "Gradle convention plugins", "Compose Multiplatform", "MIT"],
    highlights: [
      "kmp-toolkit: 39 modules, each extracted the moment a second consumer needed the same logic, never designed as a \"platform\" up front, from the MVI core four apps build on to modules like store and bots-policy still finding their first consumer.",
      "kmp-build-logic: 17 convention plugins here (22 authored across all repos). The AGP / Kotlin / Compose / test / lint / Firebase / Room / Koin setup written once and applied with one line.",
      "kmp-app-template, the app shape the toolkit slots into: one shared Compose UI, a wired Splash → Login → Home nav scaffold, thin Android + Desktop shells, and a customizer.sh that renames the whole project in one command.",
      "Consumed by Doori (10 of its 46 modules), PaymentsLab-KMP (25 of its 40), Candidai and Gaddi. The composition is the proof the extraction was real, not a library nobody uses.",
    ],
    links: [
      { label: "kmp-toolkit", url: "https://github.com/darkpandawarrior/kmp-toolkit" },
      { label: "kmp-build-logic", url: "https://github.com/darkpandawarrior/kmp-build-logic" },
      { label: "kmp-app-template", url: "https://github.com/darkpandawarrior/kmp-app-template" },
      { label: "Doori (sibling KMP app)", url: "#project/doori" },
      { label: "PaymentsLab-KMP (sibling KMP app)", url: "#project/paymentslab-kmp" },
      { label: "Candidai (sibling KMP app)", url: "#project/candidai" },
      { label: "Gaddi (sibling KMP app)", url: "#project/gaddi" },
    ],
    status: "Active · MIT · vendored across 5 repos",
    badges: ["Kotlin Multiplatform", "39 modules", "22 convention plugins", "MIT"],
    detail: {
      overview:
        "The KMP toolkit family is three decoupled repos (kmp-toolkit, kmp-build-logic and kmp-app-template) instead of one \"platform\" repo, so that using one of them never means dragging the other two along. None of the three were designed up front: each exists because a second consumer needed something the first one already had, and extracting it once was cheaper than copy-pasting it again. The family is vendored into Doori, PaymentsLab-KMP, Candidai, Gaddi and this portfolio's own Compose Multiplatform twin via Gradle includeBuild, so a fix or a version bump lands once and every consumer picks it up on its own schedule.",
      sections: [
        {
          heading: "kmp-toolkit: 39 modules, extracted, never designed",
          body: "The library repo, 39 modules, each pulled out the moment a second consumer needed the same logic rather than sketched in ahead of demand. In active use: the MVI ViewModel core (Candidai, PaymentsLab-KMP, Doori, Gaddi), network and on-device AI (both in Candidai), security (PaymentsLab-KMP) and Doori's own operation-log offline-outbox. Still finding a first consumer: typed Result, device-integrity, a screen-state store (ScreenState/DecisionEngine, a different module from Doori's outbox), settings, app-shell, llm-chat and a secrets vault pattern, plus bots-policy, the generic ISMCTS search shell Gaddi's own AI engine is actually built from. It is the smaller of the two contracts described in the shared-foundation write-up: the tiny (State, Event) → Effects mvi-core base four apps build their reducer/store layer on.",
        },
        {
          heading: "kmp-build-logic: the setup written once",
          body: "17 convention plugins live in this repo (22 authored across the whole family). AGP, Kotlin, Compose, test, lint, Firebase, Room and Koin configuration for a module is one line (apply the plugin) instead of a build.gradle.kts a new module has to get right from scratch. This is the other half of the shared foundation: the composite build every consumer app pulls in for its module wiring.",
        },
        {
          heading: "kmp-app-template: the shape a new app starts from",
          body: "The third repo is the app shape the toolkit and build logic slot into: one shared Compose UI, a wired Splash → Login → Home nav scaffold, thin Android and Desktop shells, and a customizer.sh script that renames the whole project in one command. A new app starts at \"write the feature\", not at \"stand up the module graph\".",
        },
        {
          heading: "The composition is the proof",
          body: "Doori consumes 10 of its 46 modules from the toolkit; PaymentsLab-KMP consumes 25 of its 40; Candidai and Gaddi draw on the same foundation. This portfolio's own Compose Multiplatform twin is built on kmp-app-template too, which is the reason that project's write-up can say the template carries a real four-target app rather than a hello-world, the same claim this family makes about itself, checked by a fifth independent consumer.",
        },
        {
          heading: "One MVI contract, four apps",
          body: "Doori, PaymentsLab-KMP, Candidai and Gaddi are not four isolated demos: they share a build-wiring contract and a unidirectional-state contract, both written once in this family and pulled in as composite builds rather than re-derived per app. The discipline the toolkit exists to enforce is exactly what a platform team is supposed to bring to a codebase at scale: one seam, reused, instead of the same decision made differently four times.",
        },
      ],
      metrics: [
        { value: "36", label: "modules · kmp-toolkit" },
        { value: "17", label: "convention plugins here · 22 across the family" },
        { value: "5", label: "repos vendoring this family" },
        { value: "19", label: "gateway providers behind one abstraction" },
      ],
      techStack: [
        { group: "kmp-toolkit", items: ["typed Result", "MVI ViewModel core (State, Event) → Effects", "network + security", "on-device AI seam", "device-integrity", "operation-log offline-outbox (Doori)", "screen-state store (ScreenState/DecisionEngine, no consumer app yet)", "settings", "app-shell", "llm-chat", "secrets vault pattern", "bots-policy (Gaddi's ISMCTS shell)", "19-provider payment-gateway abstraction"] },
        { group: "kmp-build-logic", items: ["AGP", "Kotlin", "Compose", "test + lint", "Firebase", "Room", "Koin"] },
        { group: "kmp-app-template", items: ["Shared Compose UI", "Splash → Login → Home nav scaffold", "Android + Desktop shells", "customizer.sh"] },
        { group: "Distribution", items: ["Gradle includeBuild", "MIT license"] },
      ],
      diagrams: [
        {
          title: "Three repos, one seam each",
          code: `graph LR
  bl["kmp-build-logic<br/>17 plugins"] -.->|"includeBuild"| m["Doori"]
  bl -.->|"includeBuild"| p["PaymentsLab-KMP"]
  bl -.->|"includeBuild"| c["Candidai"]
  bl -.->|"includeBuild"| ku["Gaddi"]
  tk["kmp-toolkit<br/>39 modules"] -.->|"includeBuild"| m
  tk -.->|"includeBuild"| p
  tk -.->|"includeBuild"| c
  tk -.->|"includeBuild"| ku
  at["kmp-app-template"] -.->|"scaffold"| cv["cv-siddharth-kmp"]`,
        },
      ],
    },
  },
  {
    slug: "the-loopdown",
    name: "The Loopdown",
    tagline: "Field notes from an engineer who writes: one war story, four channels, one branded card.",
    description:
      "A dev-content engine and writing archive. A lesson pulled from a real project is written once and adapted to LinkedIn, dev.to, Hashnode and Medium, each with a generated branded graphic, plus the consolidated back catalogue.",
    stack: ["Node.js", "Markdown", "SVG generation", "Voice-profile linting"],
    highlights: [
      "One lesson in, four channel-shaped posts out, each with a branded SVG card. The adaptation is the product, not the writing.",
      "A voice profile derived from the existing archive, enforced by a lint step, so the generated drafts do not read like a language model wrote them.",
      `Framed as an engineer stuck in a time loop filing field notes on the same lying systems each pass, with a recurring cast (${titleize(castByAppearances[0]?.id)} and more) tracked in a living bestiary.`,
      "Public/private split by construction: the engine and the published posts are tracked, drafts and personal notes are gitignored.",
    ],
    links: [{ label: "GitHub", url: "https://github.com/darkpandawarrior/the-loopdown" }],
    status: "Active · public",
    badges: ["Node.js", "Content engine", "Open source"],
    detail: {
      overview:
        `The Loopdown is the writing side of the same discipline the rest of this site argues for: a lesson is pulled from a real production incident, written once, and adapted, never re-derived from scratch, for every place it will be read. ${lessons.length} lessons across ${writing.series.length} series sit alongside a ${writing.archive.length}-piece back catalogue from before the code, all versioned in one repo with the same public/private split a codebase gets: the engine and what's published are tracked, drafts and personal notes are gitignored.`,
      sections: [
        {
          heading: "One lesson, four channel-shaped posts",
          body: "A lesson is written once and adapted to LinkedIn, dev.to, Hashnode and Medium, each with its own generated branded SVG card. The adaptation is the product, not the writing. A dev.to post reads like a dev.to post and a LinkedIn post reads like a LinkedIn post, from the same source material.",
        },
        {
          heading: "Field notes tied to a real production win",
          body: "Every series traces back to a specific piece of shipped work, not a generic topic: \"Sensors Who Lie\" is field notes from Doori's location engine, \"The Coroutine Court\" from the −80% crash-reduction work, \"The Night Shift\" from the 50%→95% GPS accuracy work, \"Ghosts in the Recomposition\" from the ~87% Compose migration, and \"One Brain, Two Bodies\" from PaymentsLab-KMP's expect/actual split across targets. The writing has somewhere real to point back to.",
        },
        {
          heading: "Series and lessons",
          body: `"${seriesByLength[0]?.title}" runs longest at ${seriesByLength[0]?.episodes} episodes; "${seriesByLength[1]?.title}" runs ${seriesByLength[1]?.episodes}; the rest are shorter. By pillar, ${lessonsByPillar[0]?.[0]} carries the most lessons (${lessonsByPillar[0]?.[1]} of ${lessons.length}): Kalman-filtered sensors and Room migrations produce more "the data lied to you and here's the invariant that catches it" moments than any other pillar the archive covers.`,
        },
        {
          heading: "A voice profile enforced by a lint step",
          body: "The generated drafts are checked against a voice profile derived from the existing archive rather than trusted on read. A lint step, not a style guide nobody reads, so a draft that sounds like a language model wrote it fails before it reaches a channel.",
        },
        {
          heading: "Written, adapted, mostly still queued",
          body: `${lessons.length - published.length} of the ${lessons.length} lessons are drafted and channel-adapted (status: ready). Actually out across all four channels so far: ${published.length}, "${published[0]?.title}", from the ${published[0]?.series} series. The engine is built to produce four-channel output per lesson; the publishing backlog is the honest, unfinished part.`,
        },
        {
          heading: `The archive: ${writing.archive.length} pieces from before the code`,
          body: `A consolidated back catalogue from Books Before Bros, the original blog: campus lore and short fiction predating the engineering work, ${archiveByForm["short-fiction"] ?? 0} pieces of short fiction, ${archiveByForm.essay ?? 0} essays and ${archiveByForm.humor ?? 0} humor pieces, kept in the same repo as the lessons rather than left to rot on an old WordPress install.`,
        },
        {
          heading: "Framed as a time loop",
          body: "The whole archive is framed as an engineer stuck in a time loop, filing field notes on the same lying systems each pass: the sensor that reports a position it cannot back up, the coroutine that outlives the screen that launched it. The conceit gives every lesson the same voice without flattening what each one is actually about.",
        },
        {
          heading: "A recurring cast, tracked in a bestiary",
          body: `Each recurring character personifies one failure mode rather than one lesson, so continuity builds across entries instead of resetting every post: ${titleize(castByAppearances[0]?.id)} (GPS, or any sensor that reports with total confidence and zero reliability) leads the bestiary at ${castByAppearances[0]?.appearances} tracked appearances, alongside The Archivist (provenance and the audit trail), Doze the Jailer (Android's background-execution limits) and The Messenger (CancellationException, forever mistaken for an assassin). A living bestiary indexes who's appeared and who's still waiting in the wings, the same continuity discipline a codebase gets from a changelog.`,
        },
      ],
      metrics: [
        { value: String(lessons.length), label: `lessons · ${writing.series.length} series` },
        { value: "4", label: "channels per lesson · dev.to, LinkedIn, Medium, Hashnode" },
        { value: String(writing.archive.length), label: "archive pieces · from before the code" },
        { value: String(published.length), label: "lesson published across all four channels so far" },
      ],
      techStack: [
        { group: "Engine", items: ["Node.js", "Markdown", "SVG generation (branded cards)", "Voice-profile lint"] },
        { group: "Channels", items: ["dev.to", "LinkedIn", "Medium", "Hashnode"] },
        { group: "Repo hygiene", items: ["Public engine + published posts tracked", "Drafts + personal notes gitignored"] },
      ],
    },
  },
];

/**
 * The one place a slug becomes a project. Used by every surface that takes a
 * slug from something outside the code — the chat's `[[project:<slug>]]`
 * directive and the console's `/open <slug>` — so an invented, hallucinated or
 * injected slug resolves to `undefined` and renders nothing, rather than each
 * caller re-implementing the check.
 */
export function projectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

// ── Shared foundation ─────────────────────────────────────────────────────
// Two of my own KMP libraries that both Doori and PaymentsLab-KMP consume as
// composite builds — the "systems engineering" thread that ties the apps
// together. Verified in each app's settings.gradle.kts.
export interface SharedLib {
  name: string;
  url: string;
  role: string;
  usedBy: string[];
}

export const sharedFoundation: {
  blurb: string;
  libs: SharedLib[];
} = {
  blurb:
    "Doori, PaymentsLab-KMP, Candidai and Gaddi aren't four isolated demos. They're four KMP apps sitting on a common foundation I built and maintain separately. All four pull in my own convention-plugin and MVI-base libraries as composite builds, so the build wiring and the unidirectional-state contract are written once and reused, exactly the platform discipline I bring to a codebase at scale.",
  libs: [
    {
      name: "kmp-build-logic",
      url: "https://github.com/darkpandawarrior/kmp-build-logic",
      role: "Gradle convention plugins: one place that configures every KMP module's targets, Compose, lint and test wiring.",
      usedBy: ["Doori", "PaymentsLab-KMP", "Candidai", "Gaddi"],
    },
    {
      name: "kmp-toolkit",
      url: "https://github.com/darkpandawarrior/kmp-toolkit",
      role: "A vendored KMP toolkit: the tiny (State, Event) → Effects mvi-core base (the reducer/store contract the payment state machine is built on), plus shared feedback/common modules.",
      usedBy: ["Doori", "PaymentsLab-KMP", "Candidai", "Gaddi"],
    },
  ],
};

export interface Contribution {
  repo: string;
  title: string;
  url: string;
  status: "merged" | "open" | "closed";
  date: string;
}

// Real public open-source contributions — merged PRs to career-ops, a public OSS project.
// See https://github.com/career-ops-hq/career-ops/pulls?q=author%3Adarkpandawarrior
/**
 * Merged PRs upstream, as the live GitHub search reports it.
 *
 * NOT openSource.length. That array is a CURATED subset — 17 entries against
 * 18 merged — and hiresignalNumbers.test.ts documents shorter as expected.
 * ResumeView used the array length and so printed 17 while every other
 * surface on the site said 18, which is the kind of one-off disagreement a
 * reader notices and an owner never does.
 *
 * Refreshed by scripts/gen-hiresignal-stats.mjs alongside the nine other
 * places this number appears.
 */
export const upstreamMergedPRs = 24;

export const openSource: Contribution[] = [
  { repo: "career-ops-hq/career-ops", title: "fix(deps): make js-yaml imports work on both 4.x and 5.x", url: "https://github.com/career-ops-hq/career-ops/pull/2656", status: "merged", date: "2026-08-12" },
  { repo: "career-ops-hq/career-ops", title: "fix(scan): take the shared lock for scan-history.tsv appends", url: "https://github.com/career-ops-hq/career-ops/pull/2639", status: "merged", date: "2026-08-12" },
  { repo: "career-ops-hq/career-ops", title: "fix(agent-inbox): concurrent adds silently dropped queued requests", url: "https://github.com/career-ops-hq/career-ops/pull/2614", status: "merged", date: "2026-08-12" },
  { repo: "career-ops-hq/career-ops", title: "fix(liveness): a rate-limited posting was classified expired, not uncertain", url: "https://github.com/career-ops-hq/career-ops/pull/2613", status: "merged", date: "2026-08-12" },
  { repo: "career-ops-hq/career-ops", title: "fix(cv-facts): a k/M/B magnitude suffix let an inflated claim past the gate", url: "https://github.com/career-ops-hq/career-ops/pull/2612", status: "merged", date: "2026-08-12" },
  { repo: "career-ops-hq/career-ops", title: "feat(rank): opt-in LLM relevance re-ranker for pipeline.md", url: "https://github.com/career-ops-hq/career-ops/pull/2579", status: "merged", date: "2026-08-12" },
  { repo: "career-ops-hq/career-ops", title: "fix(cv): Korean and Traditional Chinese CVs had no font rule", url: "https://github.com/career-ops-hq/career-ops/pull/2616", status: "merged", date: "2026-08-11" },
  { repo: "career-ops-hq/career-ops", title: "fix(states): aliases the engine accepts were missing from states.yml", url: "https://github.com/career-ops-hq/career-ops/pull/2615", status: "merged", date: "2026-08-11" },
  { repo: "career-ops-hq/career-ops", title: "fix(web): states.yml cached for the process lifetime, so core updates go unseen", url: "https://github.com/career-ops-hq/career-ops/pull/2590", status: "merged", date: "2026-08-07" },
  { repo: "career-ops-hq/career-ops", title: "fix(scan): --company/--posted-after/--posted-before ignored in =value form", url: "https://github.com/career-ops-hq/career-ops/pull/2589", status: "merged", date: "2026-08-07" },
  { repo: "career-ops-hq/career-ops", title: "fix(cv): $-patterns in candidate text splice the template into the CV", url: "https://github.com/career-ops-hq/career-ops/pull/2588", status: "merged", date: "2026-08-07" },
  { repo: "career-ops-hq/career-ops", title: "fix(dedup): distinct non-Latin companies merged into one, deleting a row", url: "https://github.com/career-ops-hq/career-ops/pull/2587", status: "merged", date: "2026-08-07" },
  { repo: "career-ops-hq/career-ops", title: "fix(cover): a custom template's unfilled {{TOKEN}} shipped into the letter", url: "https://github.com/career-ops-hq/career-ops/pull/2586", status: "merged", date: "2026-08-07" },
  { repo: "career-ops-hq/career-ops", title: "feat(agent-inbox): queue requests for the next session", url: "https://github.com/career-ops-hq/career-ops/pull/1472", status: "merged", date: "2026-07-03" },
  { repo: "career-ops-hq/career-ops", title: "fix(dashboard): rewrite only the Status cell on status update", url: "https://github.com/career-ops-hq/career-ops/pull/1186", status: "merged", date: "2026-06-23" },
  { repo: "career-ops-hq/career-ops", title: "feat(providers): add Breezy HR provider", url: "https://github.com/career-ops-hq/career-ops/pull/1185", status: "merged", date: "2026-06-23" },
  { repo: "career-ops-hq/career-ops", title: "feat(providers): add BambooHR provider", url: "https://github.com/career-ops-hq/career-ops/pull/1141", status: "merged", date: "2026-06-20" },
];

export interface GrowthItem {
  date: string;
  title: string;
  detail: string;
}

// Recent shipping timeline — "what I've built in the last few weeks".
export const recentGrowth: GrowthItem[] = [
  { date: "Jun 2026", title: "Kursi (now Gaddi) shipped", detail: "Full Kotlin Multiplatform social-deduction game across Android, iOS, desktop and web. Deterministic engine + ISMCTS AI." },
  { date: "Jun - Aug 2026", title: "career-ops: public OSS contributions", detail: `24 merged PRs to the public career-ops project (⭐${upstreamStars}): ATS providers (BambooHR, Breezy HR), an opt-in LLM relevance re-ranker, an agent-inbox feature, and a run of correctness fixes covering silent data loss on non-Latin company names, a $-pattern splicing the template into a generated CV, a date filter ignored in its =value form, a concurrency race that dropped queued requests, and an unlocked append to shared scan history.` },
  { date: "Jun 2026", title: "Mileway (now Doori): five platforms", detail: "Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, plus Glance/WidgetKit widgets and an iOS Live Activity. 159 Roborazzi tests green." },
  { date: "Jul 2026", title: "Mileway: offline AI + policy engine", detail: "Retrieval-grounded chat over local data with voice I/O, a reimbursement-rate policy engine and a durable submit-outbox, offline-first with a real backend opt-in." },
  { date: "Jul 2026", title: "PaymentsLab (now PaymentsLab-KMP): 5 rails + 66 gateways", detail: "40-module KMP payments lab: payouts, mandates, card vault, marketplace Connect and a double-entry wallet ledger beyond one-shot pay-in, all MOCK_MODE-honest." },
  { date: "Jul 2026", title: "Shared KMP foundation", detail: "Extracted kmp-build-logic (convention plugins) and kmp-toolkit (MVI base) as my own libraries, consumed by Mileway and PaymentsLab as composite builds." },
  { date: "Jul 2026", title: "Mileway: super-profile & plugin platform (V24)", detail: "A plugin-composition registry (TILE/CAPABILITY/VALUE, FORCED>USER>PRESET>DEFAULT layering) driving four persona presets, plus delegation, verification, growth, membership and wallet/payout depth. Shipped, with a V25→V37 series (on-device intelligence, JWT auth, closeout hardening, home cards/advances, What's New) landed on top." },
  { date: "Aug 2026", title: "Portfolio: the fleet made checkable", detail: `New /shipped page: ${fleetStats.live} live listings plus ${fleetStats.delisted} delisted ones recovered via the Internet Archive, ${fleetStats.live + fleetStats.delisted} apps traced across ${fleetStats.branches.toLocaleString("en-US")} branches of the Jugnoo white-label platform, verified one store listing at a time instead of asserted.` },
  { date: "Aug 2026", title: "Portfolio: the anthology and The Board, published", detail: "New /ink surfaces: the Morkinstar Journals anthology across four seasons (The Directory, The Ninety-One Pages, The Kindling, The Standing Charge) plus a starmap, and The Board, seven years of forum games, mined and republished." },
];

/* ── Card thumbnails ──────────────────────────────────────────────────────
 * One thumbnail per project, from the daily-synced media. Lives here (not in
 * App.tsx, where it started) because two renderers need the same picture: the
 * home-page project grid and the AI assistant's inline project card
 * (src/ChatWidgets.tsx) — a second hand-maintained map is how thumbnails drift.
 */
/**
 * The banner each project card shows — authored, not screenshotted.
 *
 * Generated by scripts/gen-project-heroes.mjs from this same file's data, in
 * each project's own `theme` palette. Two rounds of trying to make screenshots
 * work here established why they can't:
 *
 *   1. Animated GIFs made the card a player. It showed whichever frame the loop
 *      landed on — multiplatform.gif is 108 frames across phone, watch and
 *      widgets, and 3 of 4 sampled frames rendered as a near-black watch face
 *      or empty space. paymentslab-kmp's checkout GIF opened on its FLAG_SECURE
 *      "screenshots blocked" screen: a great security story, a terrible
 *      thumbnail.
 *   2. Static screenshots fixed the randomness but not the shape. A tall phone
 *      screen seen through a ~2.7:1 band is one arbitrary horizontal slice, and
 *      the best available slice was still a Coverage table or an empty chart
 *      region — pixels that say nothing about what the project is. Two of the
 *      products are also light-themed, so they fought the dark page whatever
 *      the crop.
 *
 * A hero is correct by construction: right aspect, right palette, and it
 * carries the facts that earn attention (46 modules, 5 platforms, 66 gateways)
 * instead of whatever the app happened to be rendering. No focal point is
 * needed any more — the image IS the card's shape.
 *
 * `src` is the ORIGINAL raster; Picture derives the .avif/.webp siblings, so
 * pointing this at an .avif directly would break that chain.
 *
 * DERIVED, not hand-kept. This was a literal map of six slugs while
 * gen-project-heroes.mjs rendered a banner for every project in the registry,
 * so `kmp-family` and `the-loopdown` had heroes sitting on disk and cards that
 * rendered without one — two of eight cards visibly shorter than their
 * neighbours for no reason a reader could see. Deriving it from `projects` is
 * the same fix applied to the service worker's bypass list and vercel.json's
 * cache rules: the shape is known, so nothing has to remember to update a
 * second list. Guarded by cardMedia.test.ts.
 */
export const cardMedia: Record<string, { src: string; alt: string }> = Object.fromEntries(
  projects.map((p) => [
    p.slug,
    {
      src: `/projects/_heroes/${p.slug}.png`,
      // The status line already reads "46 modules · 5 platforms · 159 tests";
      // it is the same sentence this alt text used to hand-write per project,
      // and it cannot go stale against the card beside it.
      alt: `${p.name}: ${p.status}`,
    },
  ]),
);

/* ── The site's own interactive surfaces ──────────────────────────────────
 * MOVED to src/data/surfaces.ts, which is now the single registry of every
 * navigable route — rooms and ordinary pages alike. The split that used to
 * live here (rooms in profile.ts, everything else in routeHead.ts's NON_ROOM)
 * is exactly what let nine finished routes go unlinked from the homepage.
 *
 * Re-exported so the eleven existing importers keep compiling unchanged.
 */
export { siteRooms, type Surface, type Surface as SiteRoom } from "./surfaces.ts";
