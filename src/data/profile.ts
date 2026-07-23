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
        label: "Platform Ownership",
        text: "Own Android architecture and platform decisions across a 738k-LOC Kotlin app serving 50,000+ MAU.",
      },
      {
        label: "Compose Migration",
        text: "Led legacy Java/XML to 92% Jetpack Compose migration with zero regressions across mission-critical workflows.",
      },
      {
        label: "Location Engineering",
        text: "Built a predictive dead-reckoning location engine, lifting GPS accuracy from 50% to 95% for 22,000+ DAU.",
      },
      {
        label: "Crash Reduction",
        text: "Cut production crashes 80% via structured-concurrency fixes and dual Crashlytics + Sentry monitoring.",
      },
      {
        label: "Security Hardening",
        text: "Hardened the app to VAPT/banking compliance: SQLCipher, AES-256 Keystore, biometrics, and SSL-pinning build flavors.",
      },
      {
        label: "Data Layer",
        text: "Own the Room persistence layer across two databases with 24 verified production schema migrations.",
      },
      {
        label: "Product Growth",
        text: "Shipped intelligent in-app review flows, lifting Play Store rating 85% and reviews 80x.",
      },
      {
        label: "Travel Platform",
        text: "Shipped the Android side of Trip V2: Itinerary V2, GIN screens, and full Mixpanel instrumentation.",
      },
      {
        label: "UI Platform",
        text: "Designed a Dynamic Theme Engine for client branding, cutting UI development friction 60%.",
      },
      {
        label: "CI/CD & Automation",
        text: "Automated Fastlane builds and Play Store releases; upgraded to AGP 9 with agentic MCP workflows.",
      },
    ],
  },
  {
    company: "Jugnoo / Tookan / Jungleworks",
    role: "Software Engineer, Android & Vertical Owner",
    period: "Jan 2021 — May 2023",
    points: [
      { text: "Owned Android development across multi-tenant SaaS platforms for customer, driver, and merchant apps." },
      { text: "Built modular white-label templates, cutting delivery time 80% across 20+ clients." },
      { text: "Refactored core modules and REST integrations (Retrofit, OkHttp), including secure payment gateways." },
      { text: "Unified P2P Carpool and Trucking verticals into one super-app platform, simplifying user flows." },
      { text: "Collaborated cross-team on roadmaps with product and backend, cutting engineering overhead 40%." },
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
    metric: "35 modules · 5 platforms · offline AI",
    summary:
      "An open-source app I designed and built end-to-end: mileage, travel & expense tracking that runs entirely offline across Android, iOS, Wear OS, watchOS and Compose Desktop from one shared Kotlin codebase. Zero backend — Room + DataStore only — so the whole thing is reproducible and reviewable by anyone.",
    problem:
      "I wanted a clean, inspectable reference for the architecture I advocate for at scale — Compose Multiplatform, strict module isolation, MVI state, a real location engine and a real policy/reimbursement layer — built with zero backend so the whole thing is reproducible and reviewable by anyone.",
    approach: [
      "35-module clean architecture: 11 feature modules that never depend on each other, meeting only at the :app composition root, wired with Koin.",
      "Shared commonMain core — design system, Room (KMP) + DataStore, and every check-in / hardware-event screen — driving Android, iOS, Wear OS, a watchOS SwiftUI app and a Compose Desktop window from one snapshot model.",
      "A location engine that treats GPS as a noisy signal: jitter suppression, spike detection, a four-bucket distance accumulator, IMU (accelerometer) fusion and device-tier-adaptive sampling, with a deterministic simulated-drive source so the whole engine is unit-testable without hardware.",
      "A policy engine that computes reimbursement from configurable per-vehicle rate rules and flags policy violations on approvals — the real logic a live expense platform needs, all local.",
      "A durable submit-outbox: a track/voucher submission is journaled locally and reconciled deterministically, so a kill mid-submit never loses or double-counts a record — the repository already looks one implementation-swap away from a real API.",
      "An on-device AI assistant: retrieval-grounded chat over real local trip/expense/card data, Room-backed history with 5-minute session resume, chunked streaming and on-device speech I/O — no remote LLM, no server.",
      "A super-profile & plugin-composition platform (V24, shipped — with a V25→V32 on-device intelligence and feature-parity series landed on top): a single plugin registry — every tile, capability and tunable value gates through it, resolved by layering FORCED > USER > PRESET > DEFAULT — drives four persona presets (Corporate Commuter, Super-App Consumer, Gig Driver, Minimal Guest) that reshape hubs, auth flows and tracking behaviour from one account, plus act-on-behalf session delegation, a verification centre, growth/membership surfaces and wallet/payout identity.",
      "Dual gms / noGms distribution (Google Play + F-Droid) with a dependency-guard that fails the build if proprietary libraries leak into the FOSS flavor; quality gated by 159 Roborazzi JVM screenshot tests (no emulator, no network), Napier logging, detekt, ktlint, Kover and CI.",
    ],
    outcome:
      "All five targets build, run and pass every quality gate from one shared Kotlin codebase — with a real location engine, a policy/reimbursement layer, a durable submit-outbox, a persona-driven plugin-composition platform and an on-device AI assistant layered on the offline data model. Explore the app, architecture diagrams and all rendered screens at github.com/darkpandawarrior/Mileway.",
    tags: ["Kotlin Multiplatform", "Compose Multiplatform", "Android · iOS · Wear OS · watchOS · Desktop", "45 modules", "Offline AI", "Open source"],
  },
  {
    slug: "gps-accuracy",
    title: "Predictive dead reckoning for billing-grade mileage",
    metric: "50% → 95%",
    summary: "Predictive dead reckoning for a mileage-tracking app whose raw GPS was wrong half the time.",
    problem:
      "Field users' trip distances were off by large margins from urban canyons, tunnels, and OEM-throttled location updates.",
    approach: [
      "Fused accelerometer and GPS data to estimate position between fixes via dead reckoning.",
      "Rejected physically impossible fixes with spike detection, plus gap-filling for weak signal.",
      "Ran a foreground service with a floating bubble UI to survive OEM battery restrictions.",
    ],
    outcome: "Tracking accuracy rose from 50% to 95%, making mileage reliable enough for expense reimbursement.",
    tags: ["Location", "Sensor fusion", "Foreground services"],
  },
  {
    slug: "crash-reduction",
    title: "Systematic crash triage at 50k-MAU scale",
    metric: "-80% crashes",
    summary: "Systematic triage with Crashlytics turned a noisy crash feed into a fixable backlog.",
    problem:
      "A fast-growing 738k-LOC app had a crash rate hurting its Play Store rating, driven by untraceable threading bugs.",
    approach: [
      "Clustered crashes to collapse dozens of stack traces into a handful of root bugs.",
      "Reconstructed the user journey before each crash with structured breadcrumb instrumentation.",
      "Hunted concurrency bugs: main-thread violations, coroutine race conditions, lifecycle leaks.",
    ],
    outcome: "Crashes fell 80%; Play Store rating rose 85% with 80x more user reviews.",
    tags: ["Crashlytics", "Structured concurrency", "Coroutines"],
  },
  {
    slug: "compose-migration",
    title: "Zero-regression migration to a Compose theme platform",
    metric: "92% Compose",
    summary: "Migrated a 738k-LOC app to Jetpack Compose with zero regressions and built a theme engine the whole team ships on.",
    problem:
      "XML views made UI changes slow and inconsistent, and design's theming requests meant touching dozens of files.",
    approach: [
      "Migrated incrementally via interop, keeping Expenses, Travel, and Invoices shipping throughout.",
      "Standardized on a single immutable UiState per screen with StateFlow and MVI.",
      "Built a Dynamic Theme Engine on CompositionLocal for one-place brand and token changes.",
    ],
    outcome: "Reached 92% Compose coverage with zero regressions; UI development friction dropped 60%.",
    tags: ["Jetpack Compose", "MVI", "Design systems"],
  },
  {
    slug: "white-label",
    title: "Configuration-driven pipeline for multi-tenant Android",
    metric: "80% faster delivery",
    summary: "A configuration-driven pipeline that turned weeks of per-client Android work into days.",
    problem:
      "Every new white-label client meant manually forking, rebranding, and re-releasing the app: weeks of error-prone work.",
    approach: [
      "Built configuration-driven theming and feature flags so one codebase served every client.",
      "Automated per-client signing, asset generation, and Play Store packaging end-to-end.",
      "Unified brand tokens and vertical-specific flows into a single reusable app template.",
    ],
    outcome: "Shipped 20+ client apps with delivery time cut 80% versus manual per-client builds.",
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
    items: ["Kotlin Coroutines", "Flow / StateFlow / SharedFlow", "Room (SQLite, 24 migrations · 2 DBs)", "DataStore + WorkManager", "Retrofit + OkHttp"],
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
    items: ["Room (SQLite, 24 schema migrations across 2 databases)", "DataStore", "SQLCipher", "Retrofit", "OkHttp", "REST APIs"],
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
      "Deterministic Kotlin Multiplatform social-deduction game with ISMCTS bot AI, shipped across Android, iOS, Desktop, and Web.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Android", "iOS", "Desktop", "Web (Wasm)"],
    highlights: [
      "Pure (GameState, Intent) → GameState reducer drives the AI, UI, and a future server.",
      "ISMCTS AI with 10 bot personas plus a DARBAR social layer for bluffing and alliances.",
    ],
    links: [{ label: "GitHub", url: "https://github.com/darkpandawarrior/Kursi" }],
    status: "13 modules · 4 platforms · 10 bot personas",
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
        note: "Compose Multiplatform renders pixel-identical UI on iOS — the same composables at phone size.",
      },
      {
        platform: "Desktop",
        deviceFrame: "desktop",
        screens: ["review_replay.png", "home_ranked.png"],
        note: "Same engine, windowed — Compose Desktop (JVM) build.",
      },
      {
        platform: "Web",
        deviceFrame: "browser",
        screens: ["home.png"],
        liveUrl: "/kursi-app/index.html",
        note: "Live — the real Compose/Wasm build, playable right here. One codebase, running in your browser.",
      },
    ],
    detail: {
      overview:
        "Kursi is a Hinglish social-deduction bluffing game set in a satirical India corporate-political underworld where six archetypes scheme for an empty chair — the Gaddi — and everyone is lying about what they hold. The Neta makes promises he'll forget tomorrow, the Bhai owns silence, the Babu approves nothing, the Jugaadu knows a shortcut, the Vakil has read every exception. Satire targets the archetype, never the person. Under the deadpan Hinglish voice (\"सब मिले हुए हैं\") sits a serious engineering exercise: one deterministic Kotlin engine that runs identically on Android, iOS, desktop and the web, and powers the AI, the UI and a server-authoritative backend from the same code.",
      sections: [
        {
          heading: "Deterministic engine",
          body: "The whole game is a pure function: (GameState, Intent) → GameState, with the RNG seed living inside the state. The same module drives single-player, the bots and a future server — and any match can be replayed byte-for-byte from its seed and intent log.",
        },
        {
          heading: "Same game, three depths (launch overhaul)",
          body: "The board reveals itself in three density layers so a first-timer isn't handed an expert's dashboard. FOCUS shows only whose turn it is, one plain-language line of what just happened, your hand and your legal moves; GUIDED adds gentle coaching; ANALYST is the full instrument panel (suspicion pips, odds, teleprinter log). Players graduate FOCUS → GUIDED → ANALYST by playing. Paired with a tap-to-continue beat gate so the round never resolves faster than you can read it, and a tutorial-first onboarding funnel that teaches one mechanic at a time.",
        },
        {
          heading: "AI Munshi narrator",
          body: "A diegetic court-scribe turns raw engine events into one calm in-character line — grounded strictly on the redacted PlayerView so it narrates the beat without ever leaking a hidden card or inventing the board. It renders the deterministic templated line instantly and upgrades in place if an LLM is available (on-device Gemini Nano / Apple FoundationModels / BYOK cloud), never enters the intent log, and leaves byte-for-byte replay untouched.",
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
          heading: "“Sarkari Noir” visual system",
          body: "A bespoke lamplit visual language — teak/brass/cream palette, Rozha One display type, Canvas-drawn intaglio role glyphs and stamped-instrument motifs — pushed to an AAA bar in the launch overhaul: every screen dissolved from bordered boxes into one continuous lit table (depth via shadow, never outline), a shared component vocabulary, and an AGSL/Skia runtime-shader material layer (film grain + warm bloom on the felt) with a graceful no-shader fallback. All behind a full Fastlane + CI pipeline with headless screenshot rendering.",
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
        { group: "Language & UI", items: ["Kotlin 2.4.20-Beta1", "Compose Multiplatform 1.12", "Canvas + AGSL/Skia runtime shaders"] },
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
      "Offline-first mileage, travel, and expense tracker spanning five platforms from one Kotlin codebase, zero backend.",
    stack: ["Kotlin Multiplatform", "Compose Multiplatform", "Android", "iOS", "Wear OS", "watchOS", "Desktop", "Room (KMP)", "Koin"],
    highlights: [
      "45-module clean architecture: 13 feature modules meeting only at the composition root.",
      "Real location engine, reimbursement policy engine, durable submit-outbox, and an on-device AI assistant.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/Mileway" },
      { label: "Case study", url: "#work" },
      { label: "PaymentsLab (sibling KMP app)", url: "#project/paymentslab" },
    ],
    status: "45 modules · 5 platforms · 159 tests",
    badges: ["Kotlin Multiplatform", "45 modules", "5 platforms", "Open source"],
    // Telemetry-cyan — the site's own "depth" accent, reused rather than
    // invented: fitting for a location/tracking app, distinct from Kursi's
    // teak/brass and PaymentsLab's violet.
    theme: {
      accent: "#5ee6ff",
      accentDim: "#2fb8d6",
      ink: "#05070a",
      surface: "#0a1016",
      card: "#0f1720",
      line: "#1c2733",
    },
    icon: "/projects/mileway/brand/mileway-icon.svg",
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
        screens: ["widget_ios_home.png", "widget_ios_lockscreen.png", "live_activity.png", "live_activity_dynamic_island.png"],
        note: "Home-screen widget, Lock Screen widget and a Live Activity / Dynamic Island — genuine iOS surfaces, shown at their real widget shape.",
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
        note: "Live — a Compose/Wasm preview shell: dashboard, live simulated tracking and the expense log, running the real design system and location math in your browser.",
      },
    ],
    detail: {
      overview:
        "Mileway is an original, fully-offline mileage / travel / expense tracker I designed and built end-to-end in Kotlin & Compose Multiplatform — running on Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, with zero backend so the whole thing is reproducible and reviewable. It's my reference implementation for the architecture I advocate at scale: strict module isolation, a real location engine, a policy/reimbursement layer and a durable submit-outbox, all over local data.",
      sections: [
        {
          heading: "45-module clean architecture (35 local + 10 composed)",
          body: "Thirteen feature modules that never depend on each other, meeting only at the :app composition root and wired with Koin. A shared commonMain core holds the design system, Room (KMP) + DataStore, and every check-in / hardware-event screen, with platform services behind expect/actual. Convention plugins from my own kmp-build-logic keep every module's build consistent.",
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
          heading: "Super-profile & plugin-composition platform (V24, shipped)",
          body: "The newest depth wave: a single plugin registry is the app's composition mechanism — TILE / CAPABILITY / VALUE plugins resolved by layering FORCED > USER > PRESET > DEFAULT, editable live from a Master Plugin page with source chips. Four persona presets (Corporate Commuter, Super-App Consumer, Gig Driver, Minimal Guest) reshape hubs, auth flows, tracking behaviour and tunables from one account. Built on top: act-on-behalf session delegation with an app-wide \"Acting as\" banner, a verification centre with corporate-email/OTP + card KYC, growth surfaces (referral, coupons, scratch rewards), membership (club, subscriptions, incentives), external wallet linking via OTP, and payout identity (masked bank + editable UPI handle + QR) — shipped, with a V25→V32 on-device intelligence series landed on top, still zero backend.",
        },
        {
          heading: "FOSS-safe distribution & quality gates",
          body: "Dual gms / noGms builds (Google Play + F-Droid) with a dependency-prefix guard that fails the build if proprietary libraries leak into the FOSS flavor. 159 Roborazzi JVM screenshot tests (no emulator, no network) covering phone, watch and desktop, plus Napier logging, detekt, ktlint, Kover and CI.",
        },
      ],
      metrics: [
        { value: "45", label: "Gradle modules (35 local + 10 composed)" },
        { value: "13", label: "isolated feature modules" },
        { value: "5", label: "platforms · one codebase" },
        { value: "0", label: "backend calls" },
      ],
      techStack: [
        { group: "Language & UI", items: ["Kotlin", "Compose Multiplatform", "Material 3", "SwiftUI (watchOS)"] },
        { group: "Data", items: ["Room (KMP)", "DataStore", "Coroutines + Flow", "Durable submit-outbox"] },
        { group: "Domain", items: ["Location engine (jitter · spike · IMU fusion)", "Reimbursement-rate policy engine"] },
        { group: "DI & build", items: ["Koin", "kmp-build-logic convention plugins", "AGP", "Gradle KTS"] },
        { group: "Maps & platform", items: ["MapLibre (F-Droid)", "KrossMap (Play)", "Glance + WidgetKit widgets", "Live Activity / Dynamic Island"] },
        { group: "Quality", items: ["Roborazzi (159 JVM screenshot tests)", "detekt", "ktlint", "Kover", "CI"] },
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
          title: "35-module architecture — features meet only at :app",
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
      "39-module registry (14 local + 25 composed) spans roughly 71 cataloged payment gateways.",
      "Five money-movement rails plus split payments, all idempotency-keyed and MOCK_MODE-honest.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/PaymentsLab" },
      { label: "Mileway (sibling KMP app)", url: "#project/mileway" },
    ],
    status: "39 modules · ~71 gateways · 5 rails",
    badges: ["Kotlin Multiplatform", "40 modules", "71 gateways", "Open source"],
    theme: {
      accent: "#A78BFA",
      accentDim: "#7C3AED",
      ink: "#120A1F",
      surface: "#1B1130",
      card: "#241844",
      line: "#3F2B66",
    },
    icon: "/projects/paymentslab/brand/paymentslab-icon.svg",
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
        screens: [],
        liveUrl: "/paymentslab-app/index.html",
        note: "Live — a Compose/Wasm preview shell running the gateway catalog and the explained-checkout demo in your browser, in MOCK_MODE: the real orchestrator FSM and hosted-webview archetype, in-memory fakes for the server.",
      },
    ],
    detail: {
      overview:
        "Payments is the hardest integration surface on Android: every gateway ships a different SDK, most of them are Activity-callback-era, the client can lie about the outcome, and the interesting logic (signatures, webhooks, idempotency, recovery) lives on the server. PaymentsLab runs — and step-by-step visualizes — real payment flows across a ~71-gateway catalog behind a single PaymentGateway abstraction, backed by a Ktor server that does the order creation, signature verification and webhook reconciliation a real integration requires — and, beyond one-shot pay-in, models five money-movement rails.",
      sections: [
        {
          heading: "The one idea worth stealing",
          body: "A client-side Success is a hint, never proof. Only the server — after signature verification and webhook reconciliation — decides the true state. A server that owns price and truth, a client that always confirms before trusting, a journal written to Room before the SDK launches so a process death mid-payment is always recoverable, and a redaction layer so no secret or PII ever renders or logs.",
        },
        {
          heading: "39 modules, ~71 gateways",
          body: "One Gradle module per native-SDK provider is contributed into a registry via Koin's getAll<PaymentGateway>(), so adding gateway N+1 touches no existing code — 14 local modules plus 25 composed from kmp-toolkit. The in-app catalog spans roughly 71 registered gateways: 17 standalone provider modules (Razorpay through Stripe Connect), 44 hosted-webview gateways behind one archetype, 7 mobile-money flows and 3 catalog-only / KYC-gated entries — each with its own status badge and region.",
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
          body: "The lifecycle is a pure (State, Event) → Effects reducer — zero coroutines/DI/IO — with the orchestrator just executing its effects. A payment's path is a recorded event log that replays byte-for-byte identically, the auditing property money movement wants. The MVI base comes from my own kmp-toolkit library, shared with other apps.",
        },
        {
          heading: "VAPT-grade security",
          body: "core:security — real Android Keystore AES-256-GCM at-rest encryption, FLAG_SECURE + recursive tapjacking protection, device-integrity checks (root, emulator, debugger, Frida/Xposed hook detection, SSL-pinning-bypass detection), and a certificate-pinning config, with detection kept deliberately separate from enforcement policy.",
        },
      ],
      metrics: [
        { value: "39", label: "Gradle modules (14 local + 25 composed)" },
        { value: "~71", label: "gateways cataloged" },
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
          title: "Gateway registry — adding provider N+1 touches no existing code",
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
        { label: "kmp-toolkit (shared)", url: "https://github.com/darkpandawarrior/kmp-toolkit" },
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
      "62 ATS & job-board provider integrations via a dynamic, zero-token provider loader, built on the open-source career-ops engine.",
      "Contributor to the public career-ops project (⭐60k+) — merged PRs adding ATS providers (BambooHR, Breezy HR), a dashboard status-cell fix, and an agent-inbox feature.",
    ],
    links: [
      { label: "GitHub", url: "https://github.com/darkpandawarrior/career-ops" },
      { label: "Upstream (career-ops)", url: "https://github.com/santifer/career-ops" },
    ],
    status: "Active · built on the open-source career-ops engine",
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
  {
    slug: "deadlock",
    name: "DEADLOCK",
    tagline: "A first-person time-loop game about a moment someone could not let end.",
    description:
      "Godot 4.7 in GDScript. A deterministic echo-replay spine — recorded input intent replays through the same physics step — powers cooperative echoes, ghosts, and boss desync from one system. Built solo as an AI-orchestrated dev crew.",
    stack: ["Godot 4.7", "GDScript", "Deterministic sim"],
    highlights: [
      "One deterministic time system reused five ways: cooperative echoes, ghosts, leaderboard replays, the Hunter, and boss desync.",
      "Run as a model-tiered AI dev crew — content lands only after a generator/critic pass for frame, voice, and fairness.",
    ],
    links: [{ label: "GitHub", url: "https://github.com/darkpandawarrior/deadlock" }],
    status: "In development",
    badges: ["Godot 4.7", "GDScript", "Time-loop"],
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
      name: "kmp-toolkit",
      url: "https://github.com/darkpandawarrior/kmp-toolkit",
      role: "A vendored KMP toolkit — the tiny (State, Event) → Effects mvi-core base (the reducer/store contract the payment state machine is built on), plus shared feedback/common modules.",
      usedBy: ["Mileway", "PaymentsLab"],
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

// Real public open-source contributions — merged PRs to career-ops, a public OSS project (⭐60k+).
// See https://github.com/santifer/career-ops/pulls?q=author%3Adarkpandawarrior
export const openSource: Contribution[] = [
  { repo: "santifer/career-ops", title: "feat(agent-inbox): queue requests for the next session", url: "https://github.com/santifer/career-ops/pull/1472", status: "merged", date: "2026-07-03" },
  { repo: "santifer/career-ops", title: "fix(dashboard): rewrite only the Status cell on status update", url: "https://github.com/santifer/career-ops/pull/1186", status: "merged", date: "2026-06-23" },
  { repo: "santifer/career-ops", title: "feat(providers): add Breezy HR provider", url: "https://github.com/santifer/career-ops/pull/1185", status: "merged", date: "2026-06-23" },
  { repo: "santifer/career-ops", title: "feat(providers): add BambooHR provider", url: "https://github.com/santifer/career-ops/pull/1141", status: "merged", date: "2026-06-20" },
];

export interface GrowthItem {
  date: string;
  title: string;
  detail: string;
}

// Recent shipping timeline — "what I've built in the last few weeks".
export const recentGrowth: GrowthItem[] = [
  { date: "Jun 2026", title: "Kursi shipped", detail: "Full Kotlin Multiplatform social-deduction game across Android, iOS, desktop and web — deterministic engine + ISMCTS AI." },
  { date: "Jun–Jul 2026", title: "career-ops — public OSS contributions", detail: "Merged PRs to the public career-ops project (⭐60k+): ATS providers (BambooHR, Breezy HR), a dashboard status-cell fix, and an agent-inbox feature." },
  { date: "Jun 2026", title: "Mileway — five platforms", detail: "Android, iOS, Wear OS, watchOS and Compose Desktop from one shared codebase, plus Glance/WidgetKit widgets and an iOS Live Activity — 159 Roborazzi tests green." },
  { date: "Jul 2026", title: "Mileway — offline AI + policy engine", detail: "Retrieval-grounded chat over local data with voice I/O, a reimbursement-rate policy engine and a durable submit-outbox — still zero backend." },
  { date: "Jul 2026", title: "PaymentsLab — 5 rails + 71 gateways", detail: "39-module KMP payments lab: payouts, mandates, card vault, marketplace Connect and a double-entry wallet ledger beyond one-shot pay-in — all MOCK_MODE-honest." },
  { date: "Jul 2026", title: "Shared KMP foundation", detail: "Extracted kmp-build-logic (convention plugins) and kmp-toolkit (MVI base) as my own libraries, consumed by Mileway and PaymentsLab as composite builds." },
  { date: "Jul 2026", title: "Mileway — super-profile & plugin platform (V24)", detail: "A plugin-composition registry (TILE/CAPABILITY/VALUE, FORCED>USER>PRESET>DEFAULT layering) driving four persona presets, plus delegation, verification, growth, membership and wallet/payout depth — shipped, with V25→V32 landed on top." },
];
