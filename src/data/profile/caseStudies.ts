// Split from profile.ts along its export seams (arch-L15).

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
    metric: "49 modules · 5 platforms · offline AI",
    summary:
      "An open-source app I designed and built end-to-end: mileage, travel & expense tracking that runs entirely offline across Android, iOS, Wear OS, watchOS and Compose Desktop from one shared Kotlin codebase. Offline-first on Room + DataStore, with a real Kotlin/Ktor backend built and tested, off by default, so the whole thing stays reproducible and reviewable by anyone.",
    problem:
      "I wanted a clean, inspectable reference for the architecture I advocate for at scale: Compose Multiplatform, strict module isolation, MVI state, a real location engine and a real policy/reimbursement layer. Built offline-first, with the real backend opt-in, so the whole thing stays reproducible and reviewable by anyone.",
    approach: [
      "49-module clean architecture: 13 feature modules that never depend on each other, meeting only at the :app composition root, wired with Koin.",
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

