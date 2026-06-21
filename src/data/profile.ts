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
    "Senior Android Engineer with 5+ years building and scaling production Android applications in Kotlin for enterprise SaaS — platform owner of a 738k-line, 50,000+ MAU financial Android app. Expert in Jetpack Compose migration (92% coverage), Clean Architecture with MVVM/MVI, Kotlin Coroutines and Flow, and Hilt dependency injection. Deep hard-systems experience: sensor-fusion location engineering (GPS accuracy 50% to 95%), on-device security (SQLCipher, Android Keystore, SSL pinning), and an 80% production crash reduction across 22,000+ DAU.",
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
        text: "Reduced production crashes by 80% through Kotlin Coroutines structured-concurrency fixes, thread-safety optimization, and Firebase Crashlytics monitoring.",
      },
      {
        label: "Security Engineering",
        text: "Hardened the app to VAPT compliance: SQLCipher database encryption, AES-256 with hardware-backed Android Keystore, EncryptedSharedPreferences, SSL pinning (OkHttp CertificatePinner), and biometric authentication (BiometricPrompt).",
      },
      {
        label: "Data Layer",
        text: "Own the Room (SQLite) persistence layer with 15+ production schema migrations, DataStore, and offline-resilient sync via WorkManager.",
      },
      {
        label: "UI Platform",
        text: "Designed a reusable Dynamic Theme Engine for client-level branding, reducing UI development friction by 60%.",
      },
      {
        label: "CI/CD & Automation",
        text: "Automated build, signing, and Play Store releases with Fastlane; built agentic development workflows (Firebender, MCP) to rapidly generate MVPs.",
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
    title: "Mileway — offline-first tracking in Kotlin Multiplatform",
    metric: "23 modules · KMP",
    summary:
      "An original open-source app I designed and built end-to-end: mileage, travel & expense tracking that runs entirely offline across Android, iOS and Wear OS from one shared Kotlin codebase.",
    problem:
      "I wanted a clean, inspectable reference for the architecture I advocate for at scale — Compose Multiplatform, strict module isolation, MVI state and a real location engine — built with zero backend so the whole thing is reproducible and reviewable by anyone.",
    approach: [
      "23-module clean architecture: 11 feature modules that never depend on each other, meeting only at the :app composition root, wired with Koin.",
      "Shared commonMain core — design system, Room (KMP) + DataStore, platform services behind expect/actual — compiling for Android, iOS and Wear OS.",
      "A location pipeline that treats GPS as a noisy signal: jitter suppression, spike detection, four-bucket distance accounting and accelerometer fusion, with a deterministic simulated-drive source so the whole engine is unit-testable.",
      "Dual gms / noGms distribution (Google Play + F-Droid) with a dependency-guard that fails the build if proprietary libraries leak into the FOSS flavor.",
      "Quality gates: 50 Roborazzi screenshot tests on the JVM (no emulator), detekt, ktlint, Kover and CI.",
    ],
    outcome:
      "A self-contained, fully-offline app and an interactive engineering case study — explore it at darkpandawarrior.github.io/mileway, with architecture diagrams, live demos and every screen.",
    tags: ["Kotlin Multiplatform", "Compose Multiplatform", "Clean architecture", "Offline-first", "Open source"],
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
    items: ["Android SDK", "Location engineering + sensor fusion", "Foreground services", "Hilt / Dagger", "Firebase (Crashlytics, FCM) + Mixpanel"],
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
    items: ["Android SDK", "WorkManager", "Foreground Services", "Location / sensor fusion", "Firebase (Crashlytics, FCM)", "Mixpanel"],
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
