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
    title: "Mileway — offline-first mileage tracker (Android · iOS · Wear OS · watchOS · Desktop)",
    metric: "28 modules · 5 platforms · offline AI",
    summary:
      "An open-source app I designed and built end-to-end: mileage, travel & expense tracking that runs entirely offline across Android, iOS, Wear OS, watchOS and Compose Desktop from one shared Kotlin codebase. Zero backend — Room + DataStore only — so the whole thing is reproducible and reviewable by anyone.",
    problem:
      "I wanted a clean, inspectable reference for the architecture I advocate for at scale — Compose Multiplatform, strict module isolation, MVI state, a real location engine and a real policy/reimbursement layer — built with zero backend so the whole thing is reproducible and reviewable by anyone.",
    approach: [
      "28-module clean architecture: 11 feature modules that never depend on each other, meeting only at the :app composition root, wired with Koin.",
      "Shared commonMain core — design system, Room (KMP) + DataStore, and every check-in / hardware-event screen — driving Android, iOS, Wear OS, a watchOS SwiftUI app and a Compose Desktop window from one snapshot model.",
      "A location engine that treats GPS as a noisy signal: jitter suppression, spike detection, a four-bucket distance accumulator, IMU (accelerometer) fusion and device-tier-adaptive sampling, with a deterministic simulated-drive source so the whole engine is unit-testable without hardware.",
      "A policy engine that computes reimbursement from configurable per-vehicle rate rules and flags policy violations on approvals — the real logic a live expense platform needs, all local.",
      "A durable submit-outbox: a track/voucher submission is journaled locally and reconciled deterministically, so a kill mid-submit never loses or double-counts a record — the repository already looks one implementation-swap away from a real API.",
      "An on-device AI assistant: retrieval-grounded chat over real local trip/expense/card data, Room-backed history with 5-minute session resume, chunked streaming and on-device speech I/O — no remote LLM, no server.",
      "A super-profile & plugin-composition platform (V24, in progress): a single plugin registry — every tile, capability and tunable value gates through it, resolved by layering FORCED > USER > PRESET > DEFAULT — drives four persona presets (Corporate Commuter, Super-App Consumer, Gig Driver, Minimal Guest) that reshape hubs, auth flows and tracking behaviour from one account, plus act-on-behalf session delegation, a verification centre, growth/membership surfaces and wallet/payout identity.",
      "Dual gms / noGms distribution (Google Play + F-Droid) with a dependency-guard that fails the build if proprietary libraries leak into the FOSS flavor; quality gated by 149 Roborazzi JVM screenshot tests (no emulator, no network), Napier logging, detekt, ktlint, Kover and CI.",
    ],
    outcome:
      "All five targets build, run and pass every quality gate from one shared Kotlin codebase — with a real location engine, a policy/reimbursement layer, a durable submit-outbox, a persona-driven plugin-composition platform and an on-device AI assistant layered on the offline data model. Explore the app, architecture diagrams and all rendered screens at github.com/darkpandawarrior/Mileway.",
    tags: ["Kotlin Multiplatform", "Compose Multiplatform", "Android · iOS · Wear OS · watchOS · Desktop", "28 modules", "Offline AI", "Open source"],
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
  // Optional roster (e.g. Kursi's six roles), rendered as a colour-coded grid.
  roles?: { name: string; power: string; color: string }[];
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
  badges: string[];
  // Optional deep-dive page at /#project/<slug>. Screenshots come from the
  // auto-generated galleries.ts (public/projects/<slug>/screenshots/).
  detail?: ProjectDetailData;
  // Optional curated, captioned screenshot set (filenames under
  // public/projects/<slug>/screenshots/). If present, the carousel uses this
  // instead of the full auto-generated gallery.
  screens?: { file: string; caption: string }[];
  // Optional per-project palette — overrides the site accent on this project's
  // detail page (e.g. Kursi's teak/brass/cream "License Raj Deco" identity).
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
}

export const projects: Project[] = [
  {
    slug: "kursi",
    name: "Kursi",
    tagline: "A Hinglish social-deduction bluffing game of power, satire & second chances — Kursi ke liye kuch bhi karega.",
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
    status: "14 modules · 4 platforms · CC BY-NC-SA 4.0",
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
    icon: "/projects/kursi/brand/kursi-icon.svg",
    detail: {
      overview:
        "Kursi is a Hinglish social-deduction bluffing game set in a satirical India corporate-political underworld where six archetypes scheme for an empty chair — the Gaddi — and everyone is lying about what they hold. The Neta makes promises he'll forget tomorrow, the Bhai owns silence, the Babu approves nothing, the Jugaadu knows a shortcut, the Vakil has read every exception. Satire targets the archetype, never the person. Under the deadpan Hinglish voice (\"सब मिले हुए हैं\") sits a serious engineering exercise: one deterministic Kotlin engine that runs identically on Android, iOS, desktop and the web, and powers the AI, the UI and a server-authoritative backend from the same code.",
      sections: [
        {
          heading: "Deterministic engine",
          body: "The whole game is a pure function: (GameState, Intent) → GameState, with the RNG seed living inside the state. The same module drives single-player, the bots and a future server — and any match can be replayed byte-for-byte from its seed and intent log.",
        },
        {
          heading: "ISMCTS expert AI + DARBAR social layer",
          body: "Bots use Information Set Monte Carlo Tree Search (1.5k–16k iterations depending on difficulty tier) with an optional cloud-LLM upgrade (Anthropic / OpenAI / Gemini). Ten personas each have a personality profile driving targeting and bluff frequency. The DARBAR layer lets bots form alliances, hold grudges and trade Hinglish table-talk across four story arcs — social manipulation that never breaks engine determinism.",
        },
        {
          heading: "Secrecy boundary",
          body: "A hidden-information game needs strict secrecy: redact(state, viewer) → PlayerView guarantees a client only ever sees what its player should. Two independent narrative RNG streams keep flavour separate from game logic.",
        },
        {
          heading: "“License Raj Deco” identity",
          body: "A bespoke visual language — teak/brass/cream palette, Rozha One display type, five Canvas-drawn intaglio role glyphs, and stamped-instrument UI motifs, all behind a full Fastlane + CI pipeline.",
        },
        {
          heading: "Game modes",
          body: "New Game (1v1–1v9, Easy→Grandmaster), a KISSA story campaign, GAUNTLET (Tarakki ki Seedhi — a 5-rung ladder ending in 6-player Grandmaster), TAMASHA (spectate ten AI personas scheme and betray), Team Khel (faction play with un-targetable allies), a Tutorial you can't leave until you catch a bluff, local pass-and-play with a handoff screen guard, and online + LAN multiplayer.",
        },
        {
          heading: "DARBAR — four live story arcs",
          body: "Four narrative arcs run at once, fuelled or suppressed by your chat suggestions: GATHBANDHAN (a quiet coalition — watch who breaks first), AFWAAH (a rumour the table acts on even when false), STING (a leaked claim that forces a read), and BADLA (a vendetta that outlives the round). They run on a separate deterministic narrative RNG that never touches card state and resumes byte-for-byte.",
        },
        {
          heading: "Built for everyone",
          body: "All six roles use the Okabe-Ito colourblind-safe palette plus a unique engraved bezel pattern (ring, hatch, dots, weave, double-rule, ticks) so identity reads without colour. Reduced-motion mode swaps every beat for a bespoke static end-frame (GHOTALA = held stamp, SUPARI = tipped chair) — accessibility never flattens the narrative.",
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
          body: "Seven additive rule variants (Bail Pe Bahar, Bali Khel, Hawala, Adhyadesh, Khazana Raj, Mehengai, Tangi) combine freely and default off — the engine is byte-for-byte unchanged when they're disabled, expanding the surface without touching core logic.",
        },
      ],
      roles: [
        { name: "Netaji Vachan", power: "The Politician — Tax +3 (GHOTALA); blocks Foreign Aid", color: "#0072B2" },
        { name: "Bhai Teja", power: "The Don — Assassinate −3 (SUPARI); unblockable except by the Vakil", color: "#D55E00" },
        { name: "Babu Filewala", power: "The Bureaucrat — Steal 2 (VASOOLI); blocks Steal", color: "#E69F00" },
        { name: "Jugaadu Chhotu", power: "The Fixer — Exchange cards (SETTING); blocks Steal", color: "#56B4E9" },
        { name: "Vakil Loophole", power: "The Lawyer — no action; blocks Assassinate only (power through procedure)", color: "#CC79A7" },
        { name: "Patrakaar", power: "The Journalist — Investigate a card (JAANCH); unblockable", color: "#009E73" },
      ],
      metrics: [
        { value: "4", label: "platforms · one engine" },
        { value: "10", label: "AI bot personas" },
        { value: "6", label: "roles · 4 story arcs" },
        { value: "7", label: "toggle rule variants" },
      ],
      techStack: [
        { group: "Language & UI", items: ["Kotlin 2.4", "Compose Multiplatform 1.11", "Canvas-drawn role glyphs"] },
        { group: "Engine", items: ["Deterministic (GameState, Intent) → GameState", "RNG-in-state", "replay from (seed, intentLog)"] },
        { group: "AI", items: ["ISMCTS (offline)", "Anthropic / OpenAI / Gemini", "on-device Gemini Nano · Apple FoundationModels", "BYOK (encrypted)"] },
        { group: "Online", items: ["Ktor / Netty server", "server-authoritative", "Bonjour/mDNS LAN"] },
        { group: "Platforms", items: ["Android", "iOS (arm64)", "Desktop (JVM)", "Web (Wasm)"] },
        { group: "Build & quality", items: ["Koin", "Fastlane", "CI"] },
      ],
      extraLinks: [
        { label: "README (full rules)", url: "https://github.com/darkpandawarrior/Kursi#readme" },
      ],
      diagrams: [
        {
          title: "Deterministic engine — one pure function",
          code: `graph LR
  s["GameState"] -->|"+ Intent"| r["reduce()<br/>pure · RNG in state"] --> s2["GameState'"]
  s2 -.->|"byte-for-byte replay"| s`,
        },
        {
          title: "Secrecy boundary — redact per viewer",
          code: `graph TD
  full["Full GameState<br/>(authoritative)"] -->|"redact(state, viewer)"| pv1["PlayerView — seat 1"]
  full -->|"redact(state, viewer)"| pv2["PlayerView — seat 2"]
  full -->|"redact(state, viewer)"| pv3["PlayerView — seat N"]`,
        },
      ],
    },
    screens: [
      { file: "home.gif", caption: "Home — live flow" },
      { file: "onboarding.gif", caption: "Onboarding — live flow" },
      { file: "modes.gif", caption: "Game modes — live flow" },
      { file: "turn.gif", caption: "A turn — claim, block, challenge" },
      { file: "darbar.gif", caption: "DARBAR arc — live flow" },
      { file: "coach.gif", caption: "AI coach — live flow" },
      { file: "online.gif", caption: "Online & LAN — live flow" },
      { file: "table_sizes.gif", caption: "Table sizes — 2p to 10p" },
      { file: "career.gif", caption: "Career — live flow" },
      { file: "reference.gif", caption: "In-game reference — live flow" },
      { file: "home.png", caption: "Home — mode grid" },
      { file: "home_ranked.png", caption: "Ranked & daily challenge" },
      { file: "home_mode_gauntlet.png", caption: "Gauntlet mode" },
      { file: "home_mode_story.png", caption: "KISSA story campaign" },
      { file: "setup.png", caption: "Game setup — players" },
      { file: "setup_teams.png", caption: "Team mode setup" },
      { file: "profile_setup.png", caption: "Profile setup" },
      { file: "tutorial_intro.png", caption: "Interactive tutorial" },
      { file: "gazette_roles.png", caption: "Niyam Gazette — the roles" },
      { file: "4p_pick_action.png", caption: "Your turn — pick an action" },
      { file: "4p_confirm.png", caption: "Declare, then confirm" },
      { file: "4p_reaction.png", caption: "Block, challenge or pass" },
      { file: "4p_reaction_block.png", caption: "Block — with odds" },
      { file: "4p_exchange.png", caption: "Card exchange on loss" },
      { file: "4p_pick_target.png", caption: "Target selection" },
      { file: "darbar_table.png", caption: "DARBAR arc at the table" },
      { file: "4p_coach_action.png", caption: "AI coach — suggested action" },
      { file: "4p_coach_reaction.png", caption: "AI coach — reaction" },
      { file: "4p_game_over.png", caption: "Game over — winner revealed" },
      { file: "results.png", caption: "Match results" },
      { file: "review_replay.png", caption: "Byte-for-byte replay" },
      { file: "leaderboard.png", caption: "ELO leaderboard" },
      { file: "career.png", caption: "Career overview" },
    ],
  },
  {
    slug: "mileway",
    name: "Mileway",
    tagline: "Offline-first mileage, travel & expense tracker — one Kotlin codebase across Android, iOS, Wear OS, watchOS & Desktop.",
    description:
      "An open-source app I designed and built end-to-end as a clean, inspectable reference for the Compose Multiplatform + strict-module architecture I advocate at scale. Zero backend (Room + DataStore only), fully reproducible — with a real location engine, a policy/reimbursement layer and a durable submit-outbox.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Android", "iOS", "Wear OS", "watchOS", "Desktop", "Room (KMP)", "Koin"],
    highlights: [
      "28-module clean architecture — 11 isolated feature modules meeting only at the :app composition root; the same shared snapshot model drives phone, watch and desktop.",
      "Location engine treats GPS as a noisy signal: jitter suppression, spike detection, four-bucket distance accounting, IMU fusion and device-tier-adaptive sampling, unit-testable via a deterministic simulated-drive source.",
      "A real policy layer: a reimbursement-rate engine computes payouts from per-vehicle rate rules and flags approval-side policy violations — plus a durable submit-outbox that journals a submission so a mid-submit kill never loses or double-counts it.",
      "Runs on Android, iOS, Wear OS, a watchOS SwiftUI app and Compose Desktop — with home-screen widgets (Glance + WidgetKit) and an iOS Live Activity / Dynamic Island over the same shared snapshot.",
      "Dual gms / noGms distribution (Play + F-Droid) with a dependency-guard; 130+ Roborazzi JVM screenshot tests (no emulator, no network); an on-device, retrieval-grounded AI assistant over local data.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/Mileway" },
      { label: "Case study", url: "#work" },
      { label: "PaymentsLab (sibling KMP app)", url: "#project/paymentslab" },
    ],
    status: "5 platforms · offline AI · 28 modules",
    badges: ["Kotlin Multiplatform", "28 modules", "5 platforms", "Open source"],
    icon: "/projects/mileway/brand/mileway-icon.svg",
    detail: {
      overview:
        "Mileway is an original, fully-offline mileage / travel / expense tracker I designed and built end-to-end in Kotlin & Compose Multiplatform — running on Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, with zero backend so the whole thing is reproducible and reviewable. It's my reference implementation for the architecture I advocate at scale: strict module isolation, a real location engine, a policy/reimbursement layer and a durable submit-outbox, all over local data.",
      sections: [
        {
          heading: "28-module clean architecture",
          body: "Eleven feature modules that never depend on each other, meeting only at the :app composition root and wired with Koin. A shared commonMain core holds the design system, Room (KMP) + DataStore, and every check-in / hardware-event screen, with platform services behind expect/actual. Convention plugins from my own kmp-build-logic keep every module's build consistent.",
        },
        {
          heading: "Location engine",
          body: "GPS is treated as a noisy signal: jitter suppression, spike detection to reject impossible fixes, a four-bucket distance accumulator, IMU (accelerometer) fusion and device-tier-adaptive sampling that trades battery against precision by hardware class. A deterministic simulated-drive source makes the whole engine unit-testable without hardware.",
        },
        {
          heading: "Policy & reimbursement engine",
          body: "A reimbursement-rate engine computes a payout from configurable per-vehicle rate rules, and the approvals flow flags policy violations against those rules — the real expense-platform logic a live product needs, implemented entirely against local data rather than stubbed with a snackbar.",
        },
        {
          heading: "Durable submit-outbox",
          body: "Submitting a track or voucher journals the intent locally and reconciles it deterministically, so a process kill mid-submit never loses a record or double-counts one. Repositories are written to look one implementation-swap away from a real API — the backend is deferred, not designed out.",
        },
        {
          heading: "Five targets, one snapshot model",
          body: "Beyond Android and iOS phones, the same shared SurfaceSnapshot drives a Wear OS app, a watchOS SwiftUI app and a Compose Desktop window, plus Android Glance + iOS WidgetKit home-screen widgets and an iOS Live Activity / Dynamic Island for an in-progress trip. Each surface has its own design-system skinning but reads the identical shared state.",
        },
        {
          heading: "Offline AI assistant",
          body: "A chat assistant grounded entirely in local Room data — trips, expenses, cards — with real chunked streaming (not a fake typing animation), persistent history with a 5-minute session-resume window, on-device speech-to-text/text-to-speech, and local usage analytics. No remote LLM, no server, same offline guarantee as the rest of the app.",
        },
        {
          heading: "Super-profile & plugin-composition platform (V24)",
          body: "The newest depth wave: a single plugin registry is the app's composition mechanism — TILE / CAPABILITY / VALUE plugins resolved by layering FORCED > USER > PRESET > DEFAULT, editable live from a Master Plugin page with source chips. Four persona presets (Corporate Commuter, Super-App Consumer, Gig Driver, Minimal Guest) reshape hubs, auth flows, tracking behaviour and tunables from one account. Built on top: act-on-behalf session delegation with an app-wide \"Acting as\" banner, a verification centre with corporate-email/OTP + card KYC, growth surfaces (referral, coupons, scratch rewards), membership (club, subscriptions, incentives), external wallet linking via OTP, and payout identity (masked bank + editable UPI handle + QR) — still landing, still zero backend.",
        },
        {
          heading: "FOSS-safe distribution & quality gates",
          body: "Dual gms / noGms builds (Google Play + F-Droid) with a dependency-prefix guard that fails the build if proprietary libraries leak into the FOSS flavor. 149 Roborazzi JVM screenshot tests (no emulator, no network) covering phone, watch and desktop, plus Napier logging, detekt, ktlint, Kover and CI.",
        },
      ],
      metrics: [
        { value: "28", label: "Gradle modules" },
        { value: "11", label: "isolated feature modules" },
        { value: "5", label: "platforms · one codebase" },
        { value: "0", label: "backend calls" },
      ],
      techStack: [
        { group: "Language & UI", items: ["Kotlin", "Compose Multiplatform", "Material 3", "SwiftUI (watchOS)"] },
        { group: "Data", items: ["Room (KMP)", "DataStore", "Coroutines + Flow", "Durable submit-outbox"] },
        { group: "Domain", items: ["Location engine (jitter · spike · IMU fusion)", "Reimbursement-rate policy engine"] },
        { group: "DI & build", items: ["Koin", "kmp-build-logic convention plugins", "AGP", "Gradle KTS"] },
        { group: "Maps & platform", items: ["MapLibre (F-Droid)", "KrossMap (Play)", "Glance + WidgetKit widgets", "Live Activity / Dynamic Island"] },
        { group: "Quality", items: ["Roborazzi (149 JVM screenshot tests)", "detekt", "ktlint", "Kover", "CI"] },
      ],
      extraLinks: [
        { label: "Feature modules", url: "https://github.com/darkpandawarrior/Mileway/tree/main/feature" },
        { label: "kmp-build-logic (shared)", url: "https://github.com/darkpandawarrior/kmp-build-logic" },
        { label: "README", url: "https://github.com/darkpandawarrior/Mileway#readme" },
      ],
      videos: [
        { src: "/projects/mileway/video/clipA_home.mp4", caption: "Home & dashboard — live capture" },
      ],
      diagrams: [
        {
          title: "28-module architecture — features meet only at :app",
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
          title: "Location pipeline — GPS treated as a noisy signal",
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
      { file: "track_a_trip.gif", caption: "Track a trip — live flow" },
      { file: "delegation_manager.gif", caption: "Delegation — acting as a manager" },
      { file: "log_and_expense.gif", caption: "Log & expense — live flow" },
      { file: "approvals_payables.gif", caption: "Approvals & payables — live flow" },
      { file: "verification_growth.gif", caption: "Verification & growth — live flow" },
      { file: "membership.gif", caption: "Membership & subscription — live flow" },
      { file: "ai_assistant.gif", caption: "AI assistant — live flow" },
      { file: "onboarding_auth.gif", caption: "Onboarding & auth — live flow" },
      { file: "wallet_payout.gif", caption: "Wallet & payout — live flow" },
      { file: "account_sessions.gif", caption: "Account & sessions — live flow" },
      { file: "log_miles.gif", caption: "Log miles — live flow" },
      { file: "track_miles_idle_screen.png", caption: "Track Miles — ready to start" },
      { file: "tracking_success_screen.png", caption: "Tracking success + reimbursement" },
      { file: "track_detail_screen.png", caption: "Track detail — route stats" },
      { file: "track_insights_screen.png", caption: "Track insights — quality score" },
      { file: "geo_check_in_screen.png", caption: "Geo check-in with map overlay" },
      { file: "manual_check_in_screen.png", caption: "Manual check-in" },
      { file: "check_in_history_screen.png", caption: "Check-in history" },
      { file: "track_settings_screen.png", caption: "Tracking settings" },
      { file: "hardware_events_log_screen.png", caption: "Hardware-events log" },
      { file: "tracking_setup_guide_screen.png", caption: "Tracking setup guide" },
      { file: "spends_home_screen.png", caption: "Spends home" },
      { file: "log_miles_step1_screen.png", caption: "Log miles — location search" },
      { file: "log_miles_step2_screen.png", caption: "Log miles — travelled legs" },
      { file: "expense_entry_screen.png", caption: "Expense entry" },
      { file: "expense_detail_screen.png", caption: "Expense detail + receipt" },
      { file: "expense_history_screen.png", caption: "Expense history" },
      { file: "voucher_history_screen.png", caption: "Voucher history" },
      { file: "advance_history_screen.png", caption: "Advance-request history" },
      { file: "travel_home_screen.png", caption: "Travel hub" },
      { file: "create_trip_screen.png", caption: "Create trip request" },
      { file: "booking_history_screen.png", caption: "Booking history" },
      { file: "trip_history_screen.png", caption: "Trip history" },
      { file: "approvals_screen_pending_tab.png", caption: "Approvals — policy badges" },
      { file: "payables_home_screen.png", caption: "Payables hub" },
      { file: "create_payment_screen.png", caption: "Pay or request (UPI)" },
      { file: "payments_history_screen.png", caption: "Payments history" },
      { file: "cards_home_screen.png", caption: "Cards home" },
      { file: "profile_account_hub.png", caption: "Account hub" },
      { file: "settings_screen.png", caption: "Settings" },
      { file: "analytics_home_screen.png", caption: "Analytics — Canvas charts" },
      { file: "notification_centre_screen.png", caption: "Notification centre" },
      { file: "search_masterSearch_results.png", caption: "Master search" },
      { file: "media_attachment_selection_screen.png", caption: "Attachment sources" },
      { file: "media_cloud_library_screen.png", caption: "Media library" },
      { file: "agent_chat_screen.png", caption: "AI assistant chat" },
      { file: "agent_history_screen.png", caption: "AI assistant history" },
      { file: "assistant_home_sheet.png", caption: "Assistant home sheet" },
      { file: "theme_picker_matrix.png", caption: "Theme picker — Matrix" },
      { file: "home_screen_loaded.png", caption: "Home dashboard" },
      { file: "wear_dashboard.png", caption: "Wear OS — dashboard" },
      { file: "wear_trip_list.png", caption: "Wear OS — recent trips" },
      { file: "watchos_app.png", caption: "watchOS (SwiftUI) app" },
      { file: "widget_glance.png", caption: "Android widget (Glance)" },
      { file: "widget_ios_home.png", caption: "iOS home-screen widget" },
      { file: "widget_ios_lockscreen.png", caption: "iOS Lock Screen widget" },
      { file: "live_activity.png", caption: "iOS Live Activity" },
      { file: "live_activity_dynamic_island.png", caption: "Dynamic Island — tracking" },
      { file: "desktop_dashboard.png", caption: "Compose Desktop window" },
      { file: "route_map.png", caption: "Route map — tracked trip" },
      { file: "login_screen.png", caption: "Login (demo credentials)" },
      { file: "set_pin_screen.png", caption: "Set PIN — app lock" },
      { file: "root_guard_screen_clean.png", caption: "Root guard — secure device" },
    ],
  },
  {
    slug: "paymentslab",
    name: "PaymentsLab",
    tagline: "An Integration Lab for the Android payments ecosystem — every gateway behind one abstraction, with a live look at what actually happens on each transaction.",
    description:
      "A Kotlin Multiplatform systems showcase: real payment flows across dozens of providers, all behind a single PaymentGateway abstraction, backed by a Ktor server that owns order creation, signature verification and webhook reconciliation.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Ktor", "Android", "iOS", "Room"],
    highlights: [
      "35-module KMP architecture — one Gradle module per native-SDK provider, contributed into a registry via Koin's getAll<PaymentGateway>(); adding gateway N+1 touches no existing code. The in-app catalog spans 66 gateways (7 native-SDK, 47 hosted-webview, 8 mobile-money, 4 catalog-only/KYC-gated).",
      "More than pay-in — five money-movement rails plus split payments: payouts (money out to a beneficiary), mandates & subscriptions (recurring debits), a card vault (tokenize once, charge later), marketplace Connect onboarding (sub-merchant KYC + split payouts) and an internal double-entry wallet ledger (seed / debit / refund against a running balance). Each rail is idempotency-keyed like the pay-in path.",
      "One contract, real SDKs — Razorpay, Cashfree, Stripe (+ Google Pay), Square, Omise and a UPI intent flow, plus two generic archetypes (hosted-webview covering 47 gateways, mobile-money covering 8) bridged into coroutines by a PaymentHost that never leaks an Activity; MOCK_MODE-honest when no sandbox keys are set.",
      "Server is the source of truth — a companion Ktor server creates orders, verifies payments with real HMAC-SHA256, and reconciles idempotent, signature-checked webhooks; the client callback is only ever treated as a hint.",
      "Process-death recovery, for real — every in-flight payment is journaled to Room before the SDK opens; on cold start the orchestrator finds and reconciles anything unresolved. The lifecycle is a pure (State, Event) → Effects reducer that replays byte-for-byte.",
      "VAPT-grade security suite — Android Keystore AES-256-GCM at rest, FLAG_SECURE + tapjacking guards, device-integrity checks (root/emulator/debugger/hook detection), certificate pinning.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/PaymentsLab" },
      { label: "Mileway (sibling KMP app)", url: "#project/mileway" },
    ],
    status: "35 modules · 66 gateways · 5 rails",
    badges: ["Kotlin Multiplatform", "35 modules", "66 gateways", "Open source"],
    theme: {
      accent: "#A78BFA",
      accentDim: "#7C3AED",
      ink: "#120A1F",
      surface: "#1B1130",
      card: "#241844",
      line: "#3F2B66",
    },
    icon: "/projects/paymentslab/brand/paymentslab-icon.svg",
    detail: {
      overview:
        "Payments is the hardest integration surface on Android: every gateway ships a different SDK, most of them are Activity-callback-era, the client can lie about the outcome, and the interesting logic (signatures, webhooks, idempotency, recovery) lives on the server. PaymentsLab runs — and step-by-step visualizes — real payment flows across a 66-gateway catalog behind a single PaymentGateway abstraction, backed by a Ktor server that does the order creation, signature verification and webhook reconciliation a real integration requires — and, beyond one-shot pay-in, models five money-movement rails.",
      sections: [
        {
          heading: "The one idea worth stealing",
          body: "A client-side Success is a hint, never proof. Only the server — after signature verification and webhook reconciliation — decides the true state. A server that owns price and truth, a client that always confirms before trusting, a journal written to Room before the SDK launches so a process death mid-payment is always recoverable, and a redaction layer so no secret or PII ever renders or logs.",
        },
        {
          heading: "35 modules, 66 gateways",
          body: "One Gradle module per native-SDK provider is contributed into a registry via Koin's getAll<PaymentGateway>(), so adding gateway N+1 touches no existing code. The in-app catalog spans 66 gateways: 7 native-SDK integrations, 47 hosted-webview gateways behind one archetype, 8 mobile-money flows and 4 catalog-only / KYC-gated entries — each with its own status badge and region.",
        },
        {
          heading: "Five money-movement rails + split payments",
          body: "Beyond one-shot checkout the server models payouts (/payouts — money out to a beneficiary), mandates & subscriptions (/mandates + scheduled debits and cancel), a card vault (/vault — tokenize once, charge later by id), marketplace Connect onboarding (/connect — sub-merchant KYC + split payouts) and an internal double-entry wallet ledger (/wallet — seed / debit / refund against a real running balance) — plus split payments, a two-leg orchestration that compensates if one leg fails. Ten provider modules ride these rails (Paystack, Flutterwave, Paytm, Xendit, M-Pesa, Peach, NMI, Stripe Connect, plus wallet and a record-only cash gateway), every one MOCK_MODE-honest until real sandbox keys are set.",
        },
        {
          heading: "One contract, real SDKs",
          body: "Razorpay, Cashfree, Stripe (+ Google Pay), Square, Omise and a raw UPI intent flow all implement the same tiny PaymentGateway interface. The Activity-callback SDKs are bridged into suspending coroutines by a PaymentHost that never leaks an Activity upward. A generic hosted-webview archetype covers the whole class of gateways with no native SDK behind the same contract — env-backed credentials auto-degrade from SANDBOX_READY to MOCK_MODE honestly instead of silently pretending to work.",
        },
        {
          heading: "Pure, replayable state machine",
          body: "The lifecycle is a pure (State, Event) → Effects reducer — zero coroutines/DI/IO — with the orchestrator just executing its effects. A payment's path is a recorded event log that replays byte-for-byte identically, the auditing property money movement wants. The MVI base comes from my own kmp-mvi-core library, shared with other apps.",
        },
        {
          heading: "VAPT-grade security",
          body: "core:security — real Android Keystore AES-256-GCM at-rest encryption, FLAG_SECURE + recursive tapjacking protection, device-integrity checks (root, emulator, debugger, Frida/Xposed hook detection, SSL-pinning-bypass detection), and a certificate-pinning config, with detection kept deliberately separate from enforcement policy.",
        },
      ],
      metrics: [
        { value: "35", label: "Gradle modules" },
        { value: "66", label: "gateways cataloged" },
        { value: "5", label: "money-movement rails" },
        { value: "1", label: "PaymentGateway contract" },
      ],
      techStack: [
        { group: "Architecture", items: ["Kotlin Multiplatform", "Compose Multiplatform", "35 Gradle modules", "Koin registry (getAll)", "kmp-mvi-core (shared MVI base)"] },
        { group: "Backend & rails", items: ["Ktor server", "HMAC-SHA256 signatures", "Webhook reconciliation", "Payouts · mandates · vault · connect · wallet ledger"] },
        { group: "Data & Security", items: ["Room (process-death journal)", "Android Keystore AES-256-GCM", "Certificate pinning", "Device-integrity checks"] },
        { group: "Build & quality", items: ["kmp-build-logic convention plugins", "Roborazzi screenshot tests", "ktlint", "detekt", "GitHub Actions CI"] },
      ],
      diagrams: [
        {
          title: "Gateway registry — adding provider N+1 touches no existing code",
          code: `graph TD
  reg["PaymentGateway registry<br/>Koin getAll()"]
  p1["provider: razorpay"] --> reg
  p2["provider: stripe"] --> reg
  p3["provider: cashfree"] --> reg
  p4["provider: hosted-webview<br/>(covers 47 gateways)"] --> reg
  pn["provider: N+1"] --> reg
  reg --> orch["PaymentOrchestrator"]`,
        },
        {
          title: "Client Success is a hint — the server decides truth",
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
        { label: "kmp-mvi-core (shared)", url: "https://github.com/darkpandawarrior/kmp-mvi-core" },
        { label: "kmp-build-logic (shared)", url: "https://github.com/darkpandawarrior/kmp-build-logic" },
        { label: "README", url: "https://github.com/darkpandawarrior/PaymentsLab#readme" },
      ],
    },
    screens: [
      { file: "activity_flow.gif", caption: "Live activity flow" },
      { file: "checkout_flow.gif", caption: "Checkout flow" },
      { file: "explore_verify_flow.gif", caption: "Explore & verify flow" },
      { file: "home_screen_dashboard.png", caption: "Home dashboard — live stats" },
      { file: "lab_home_screen_catalog.png", caption: "Provider catalog" },
      { file: "provider_lab_screen_running.png", caption: "Live payment flow timeline" },
      { file: "provider_lab_screen_settled_success.png", caption: "Settled — verified success" },
      { file: "payment_flow_diagram_verified.png", caption: "Server-verified flow diagram" },
      { file: "payment_flow_diagram_unverified.png", caption: "Unverified — client hint only" },
      { file: "step_timeline_dark.png", caption: "Step timeline (dark)" },
      { file: "step_timeline_light.png", caption: "Step timeline (light)" },
      { file: "payload_card.png", caption: "Redacted payload card" },
      { file: "redaction_reveal.png", caption: "Redaction reveal" },
      { file: "mock_mode_badge_shimmer.png", caption: "MOCK_MODE badge" },
      { file: "gateway_badges.png", caption: "Gateway badges" },
      { file: "success_burst.png", caption: "Success animation" },
      { file: "failure_shake.png", caption: "Failure animation" },
      { file: "animated_amount.png", caption: "Animated amount" },
      { file: "checkout_screen_order_summary.png", caption: "Checkout — order summary" },
      { file: "history_screen_with_filters.png", caption: "Payment history + filters" },
      { file: "gateway_brand_badges.png", caption: "Gateway brand badges" },
      { file: "checkout_screen_paying.png", caption: "Checkout — paying" },
      { file: "checkout_screen_settled_success.png", caption: "Checkout — settled success" },
      { file: "history_screen_all.png", caption: "Payment history — all" },
      { file: "shield_pulse.png", caption: "Security shield pulse" },
      { file: "ios_catalog.png", caption: "iOS — provider catalog" },
      { file: "ios_catalog_stripe.png", caption: "iOS — Stripe native SDK" },
      { file: "ios_catalog_all_native.png", caption: "iOS — all native-SDK gateways" },
    ],
  },
  {
    slug: "hiresignal",
    name: "HireSignal",
    tagline: "Local-first AI career-intelligence dashboard.",
    description:
      "A local-first job-search engine — resume onboarding, reverse-ATS discovery, evidence-based fit scoring and tailored résumés — built on the open-source career-ops project, which I actively contribute to upstream.",
    stack: ["Node.js", "Vite", "Playwright", "Multi-profile", "62 ATS/board providers"],
    highlights: [
      "Resume onboarding → profile inference → trust-validated job scanning → fit scoring → tailored résumés.",
      "Single-server multi-profile architecture (per-candidate routing) over a strict User/System data contract.",
      "62 ATS & job-board provider integrations (upstream hiresignal) via a dynamic, zero-token provider loader.",
      "Contributor upstream — 30 merged PRs, including HireSignal 2.0's multi-profile/scoring/onboarding fusion and a production-grade README refresh.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/career-ops" },
      { label: "Upstream", url: "https://github.com/kirklazar-android/hiresignal" },
    ],
    status: "Active · 30 PRs merged upstream",
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

// ── Shared foundation ─────────────────────────────────────────────────────
// Two of my own KMP libraries that both Mileway and PaymentsLab consume as
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
    "Mileway and PaymentsLab aren't two isolated demos — they're two KMP apps sitting on a common foundation I built and maintain separately. Both pull in my own convention-plugin and MVI-base libraries as composite builds, so the build wiring and the unidirectional-state contract are written once and reused, exactly the platform discipline I bring to a codebase at scale.",
  libs: [
    {
      name: "kmp-build-logic",
      url: "https://github.com/darkpandawarrior/kmp-build-logic",
      role: "Gradle convention plugins — one place that configures every KMP module's targets, Compose, lint and test wiring.",
      usedBy: ["Mileway", "PaymentsLab"],
    },
    {
      name: "kmp-mvi-core",
      url: "https://github.com/darkpandawarrior/kmp-mvi-core",
      role: "A tiny (State, Event) → Effects MVI base — the reducer/store contract the payment state machine is built on.",
      usedBy: ["PaymentsLab"],
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

// Curated highlights, not the full list — 30 PRs merged upstream as of 2026-07-10.
// See https://github.com/kirklazar-android/hiresignal/pulls?q=author%3Adarkpandawarrior for all of them.
export const openSource: Contribution[] = [
  { repo: "kirklazar-android/hiresignal", title: "docs: production-grade README refresh — visuals, versioning, deep dive", url: "https://github.com/kirklazar-android/hiresignal/pull/48", status: "merged", date: "2026-07-10" },
  { repo: "kirklazar-android/hiresignal", title: "HireSignal 2.0 fusion — multi-profile, scoring, onboarding, board, branding (Phases 0–5)", url: "https://github.com/kirklazar-android/hiresignal/pull/9", status: "merged", date: "2026-07-01" },
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
  { date: "Jul 2026", title: "HireSignal — 30 PRs merged upstream", detail: "From the 1.14 System-Layer sync and dashboard tabs through the HireSignal 2.0 multi-profile/scoring/onboarding fusion (PR #9) to a production-grade README refresh (PR #48)." },
  { date: "Jun 2026", title: "Mileway — five platforms", detail: "Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, plus Glance/WidgetKit widgets and an iOS Live Activity — 149 Roborazzi tests green." },
  { date: "Jul 2026", title: "Mileway — offline AI + policy engine", detail: "Retrieval-grounded chat over local data with voice I/O, a reimbursement-rate policy engine and a durable submit-outbox — still zero backend." },
  { date: "Jul 2026", title: "PaymentsLab — 5 rails + 66 gateways", detail: "35-module KMP payments lab: payouts, mandates, card vault, marketplace Connect and a double-entry wallet ledger beyond one-shot pay-in — all MOCK_MODE-honest." },
  { date: "Jul 2026", title: "Shared KMP foundation", detail: "Extracted kmp-build-logic (convention plugins) and kmp-mvi-core (MVI base) as my own libraries, consumed by Mileway and PaymentsLab as composite builds." },
  { date: "Jul 2026", title: "Mileway — super-profile & plugin platform (V24)", detail: "A plugin-composition registry (TILE/CAPABILITY/VALUE, FORCED>USER>PRESET>DEFAULT layering) driving four persona presets, plus delegation, verification, growth, membership and wallet/payout depth — still landing." },
];
