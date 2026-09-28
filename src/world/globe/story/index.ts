/** Story data remains independent of renderers and browser state. Source imports
 * derive claims rather than freeze a second set of numbers. Explicit precision
 * stops animation time becoming historical certainty; snapshot notes stop Play
 * install floors becoming invented launch dates or threshold-crossing dates.
 *
 * Geography is an allowlist with coordinate equality, not a name heuristic.
 * Missing places use symbolic height over Pune, never a guessed destination.
 * Arc guards reject unknown endpoints and same-city travel. The camera's world
 * units and the player's milliseconds are artistic controls, not factual scale.
 * LayerId is imported only as a type so this pure API does not load React/store.
 * Consumers must show dateNote, source and metric.source beside each claim. */
export * from "./storyGeo.ts";
export * from "./storyModel.ts";
export * from "./storyPlayer.ts";
