import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SIGNING_FINGERPRINT, INDEX_FINGERPRINT } from "../../api/_lib/pipeline-handler.ts";

/**
 * The signing card is the only claim on this site a stranger can verify
 * cryptographically, so it has to be exactly right — and for a while it was
 * not. It said each app "pins it in its own F-Droid metadata as
 * AllowedAPKSigningKeys", while the publishing repo's own import-metadata.py
 * states that Binaries, Builds and AllowedAPKSigningKeys "mean nothing to a
 * local repo" and its KEEP list drops them. Overstating how a signature is
 * enforced is worse than saying less.
 *
 * It also named one key while the chain has two, which made it read as one key
 * doing two jobs and hid the actual security property: the index key is
 * separate, so compromising the publishing site cannot forge an app update.
 */
describe("the signing claim", () => {
  const root = new URL("../../", import.meta.url).pathname;

  it("keeps the two keys distinct", () => {
    expect(SIGNING_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);
    expect(INDEX_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);
    expect(SIGNING_FINGERPRINT, "the APK key and the index key must not be the same").not.toBe(INDEX_FINGERPRINT);
  });

  it("defines each fingerprint exactly once across the API layer", () => {
    // ops-handler carried its own copy of the APK fingerprint for a while:
    // two constants that can disagree, on the page about claims that quietly
    // stop being true.
    const dir = join(root, "api", "_lib");
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => readFileSync(join(dir, f), "utf8").includes(`"${SIGNING_FINGERPRINT}"`));
    expect(hits, `the APK fingerprint is literal in more than one file: ${hits.join(", ")}`).toHaveLength(1);
  });

  it("no longer claims AllowedAPKSigningKeys enforces the pin", () => {
    const card = readFileSync(join(root, "src", "PipelineShowcase.tsx"), "utf8");
    expect(card).not.toMatch(/pins it in its own F-Droid\s+metadata/);
    expect(card, "the card should say what the index actually records").toMatch(/records it/);
  });

  it("shows the index key as well as the APK key", () => {
    const card = readFileSync(join(root, "src", "PipelineShowcase.tsx"), "utf8");
    expect(card).toContain("indexFingerprint");
    expect(card, "the separation is the property worth showing").toMatch(/cannot forge an app update/);
  });
});
