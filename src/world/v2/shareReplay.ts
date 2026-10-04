import { decodePath } from "../../lib/pathShare.ts";
import type { Ledger } from "./ledger.ts";
import { tourStops } from "./tour.ts";

/** The path codec owns validation, versioning and the known landmark ids. */
export function shareReplay(param: string | null | undefined, ledger: Ledger) {
  return tourStops(ledger, decodePath(param).map((id) => ({ kind: "landmark", id })));
}
