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
  availability: "Notice period: 15 days · Open to remote (worldwide / India) and hybrid in Pune / Bengaluru",
  intro:
    "5+ years building production Android. Platform owner of a 738k-LOC, 92%-Compose financial SaaS app serving 50,000+ monthly users. I care about the unglamorous engineering that makes apps feel reliable: location accuracy, crash-free sessions, and architecture a team can move fast in.",
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

export interface Experience {
  company: string;
  role: string;
  period: string;
  points: string[];
}

export const experience: Experience[] = [
  {
    company: "Dice.tech",
    role: "SDE-2, Android & Product Owner",
    period: "Jun 2023 — Present",
    points: [
      "Platform owner for a 738k-LOC Kotlin financial app: 50k+ MAU, 22k+ DAU. Set team-wide standards for Clean Architecture (MVVM/MVI, repository pattern, single immutable UiState with StateFlow).",
      "Led the legacy Java/XML migration to 92% Jetpack Compose (Material 3, Compose-View interop) with zero regressions, shipping mission-critical Expenses, Travel, and Invoices workflows throughout.",
      "Built a high-precision location engine using Predictive Dead Reckoning and sensor fusion (accelerometer + GPS) on a foreground service, with gap-filling for low-connectivity environments — GPS accuracy up from 50% to 95%.",
      "Reduced production crashes by 80% through structured-concurrency fixes, thread-safety optimization, and Crashlytics monitoring.",
      "Hardened the app to VAPT compliance: SQLCipher, AES-256 with hardware-backed Android Keystore, EncryptedSharedPreferences, SSL pinning, BiometricPrompt.",
      "Own the Room persistence layer with 15+ production schema migrations, DataStore, and offline-resilient sync via WorkManager.",
      "Designed a reusable Dynamic Theme Engine for client-level branding, cutting UI development friction by 60%.",
      "Automated build, signing, and Play Store releases with Fastlane; built agentic development workflows (Firebender, MCP). Intelligent in-app review flows lifted the Play Store rating 85% and reviews 80x.",
    ],
  },
  {
    company: "Jugnoo / Tookan / Jungleworks",
    role: "Software Engineer, Android & Vertical Owner",
    period: "Jan 2021 — May 2023",
    points: [
      "Owned Android development across multi-tenant SaaS platforms for customer, driver, and merchant applications.",
      "Built modular, reusable white-label app templates that cut delivery time by 80% for 20+ clients.",
      "Refactored core modules and REST integrations (Retrofit, OkHttp), integrating secure payment gateways across distributed services.",
      "Unified P2P Carpool and Trucking verticals into a single super-app platform, simplifying user flows and increasing engagement.",
      "Collaborated on roadmaps with product and backend teams, reducing engineering overhead by 40%.",
    ],
  },
  {
    company: "John Deere India",
    role: "GET Intern",
    period: "May — Jul 2020",
    points: [
      "Built a proof of concept integrating social-media sentiment analysis into financial lending systems to enhance credit-risk modeling.",
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

export const skills: { group: string; items: string[] }[] = [
  {
    group: "UI & Architecture",
    items: ["Jetpack Compose + Material 3", "MVVM + Clean Architecture", "MVI / single UiState", "Compose Multiplatform", "Dynamic theme engines"],
  },
  {
    group: "Concurrency & Data",
    items: ["Kotlin Coroutines", "Flow / StateFlow", "Room (15+ prod migrations)", "DataStore + WorkManager", "Retrofit + OkHttp"],
  },
  {
    group: "Platform & Systems",
    items: ["Location engineering", "Sensor fusion", "Foreground services", "Hilt / Dagger", "Firebase + Mixpanel"],
  },
  {
    group: "Security & Ops",
    items: ["SQLCipher + Keystore", "SSL pinning", "BiometricPrompt", "Fastlane CI/CD · AGP 9", "Agentic workflows (MCP)"],
  },
];
