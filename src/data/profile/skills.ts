// Split from profile.ts along its export seams (arch-L15).

import { projects } from "./projects.ts";

const STOPWORDS = new Set(["and", "the", "a", "for", "with", "in", "on", "of", "to", "via"]);

/** Lowercased, punctuation-stripped whole words, 3+ letters — short enough to
 *  skip real terms ("AI", "R8") but that keeps this a coarse skill-to-tech
 *  matcher rather than a semantic one; see provenIn's own comment. */
function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[()+/·,._-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Every project's own vocabulary: `stack` plus every `detail.techStack`
 *  group's items — built once, not per lookup. */
const PROJECT_WORDS: { slug: string; words: Set<string> }[] = projects.map((p) => {
  const bag = new Set(p.stack.flatMap((s) => [...words(s)]));
  for (const group of p.detail?.techStack ?? []) {
    for (const item of group.items) for (const w of words(item)) bag.add(w);
  }
  return { slug: p.slug, words: bag };
});

/**
 * Which projects' own stack/techStack actually names this skill — no hand
 * list to drift out of sync with the registry, at the cost of being a coarse
 * word-overlap match rather than a semantic one (a skill and a project share
 * a real, non-stopword word). Good enough for "1-3 project links under a
 * filtered skill", not for anything asserting a project does NOT use a skill.
 * ponytail: O(skills × projects × words), fine at this corpus size — index by
 * word if the registry ever grows past a few dozen projects.
 */
export function provenIn(skill: string): string[] {
  const needle = words(skill);
  if (needle.size === 0) return [];
  return PROJECT_WORDS.filter((p) => [...needle].some((w) => p.words.has(w))).map((p) => p.slug);
}

export const skills: { group: string; items: string[] }[] = [
  {
    group: "UI & Architecture",
    items: ["Jetpack Compose + Material 3", "MVVM + Clean Architecture", "MVI / single UiState", "Multi-module architecture", "Repository pattern", "SOLID & design patterns", "Navigation", "Custom views", "Accessibility", "Kotlin/Compose Multiplatform (iOS, Wear OS)", "Dynamic theme engines"],
  },
  {
    group: "Concurrency & Data",
    items: ["Kotlin Coroutines", "Flow operators / StateFlow / SharedFlow", "Structured concurrency", "Room (SQLite, 24 migrations)", "Paging 3", "DataStore + WorkManager", "Retrofit + OkHttp + Ktor (REST, WebSockets)", "caching"],
  },
  {
    group: "Platform & Systems",
    items: ["Android SDK", "ViewModel & Lifecycle", "Location (dead reckoning + Kalman)", "Geofence-gated service levels", "Foreground services", "CameraX + ML Kit", "Deep linking", "Localization", "Hilt / Dagger / Koin (dependency injection)", "Crashlytics + Sentry + Mixpanel", "Performance monitoring & memory profiling", "A/B testing & feature flags", "Push notifications (FCM)"],
  },
  {
    // Every item here is evidenced in the experience bullets and verified by
    // claim-audit: mentoring and hiring loops at Dice, cross-team roadmap work
    // at Jugnoo, the review standards he sets, and the sprint planning he runs
    // as Product Owner. They are named here because the bullets carrying them
    // live on the full record only, and a recruiter searching "mentoring" or
    // "code review" should still find him on the shorter cuts.
    group: "Leadership & Process",
    items: ["Cross-functional collaboration", "Stakeholder management & roadmap planning", "Mentoring & hiring loops", "Code review standards", "Agile sprint planning"],
  },
  {
    group: "Security & Ops",
    items: ["Android Keystore (AES-256)", "OAuth 2.0, JWT & token refresh", "SSL pinning (9 domains)", "BiometricPrompt access gate", "EncryptedSharedPreferences + Tink", "Fastlane · GitLab CI · AGP 9 · Gradle Kotlin DSL · Git · Android Studio", "ProGuard / R8 · AAB", "Google Play Console", "Unit testing and instrumented testing", "Agentic workflows (MCP)"],
  },
];

// Granular 8-group layout for the résumé view — matches PDF structure for ATS coverage
export const resumeSkills: { group: string; items: string[] }[] = [
  {
    group: "UI",
    items: ["Jetpack Compose", "Material 3", "Custom views", "Accessibility (contentDescription, TalkBack)", "Compose-View interop", "Compose Multiplatform"],
  },
  {
    group: "Architecture",
    items: ["Clean Architecture", "MVVM", "MVI", "Multi-module architecture", "Repository pattern", "SOLID & design patterns", "Kotlin Multiplatform (KMP, building depth)"],
  },
  {
    group: "Concurrency & DI",
    items: ["Kotlin Coroutines", "Flow operators & reactive streams", "StateFlow / SharedFlow", "RxJava (legacy interop)", "Structured concurrency", "Hilt", "Dagger", "Koin", "Dependency injection", "LiveData"],
  },
  {
    group: "Data & Networking",
    items: ["Room (SQLite, 24 schema migrations across 2 databases)", "Paging 3", "HTTP & image caching", "JSON serialization", "DataStore", "Retrofit", "OkHttp", "Ktor", "REST APIs", "WebSockets"],
  },
  {
    group: "Platform",
    items: ["Android SDK", "ViewModel & Lifecycle", "Navigation", "WorkManager", "Foreground Services", "CameraX + ML Kit (on-device OCR)", "Deep linking", "Geofence-gated service levels", "Localization (18 locales)", "Performance monitoring", "Memory & lifecycle leak fixes", "Location / dead reckoning + Kalman filtering", "Firebase Crashlytics + Sentry", "Analytics instrumentation (Mixpanel)", "Push notifications (FCM)", "A/B testing & feature flags", "Battery optimisation"],
  },
  {
    group: "Security",
    items: ["Android Keystore (AES-256)", "OAuth 2.0, JWT & token refresh", "SSL pinning", "BiometricPrompt", "EncryptedSharedPreferences", "VAPT compliance"],
  },
  {
    group: "Leadership & Process",
    items: ["Cross-functional collaboration", "Stakeholder management & roadmap planning", "Mentoring & hiring loops", "Code review standards", "Agile sprint planning"],
  },
  {
    group: "Build, CI/CD & Tools",
    // Honest ceiling: claims.json verifies 31 unit-test files and 4 androidTest
    // files at Dice — no framework name, coverage figure or outcome, since none
    // of those is verified and the guard regex forbids the outcome phrasing.
    items: ["Gradle (Kotlin DSL)", "AGP 9", "Fastlane", "GitLab CI", "ProGuard / R8", "Git", "Android Studio", "Figma", "Unit testing and instrumented testing", "Macrobenchmark & Baseline Profiles", "Google Play Console & release management", "Firebender + MCP agentic workflows", "LLM provider integration (Groq, Gemini, Claude)"],
  },
];

