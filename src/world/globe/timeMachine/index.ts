/** W13's pure integration seam. Keeping browser, store and renderer imports
 *  out lets replay math run under fixture tests and inside any future worker.
 *  The UI owns clock ticks; renderers own fetching and texture disposal. */
export * from "./rangeModel.ts";
export * from "./usgsHistory.ts";
export * from "./gibsDates.ts";
export * from "./compare.ts";
