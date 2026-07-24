// Single source of truth for which app-repo media the site consumes.
// sync-project-media.mjs pulls these daily over raw.githubusercontent;
// rebuild-showcase.mjs validates every storyboard frame is listed here, so a
// film can never quietly reference a file the daily sync doesn't refresh —
// that's how the green-vintage-Mileway class of staleness stays dead.
// Format per project: [repoPathUnderDocs, destFilenameUnderScreenshots].
export const sync = {
  mileway: {
    repo: "darkpandawarrior/Mileway",
    files: [
      ["demo/tracking_flow.gif", "tracking_flow.gif"],
      ["demo/multiplatform.gif", "multiplatform.gif"],
      ["demo/log_miles.gif", "log_miles.gif"],
      ["screenshots/tracking_success_screen.png", "tracking_success_screen.png"],
      ["screenshots/track_detail_screen.png", "track_detail_screen.png"],
      ["screenshots/wear_dashboard.png", "wear_dashboard.png"],
      ["screenshots/desktop_dashboard.png", "desktop_dashboard.png"],
      // V22-V24 feature-wave flow gifs (docs/gifs/), one per README "Screenshots" subsection.
      ["gifs/super_profile_personas.gif", "super_profile_personas.gif"],
      ["gifs/track_a_trip.gif", "track_a_trip.gif"],
      ["gifs/delegation_manager.gif", "delegation_manager.gif"],
      ["gifs/log_and_expense.gif", "log_and_expense.gif"],
      ["gifs/approvals_payables.gif", "approvals_payables.gif"],
      ["gifs/verification_growth.gif", "verification_growth.gif"],
      ["gifs/membership.gif", "membership.gif"],
      ["gifs/ai_assistant.gif", "ai_assistant.gif"],
      ["gifs/onboarding_auth.gif", "onboarding_auth.gif"],
      ["gifs/wallet_payout.gif", "wallet_payout.gif"],
      ["gifs/account_sessions.gif", "account_sessions.gif"],
      // Showcase-film frames + hero-phone textures (rebaselined 2026-07-20 to
      // the current amber theme — the Jun-29 green "Matrix" batch is retired).
      ["screenshots/splash_screen.png", "splash_screen.png"],
      ["screenshots/login_screen.png", "login_screen.png"],
      ["screenshots/home_screen_loaded.png", "home_screen_loaded.png"],
      ["screenshots/track_miles_idle_screen.png", "track_miles_idle_screen.png"],
      ["screenshots/track_data_preview_overview_tab.png", "track_data_preview_overview_tab.png"],
      ["screenshots/expense_entry_screen.png", "expense_entry_screen.png"],
      ["screenshots/approvals_screen_pending_tab.png", "approvals_screen_pending_tab.png"],
      ["screenshots/payables_home_screen.png", "payables_home_screen.png"],
      ["screenshots/agent_chat_screen.png", "agent_chat_screen.png"],
      ["screenshots/plugin_manager_screen.png", "plugin_manager_screen.png"],
      ["screenshots/desktop_tracking.png", "desktop_tracking.png"],
      ["screenshots/route_map.png", "route_map.png"],
    ],
  },
  paymentslab: {
    repo: "darkpandawarrior/PaymentsLab",
    files: [
      // docs/demo/payment_flow.gif never existed upstream (404) — real gifs live at docs/gifs/.
      ["gifs/activity_flow.gif", "activity_flow.gif"],
      ["gifs/checkout_flow.gif", "checkout_flow.gif"],
      ["gifs/explore_verify_flow.gif", "explore_verify_flow.gif"],
      ["screenshots/home_screen_dashboard.png", "home_screen_dashboard.png"],
      ["screenshots/provider_lab_screen_running.png", "provider_lab_screen_running.png"],
      ["screenshots/checkout_screen_paying.png", "checkout_screen_paying.png"],
      ["screenshots/checkout_screen_settled_success.png", "checkout_screen_settled_success.png"],
      ["screenshots/history_screen_all.png", "history_screen_all.png"],
      // Showcase-film frames.
      ["screenshots/lab_home_screen_catalog.png", "lab_home_screen_catalog.png"],
      ["screenshots/provider_lab_screen_settled_success.png", "provider_lab_screen_settled_success.png"],
      ["screenshots/checkout_screen_order_summary.png", "checkout_screen_order_summary.png"],
      ["screenshots/history_screen_with_filters.png", "history_screen_with_filters.png"],
      ["screenshots/gateway_brand_badges.png", "gateway_brand_badges.png"],
      ["screenshots/ios_catalog_all_native.png", "ios_catalog_all_native.png"],
    ],
  },
  // Private repos (deadlock, HireSignal) — code stays unlinked from the site,
  // but the existing GITHUB_TOKEN CI secret already needs private-repo read
  // access for gen-hiresignal-stats.mjs (santifer/career-ops fork chain), and
  // a personal PAT with `repo` scope always covers its own owner's private
  // repos too, so this daily sync "just works" the same way as the public ones.
  deadlock: {
    repo: "darkpandawarrior/deadlock",
    files: [
      ["assets/readme/screenshots/title.webp", "title.webp"],
      ["assets/readme/screenshots/echo-cooperation.webp", "echo-cooperation.webp"],
      ["assets/readme/screenshots/the-sense.webp", "the-sense.webp"],
      ["assets/readme/screenshots/pull.webp", "pull.webp"],
      ["assets/readme/journey.gif", "journey.gif"],
      ["assets/readme/pipeline.gif", "pipeline.gif"],
      ["assets/readme/echo-stutter.svg", "echo-stutter.svg"],
    ],
  },
  hiresignal: {
    repo: "darkpandawarrior/HireSignal",
    // First three real Roborazzi captures (2026-07-24) — dashboard, board,
    // pipeline. More land here as the rest of the app's 13 screens get the
    // same screenshot-test treatment.
    files: [
      ["assets/banner.gif", "banner.gif"],
      ["screenshots/dashboard_screen.png", "dashboard_screen.png"],
      ["screenshots/board_screen.png", "board_screen.png"],
      ["screenshots/pipeline_screen.png", "pipeline_screen.png"],
    ],
  },
  kursi: {
    repo: "darkpandawarrior/Kursi",
    files: [
      ["gifs/home.gif", "home.gif"],
      ["gifs/onboarding.gif", "onboarding.gif"],
      ["gifs/modes.gif", "modes.gif"],
      ["gifs/turn.gif", "turn.gif"],
      ["gifs/darbar.gif", "darbar.gif"],
      ["gifs/coach.gif", "coach.gif"],
      ["gifs/online.gif", "online.gif"],
      ["gifs/table_sizes.gif", "table_sizes.gif"],
      ["gifs/career.gif", "career.gif"],
      ["gifs/reference.gif", "reference.gif"],
      ["screenshots/profile_setup.png", "profile_setup.png"],
      // Showcase-film frames + hero-phone texture.
      ["screenshots/home.png", "home.png"],
      ["screenshots/home_phone.png", "home_phone.png"],
      ["screenshots/tutorial_bluff_caught.png", "tutorial_bluff_caught.png"],
      ["screenshots/4p_pick_action.png", "4p_pick_action.png"],
      ["screenshots/4p_reaction_block.png", "4p_reaction_block.png"],
      ["screenshots/4p_chit_dossier.png", "4p_chit_dossier.png"],
      ["screenshots/darbar_table.png", "darbar_table.png"],
      ["screenshots/gauntlet.png", "gauntlet.png"],
      ["screenshots/results.png", "results.png"],
    ],
  },
};
