/**
 * PATHSHARE — this lane's own task list (idea-atlas.md PATH-7 / PATH-3
 * "your route through the valley is a replayable link"; master-plan.md
 * #M26/#M55): encode/decode of touched landmark ids as
 * `?path=1.<base64url ids>` — a version prefix first (an unknown version
 * decodes to `[]`, never throws or half-parses), unknown ids dropped on
 * decode, and a junk param of any size decodes to `[]` without throwing.
 *
 * "Landmark ids" means `LANDMARK_OPENS`'s own keys (`landmarkBindings.ts`,
 * already merged and exported) — the one place this codebase already
 * enumerates the world's named, routable landmarks. Reusing it here (never
 * a second hand-kept list, and never reaching into `ledger.ts`/`worldModel`
 * to rebuild one) is the whole reason this module can stay a plain string
 * codec with zero three/R3F/ledger imports.
 *
 * `sessionRipple.ts`'s `touch`/`getTouched` already track the visitor's
 * whole site path (registry slugs and StoryMap nodes, not landmark-scoped);
 * `hud/PathControls.tsx` is what narrows that list to landmark ids before
 * calling `encodePath`, and calls `touch(id)` for whatever `decodePath`
 * hands back on load. This module itself never touches that store, or any
 * other global state — a pure string in, string/array out codec, the same
 * split `driveSpline.ts` keeps from `Hodi.tsx`.
 */
import { LANDMARK_OPENS } from "../world/v2/landmarkBindings.ts";

export const PATH_SHARE_VERSION = 1;
export const PATH_SHARE_PARAM = "path";

const DELIMITER = ",";
/** Well above the payload a real touched-landmark list could ever produce
 *  (there are 19 landmarks total, world-v2-spec.md's own table) but far
 *  below "somebody pasted a whole file into the query string" — the guard
 *  the acceptance's own "2 kB junk param" probe exists to prove. */
const MAX_PAYLOAD_LENGTH = 4096;

export const KNOWN_LANDMARK_IDS: ReadonlySet<string> = new Set(Object.keys(LANDMARK_OPENS));

function toBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(padLength));
}

/** Encodes the given landmark ids (order preserved, exactly as given — the
 *  caller decides whether to dedupe/order) into `<version>.<base64url>`. */
export function encodePath(landmarkIds: readonly string[]): string {
  return `${PATH_SHARE_VERSION}.${toBase64Url(landmarkIds.join(DELIMITER))}`;
}

/**
 * Decodes a `path` query param back into the landmark ids it names. Returns
 * `[]` — never throws — for: no param, no version separator, an unknown
 * version, an over-length payload, or a payload that isn't valid base64url;
 * unknown ids are silently dropped from an otherwise-valid decode.
 */
export function decodePath(param: string | null | undefined, knownIds: ReadonlySet<string> = KNOWN_LANDMARK_IDS): string[] {
  if (!param) return [];
  const dot = param.indexOf(".");
  if (dot === -1) return [];
  const version = Number(param.slice(0, dot));
  if (version !== PATH_SHARE_VERSION) return [];
  const payload = param.slice(dot + 1);
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_LENGTH) return [];
  let decoded: string;
  try {
    decoded = fromBase64Url(payload);
  } catch {
    return [];
  }
  return decoded.split(DELIMITER).filter((id) => id.length > 0 && knownIds.has(id));
}

/** Builds a shareable absolute URL for the current page plus the encoded
 *  path — `hud/PathControls.tsx`'s own "copy path link" button. Kept here
 *  (rather than inlined there) so it stays testable without mounting a
 *  component. */
export function buildShareUrl(base: string, landmarkIds: readonly string[]): string {
  const url = new URL(base);
  url.searchParams.set(PATH_SHARE_PARAM, encodePath(landmarkIds));
  return url.toString();
}
