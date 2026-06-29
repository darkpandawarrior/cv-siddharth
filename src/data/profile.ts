export const profile = {
  name: "Siddharth Pandalai",
  title: "Senior Android Engineer",
  resumeTitle: "Senior Android Engineer — Mobile Architecture & Platform",
  tagline: "I take Android apps from prototype to platform.",
  location: "Pune, India",
  email: "siddharthpandalai990@gmail.com",
  phone: "+91 8848852062",
  github: "https://github.com/darkpandawarrior",
  linkedin: "https://linkedin.com/in/siddharth-pandalai-3712b215a",
  portfolio: "https://darkpandawarrior.github.io/cv-siddharth",
  availability: "Notice period: 15 days · Open to remote (worldwide / India) and hybrid in Pune / Bengaluru",
  // Casual blurb shown on the portfolio homepage hero
  intro:
    "5+ years building production Android. Platform owner of a 738k-LOC, 92%-Compose financial SaaS app serving 50,000+ monthly users. I care about the unglamorous engineering that makes apps feel reliable: location accuracy, crash-free sessions, and architecture a team can move fast in.",
  // Formal summary shown on the résumé view (ATS-friendly, keyword-dense)
  summary:
    "Senior Android Engineer with 5+ years building and scaling production Android applications in Kotlin for enterprise SaaS — platform owner of a 738k-line, 50,000+ MAU financial Android app. Expert in Jetpack Compose migration (92% coverage), Clean Architecture with MVVM/MVI, Kotlin Coroutines and Flow, and Hilt dependency injection. Deep hard-systems experience: sensor-fusion location engineering (GPS accuracy 50% to 95%), on-device security (SQLCipher, Android Keystore, SSL pinning with build flavors), and an 80% production crash reduction (Firebase Crashlytics + Sentry observability) across 22,000+ DAU.",
};

export const education = {
  school: "NIT Bhopal (MANIT)",
  degree: "B.Tech, Computer Science & Engineering",
  period: "2017 — 2021",
};

export const metrics = [
  { value: "50k+", label: "monthly active users", detail: "22k+ daily, platform owner at Dice.tech" },
  { value: "95%", label: "GPS accuracy", detail: "up from 50% — predictive dead reckoning" },
  { value: "80%", label: "crash reduction", detail: "Crashlytics + structured concurrency fixes" },
  { value: "92%", label: "Jetpack Compose", detail: "of a 738k LOC app, zero regressions" },
];

// Core competency chips — shown in the résumé header and on LinkedIn
export const competencies = [
  "Kotlin & Jetpack Compose",
  "Clean Architecture (MVVM / MVI)",
  "Kotlin Coroutines & Flow",
  "Hilt Dependency Injection",
  "Room & Offline Storage",
  "Location Engineering & Sensor Fusion",
  "Mobile Security (Keystore, SQLCipher)",
  "CI/CD (Fastlane, Gradle)",
];

export interface ExperiencePoint {
  label?: string;
  text: string;
}

export interface Experience {
  company: string;
  role: string;
  period: string;
  points: ExperiencePoint[];
}

export const experience: Experience[] = [
  {
    company: "Dice.tech",
    role: "SDE-2, Android & Product Owner",
    period: "Jun 2023 — Present",
    points: [
      {
        label: "Technical Leadership",
        text: "Led Android architecture decisions and platform modernization across a 738k-LOC Kotlin codebase; set team-wide standards for Clean Architecture (MVVM/MVI, repository pattern, single immutable UiState with StateFlow).",
      },
      {
        label: "Architectural Modernization",
        text: "Led the migration of legacy Java/XML code to 92% Jetpack Compose (Material 3, Compose-View interop) with zero regressions; shipped mission-critical workflows (Expenses, Travel, Invoices) for 50,000+ MAU.",
      },
      {
        label: "Location Platform",
        text: "Built a high-precision location engine for 22,000+ DAU using Predictive Dead Reckoning and sensor fusion (accelerometer + GPS) on a foreground service, with gap-filling for low-connectivity environments — GPS accuracy improved from 50% to 95%.",
      },
      {
        label: "Performance & Stability",
        text: "Reduced production crashes by 80% through structured-concurrency fixes and thread-safety optimization; implemented dual production monitoring with Firebase Crashlytics and Sentry (programmatic init, ProGuard mapping automation, ANR detection, environment-aware trace sampling).",
      },
      {
        label: "Security Engineering",
        text: "Hardened the app to VAPT/banking compliance: SQLCipher + AES-256 Android Keystore, EncryptedSharedPreferences, biometric authentication (BiometricPrompt), and SSL certificate pinning implemented as dual build flavors (pinned/unpinned) — enforced in production, bypassed in debug for proxy tooling.",
      },
      {
        label: "Data Layer",
        text: "Own the Room (SQLite) persistence layer with 16+ production schema migrations, DataStore, and offline-resilient sync via WorkManager.",
      },
      {
        label: "Travel Platform (Trip V2)",
        text: "Shipped the Android side of a comprehensive Trip V2 overhaul: mileage submission linked to Trip V2 + Itinerary V2, GIN (Goods Issue Notes) screens, approval re-entry guards, and full Mixpanel analytics instrumentation across the SavedTracks mileage ecosystem.",
      },
      {
        label: "UI Platform",
        text: "Designed a reusable Dynamic Theme Engine for client-level branding, reducing UI development friction by 60%.",
      },
      {
        label: "CI/CD & Automation",
        text: "Automated build, signing, and Play Store releases with Fastlane; upgraded to AGP 9.0 with Gradle KTS for faster incremental builds; built agentic development workflows (Firebender, MCP) to rapidly generate MVPs.",
      },
      {
        label: "Product Growth",
        text: "Introduced intelligent in-app review flows, increasing Play Store ratings by 85% and multiplying user reviews by 80x.",
      },
    ],
  },
  {
    company: "Jugnoo / Tookan / Jungleworks",
    role: "Software Engineer, Android & Vertical Owner",
    period: "Jan 2021 — May 2023",
    points: [
      { text: "Owned Android development across multi-tenant SaaS platforms for customer, driver, and merchant applications." },
      { text: "Built modular, reusable white-label app templates that cut delivery time by 80% for 20+ clients." },
      { text: "Refactored core modules and REST API integrations (Retrofit, OkHttp), integrating secure payment gateways across distributed services." },
      { text: "Unified P2P Carpool and Trucking verticals into a single super-app platform, simplifying user flows and increasing engagement." },
      { text: "Collaborated on roadmaps with product and backend teams, reducing engineering overhead by 40%." },
    ],
  },
  {
    company: "John Deere India",
    role: "GET Intern",
    period: "May — Jul 2020",
    points: [
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
    slug: "mileway",
    title: "Mileway — offline-first mileage tracker (Android · iOS · Wear OS)",
    metric: "23 modules · iOS live (V19)",
    summary:
      "An open-source app I designed and built end-to-end: mileage, travel & expense tracking that runs entirely offline across Android, iOS and Wear OS from one shared Kotlin codebase. V19 milestone: iOS is now fully functional.",
    problem:
      "I wanted a clean, inspectable reference for the architecture I advocate for at scale — Compose Multiplatform, strict module isolation, MVI state and a real location engine — built with zero backend so the whole thing is reproducible and reviewable by anyone.",
    approach: [
      "23-module clean architecture: 11 feature modules that never depend on each other, meeting only at the :app composition root, wired with Koin.",
      "Shared commonMain core — design system, Room (KMP) + DataStore, all check-in and hardware-event screens migrated to commonMain — running live on Android, iOS (V19: full gate green) and Wear OS.",
      "iOS background scheduling via kmpworkmanager (dev.brewkits), replacing a custom BackgroundTask layer; AppDelegate integration + BGTask dispatcher make background trip tracking work natively on iOS.",
      "A location pipeline that treats GPS as a noisy signal: jitter suppression, spike detection, four-bucket distance accounting and accelerometer fusion, with a deterministic simulated-drive source so the whole engine is unit-testable without hardware.",
      "Dual gms / noGms distribution (Google Play + F-Droid) with a dependency-guard that fails the build if proprietary libraries leak into the FOSS flavor.",
      "Quality gates: 96 Roborazzi screenshot tests on the JVM (no emulator, no network), Napier structured logging, detekt, ktlint, Kover and CI.",
    ],
    outcome:
      "V19 milestone complete — iOS and Android build, run, and pass all quality gates from one shared Kotlin codebase. Explore the app, architecture diagrams and all 96 rendered screens at github.com/darkpandawarrior/MileTrackerDemo.",
    tags: ["Kotlin Multiplatform", "Compose Multiplatform", "iOS · Android · Wear OS", "23 modules", "Open source"],
  },
  {
    slug: "gps-accuracy",
    title: "GPS accuracy from 50% to 95%",
    metric: "50% → 95%",
    summary: "Predictive dead reckoning for a mileage-tracking app whose raw GPS was wrong half the time.",
    problem:
      "Field users' trip distances were off by large margins: urban canyons, tunnels, and OEM-throttled location updates meant raw GPS fixes were unusable for billing-grade mileage.",
    approach: [
      "Sensor fusion of accelerometer and GPS to estimate position between fixes (predictive dead reckoning).",
      "Spike detection to reject physically impossible fixes before they corrupted the track, with gap-filling for low-connectivity stretches.",
      "Foreground service with a floating bubble UI to survive OEM battery restrictions and keep users informed.",
    ],
    outcome: "Tracking accuracy went from ~50% to 95%, making mileage reliable enough for expense reimbursement.",
    tags: ["Location", "Sensor fusion", "Foreground services"],
  },
  {
    slug: "crash-reduction",
    title: "80% crash reduction at 50k MAU",
    metric: "-80% crashes",
    summary: "Systematic triage with Crashlytics turned a noisy crash feed into a fixable backlog.",
    problem:
      "A fast-growing 738k LOC app had a crash rate that hurt the Play Store rating, with the worst offenders being intermittent threading bugs nobody could reproduce.",
    approach: [
      "Crash clustering to separate symptom from cause — dozens of distinct stack traces collapsed into a handful of root bugs.",
      "Breadcrumb instrumentation to reconstruct the user journey before each crash.",
      "Targeted hunts for concurrency bugs: main-thread violations, race conditions in coroutine scopes, lifecycle leaks.",
    ],
    outcome: "Crashes down 80%; Play Store rating up 85% with 80x more reviews.",
    tags: ["Crashlytics", "Structured concurrency", "Coroutines"],
  },
  {
    slug: "compose-migration",
    title: "92% Compose migration + theme engine",
    metric: "92% Compose",
    summary: "Migrated a 738k-LOC app to Jetpack Compose with zero regressions and built a theme engine the whole team ships on.",
    problem:
      "XML views made every UI change slow and inconsistent, and the design team's theming requests required touching dozens of files.",
    approach: [
      "Incremental migration via interop — Expenses, Travel, and Invoices kept shipping while screens moved to Compose.",
      "MVI-style single UiState per screen with StateFlow and collectAsStateWithLifecycle.",
      "Dynamic Theme Engine on CompositionLocal so brand and design tokens change in one place.",
      "Compose compiler metrics to keep recomposition under control as the codebase grew.",
    ],
    outcome: "92% of UI in Compose with zero regressions; UI development friction down 60%.",
    tags: ["Jetpack Compose", "MVI", "Design systems"],
  },
  {
    slug: "white-label",
    title: "20+ white-label apps, 80% faster",
    metric: "80% faster delivery",
    summary: "A configuration-driven pipeline that turned weeks of per-client Android work into days.",
    problem:
      "Every new white-label client at Jugnoo meant manually forking, rebranding, and re-releasing the app — weeks of error-prone work per client.",
    approach: [
      "Configuration-driven theming and feature flags so one codebase served every client.",
      "Build automation for per-client signing, assets, and Play Store packaging.",
    ],
    outcome: "20+ client apps shipped with delivery time cut by 80%.",
    tags: ["Build systems", "Multi-tenant", "Automation"],
  },
];

export const languages = ["Kotlin", "Java", "Dart", "C++"];

// 4-group layout for portfolio homepage skill cards
export const skills: { group: string; items: string[] }[] = [
  {
    group: "UI & Architecture",
    items: ["Jetpack Compose + Material 3", "MVVM + Clean Architecture", "MVI / single UiState", "Compose Multiplatform", "Dynamic theme engines"],
  },
  {
    group: "Concurrency & Data",
    items: ["Kotlin Coroutines", "Flow / StateFlow / SharedFlow", "Room (SQLite, 15+ migrations)", "DataStore + WorkManager", "Retrofit + OkHttp"],
  },
  {
    group: "Platform & Systems",
    items: ["Android SDK", "Location engineering + sensor fusion", "Foreground services", "Hilt / Dagger", "Firebase Crashlytics + Sentry + Mixpanel"],
  },
  {
    group: "Security & Ops",
    items: ["SQLCipher + Android Keystore (AES-256)", "SSL pinning (OkHttp CertificatePinner)", "BiometricPrompt", "Fastlane CI/CD · AGP 9 · Gradle KTS", "Agentic workflows (Firebender, MCP)"],
  },
];

// Granular 7-group layout for the résumé view — matches PDF structure for ATS coverage
export const resumeSkills: { group: string; items: string[] }[] = [
  {
    group: "UI",
    items: ["Jetpack Compose (92% production coverage)", "Material 3", "Compose-View interop", "Compose Multiplatform"],
  },
  {
    group: "Architecture",
    items: ["Clean Architecture", "MVVM", "MVI", "Modular architecture", "Repository pattern", "Kotlin Multiplatform (KMP — building depth)"],
  },
  {
    group: "Concurrency & DI",
    items: ["Kotlin Coroutines", "Flow", "StateFlow / SharedFlow", "Structured concurrency", "Hilt", "Dagger"],
  },
  {
    group: "Data & Networking",
    items: ["Room (SQLite, 15+ schema migrations)", "DataStore", "SQLCipher", "Retrofit", "OkHttp", "REST APIs"],
  },
  {
    group: "Platform",
    items: ["Android SDK", "WorkManager", "Foreground Services", "Location / sensor fusion", "Firebase Crashlytics + Sentry", "Mixpanel"],
  },
  {
    group: "Security",
    items: ["Android Keystore (AES-256)", "SSL pinning", "BiometricPrompt", "EncryptedSharedPreferences", "VAPT compliance"],
  },
  {
    group: "Build, CI/CD & Tools",
    items: ["Gradle (Kotlin DSL)", "AGP 9", "Fastlane", "Git", "Play Store release management", "Android Studio", "Jira", "Figma", "Postman", "Firebender + MCP agentic workflows"],
  },
];

// ── Projects & open source ────────────────────────────────────────────────
// Single source of truth for everything I've built outside employer work.
// Rendered on the homepage + résumé and fed to the "Sid" chat assistant.
export interface Project {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  stack: string[];
  highlights: string[];
  links: { label: string; url: string }[];
  status: string;
  badges: string[];
}

export const projects: Project[] = [
  {
    slug: "kursi",
    name: "Kursi",
    tagline: "A Hinglish social-deduction bluffing game of power, satire & second chances — Gaddi kisiki nahi rehti.",
    description:
      "A multiplayer game built as a pure deterministic engine that runs identically on every platform and powers both the AI and a future server. Shipped end-to-end across four targets from one Kotlin codebase.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Android", "iOS", "Desktop", "Web (Wasm)"],
    highlights: [
      "Pure deterministic engine — (GameState, Intent) → GameState with RNG in state, so the same module drives the AI, the UI and a future server.",
      "ISMCTS expert AI: 10 bot personas with distinct aggression, bluff rate and risk tolerance, plus a DARBAR social layer for bot chat and alliances.",
      "Secrecy boundary by design — redact(state, viewer) → PlayerView, two-stream narrative RNG, and byte-for-byte resume of any match.",
      "Bespoke \"License Raj Deco\" identity: teak/brass/cream palette, Rozha One type, Canvas-drawn intaglio role glyphs.",
    ],
    links: [{ label: "GitHub", url: "https://github.com/darkpandawarrior/Kursi" }],
    status: "Shipped Jun 2026 · CC BY-NC-SA 4.0",
    badges: ["Kotlin Multiplatform", "Game engine", "ISMCTS AI"],
  },
  {
    slug: "mileway",
    name: "Mileway",
    tagline: "Offline-first mileage, travel & expense tracker — one Kotlin codebase across Android, iOS & Wear OS.",
    description:
      "An open-source app I designed and built end-to-end as a clean, inspectable reference for the Compose Multiplatform + strict-module architecture I advocate at scale. Zero backend, fully reproducible.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Android", "iOS", "Wear OS", "Room (KMP)", "Koin"],
    highlights: [
      "23-module clean architecture — 11 isolated feature modules meeting only at the :app composition root.",
      "Location engine treats GPS as a noisy signal: jitter suppression, spike detection, four-bucket accounting and accelerometer fusion, unit-testable via a simulated-drive source.",
      "Dual gms / noGms distribution (Play + F-Droid) with a dependency-guard that fails the build if proprietary libs leak into the FOSS flavor.",
      "96 Roborazzi JVM screenshot tests (no emulator, no network); V19 milestone — iOS fully live.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/MileTrackerDemo" },
      { label: "Case study", url: "#work" },
    ],
    status: "V19 · iOS live",
    badges: ["Kotlin Multiplatform", "23 modules", "Open source"],
  },
  {
    slug: "hiresignal",
    name: "HireSignal",
    tagline: "Local-first AI career-intelligence dashboard.",
    description:
      "A local-first job-search engine — resume onboarding, reverse-ATS discovery, evidence-based fit scoring and tailored résumés — built on the open-source career-ops project, which I actively contribute to upstream.",
    stack: ["Node.js", "Vite", "Playwright", "Multi-profile", "23 ATS/board providers"],
    highlights: [
      "Resume onboarding → profile inference → trust-validated job scanning → fit scoring → tailored résumés.",
      "Single-server multi-profile architecture (per-candidate routing) over a strict User/System data contract.",
      "23 ATS & job-board provider integrations via a dynamic, zero-token provider loader.",
      "Contributor upstream — 4 merged PRs including the career-ops 1.14 sync and the dashboard tabs.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/career-ops" },
      { label: "Upstream", url: "https://github.com/kirklazar-android/hiresignal" },
    ],
    status: "Active · 4 PRs merged upstream",
    badges: ["Node.js", "Job-search automation", "Open source"],
  },
  {
    slug: "portfolio",
    name: "This portfolio + “Sid” AI assistant",
    tagline: "The site you're reading — a provider-agnostic LLM chat that answers as me, grounded in my real CV.",
    description:
      "An interactive résumé with a built-in AI assistant. React 19 + Vite + Tailwind on Vercel Edge, with a provider-agnostic chat backend (Groq / Gemini / Claude) and prompt-injection guards.",
    stack: ["React 19", "Vite 7", "Tailwind v4", "Vercel Edge", "Multi-provider LLM"],
    highlights: [
      "3D scroll-driven hero, printable résumé view, and case studies with real production metrics.",
      "Provider-agnostic chat backend — the assistant is grounded in this same source-of-truth profile data.",
    ],
    links: [
      { label: "Live", url: "https://cv-siddharth.vercel.app" },
      { label: "GitHub", url: "https://github.com/darkpandawarrior/cv-siddharth" },
    ],
    status: "Live",
    badges: ["React 19", "Vercel", "LLM chat"],
  },
];

export interface Contribution {
  repo: string;
  title: string;
  url: string;
  status: "merged" | "open" | "closed";
  date: string;
}

export const openSource: Contribution[] = [
  { repo: "kirklazar-android/hiresignal", title: "Port career-ops 1.14 System-Layer updates (trust-validator, providers, evaluators)", url: "https://github.com/kirklazar-android/hiresignal/pull/8", status: "merged", date: "2026-06-29" },
  { repo: "kirklazar-android/hiresignal", title: "Production-grade README — architecture diagram, scoring tables", url: "https://github.com/kirklazar-android/hiresignal/pull/7", status: "merged", date: "2026-06-28" },
  { repo: "kirklazar-android/hiresignal", title: "Profile switcher dropdown with Add-new-profile modal", url: "https://github.com/kirklazar-android/hiresignal/pull/5", status: "merged", date: "2026-06-27" },
  { repo: "kirklazar-android/hiresignal", title: "Dashboard: tracker, coach, console, scanner & profile tabs", url: "https://github.com/kirklazar-android/hiresignal/pull/4", status: "merged", date: "2026-06-27" },
];

export interface GrowthItem {
  date: string;
  title: string;
  detail: string;
}

// Recent shipping timeline — "what I've built in the last few weeks".
export const recentGrowth: GrowthItem[] = [
  { date: "Jun 2026", title: "Kursi shipped", detail: "Full Kotlin Multiplatform social-deduction game across Android, iOS, desktop and web — deterministic engine + ISMCTS AI." },
  { date: "Jun 2026", title: "HireSignal 1.14 + dashboard", detail: "4 merged PRs upstream: 1.14 System-Layer sync, multi-profile switcher, and the tracker/coach/scanner dashboard tabs." },
  { date: "Jun 2026", title: "Mileway V19 — iOS live", detail: "iOS fully functional from the shared codebase; kmpworkmanager background scheduling; 96 Roborazzi tests green." },
  { date: "Jun 2026", title: "Interactive AI portfolio", detail: "Rebuilt this site on React 19 + Vercel Edge with a provider-agnostic “Sid” chat assistant grounded in my CV." },
];
