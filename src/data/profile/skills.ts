// Split from profile.ts along its export seams (arch-L15).

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

