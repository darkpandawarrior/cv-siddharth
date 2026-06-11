export const profile = {
  name: "Siddharth Pandalai",
  title: "Senior Android Engineer",
  tagline: "I take Android apps from prototype to platform.",
  location: "Pune, India",
  email: "siddharthpandalai990@gmail.com",
  github: "https://github.com/darkpandawarrior",
  intro:
    "5+ years building production Android. Platform owner of a 738k-LOC, 92%-Compose SaaS app serving 50,000+ monthly users. I care about the unglamorous engineering that makes apps feel reliable: location accuracy, crash-free sessions, and architecture a team can move fast in.",
};

export const education = {
  school: "NIT Bhopal (MANIT)",
  degree: "B.Tech, Computer Science & Engineering",
  period: "2017 — 2021",
};

export const metrics = [
  { value: "50k+", label: "monthly active users", detail: "22k+ daily, platform owner at Dice.tech" },
  { value: "95%", label: "GPS accuracy", detail: "up from 50% — predictive dead reckoning" },
  { value: "80%", label: "crash reduction", detail: "Crashlytics + Sentry, threading bug hunts" },
  { value: "92%", label: "Jetpack Compose", detail: "of a 738k LOC app, 219 ViewModels" },
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
      "Platform owner for the Android app: 50k+ MAU, 22k+ DAU, 738k+ LOC, 219 ViewModels.",
      "Led the migration to 92% Jetpack Compose and built a custom theme engine that cut UI development friction by 60%.",
      "Reduced crashes by 80% through Crashlytics + Sentry triage, crash clustering, and fixing deep threading bugs.",
      "Hardened the app for VAPT compliance: SQLCipher + Android Keystore (AES-256), SSL pinning, BiometricPrompt with CryptoObject.",
      "Play Store rating up 85%, review volume up 80x.",
    ],
  },
  {
    company: "Jugnoo / Tookan / Jungleworks",
    role: "Software Engineer, Android",
    period: "Jan 2021 — May 2023",
    points: [
      "Built and shipped 20+ white-label client apps on a multi-tenant SaaS platform.",
      "Cut white-label delivery time by 80% with a configuration-driven build pipeline.",
      "Worked across a super-app architecture: ride hailing, delivery, and field-workforce products.",
    ],
  },
  {
    company: "John Deere India",
    role: "GET Intern",
    period: "May — Jul 2020",
    points: [
      "Built a sentiment-analysis and credit-risk scoring proof of concept for dealer financing.",
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
      "Spike detection to reject physically impossible fixes before they corrupted the track.",
      "Foreground service with a floating bubble UI to survive OEM battery restrictions and keep users informed.",
    ],
    outcome: "Tracking accuracy went from ~50% to 95%, making mileage reliable enough for expense reimbursement.",
    tags: ["Location", "Sensor fusion", "Foreground services"],
  },
  {
    slug: "crash-reduction",
    title: "80% crash reduction at 50k MAU",
    metric: "-80% crashes",
    summary: "Systematic triage with Crashlytics + Sentry turned a noisy crash feed into a fixable backlog.",
    problem:
      "A fast-growing 738k LOC app had a crash rate that hurt the Play Store rating, with the worst offenders being intermittent threading bugs nobody could reproduce.",
    approach: [
      "Crash clustering to separate symptom from cause — dozens of distinct stack traces collapsed into a handful of root bugs.",
      "Breadcrumb instrumentation to reconstruct the user journey before each crash.",
      "Targeted hunts for concurrency bugs: main-thread violations, race conditions in coroutine scopes, lifecycle leaks.",
    ],
    outcome: "Crashes down 80%; Play Store rating up 85% with 80x more reviews.",
    tags: ["Crashlytics", "Sentry", "Coroutines"],
  },
  {
    slug: "compose-migration",
    title: "92% Compose migration + theme engine",
    metric: "92% Compose",
    summary: "Migrated a 219-ViewModel app to Jetpack Compose and built a theme engine the whole team ships on.",
    problem:
      "XML views made every UI change slow and inconsistent, and the design team's theming requests required touching dozens of files.",
    approach: [
      "Incremental migration via interop — screens moved to Compose without blocking feature work.",
      "MVI-style single UiState per screen with StateFlow and collectAsStateWithLifecycle.",
      "Custom theme engine on CompositionLocal so brand and design tokens change in one place.",
      "Compose compiler metrics to keep recomposition under control as the codebase grew.",
    ],
    outcome: "92% of UI in Compose, UI development friction down 60%.",
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

export const skills: { group: string; items: string[] }[] = [
  {
    group: "UI & Architecture",
    items: ["Jetpack Compose", "MVVM + Clean Architecture", "MVI / single UiState", "Compose compiler metrics", "Custom design systems"],
  },
  {
    group: "Concurrency & Data",
    items: ["Kotlin Coroutines", "Flow / StateFlow", "Room (16 prod migrations)", "WorkManager", "Retrofit + OkHttp"],
  },
  {
    group: "Platform & Systems",
    items: ["Location engineering", "Sensor fusion", "Foreground services", "Hilt", "OEM battery survival"],
  },
  {
    group: "Security & Ops",
    items: ["SQLCipher + Keystore", "SSL pinning", "BiometricPrompt", "Crashlytics + Sentry", "Fastlane CI/CD"],
  },
];
