import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DOCTRINE_LAWS } from "./doctrine.ts";

/**
 * The doctrine wall cannot claim a test it does not have. Every law's
 * `testFile` must exist and its content must literally contain `testName`
 * (P2-14 acceptance) - the same "the repo can know this about itself"
 * contract ops.test.ts already runs against the freshness perimeter.
 */
describe("the doctrine wall cannot lie about itself", () => {
  const root = new URL("../../", import.meta.url).pathname;

  it("names at least the four laws", () => {
    expect(DOCTRINE_LAWS.length).toBeGreaterThanOrEqual(4);
  });

  it("has unique ids", () => {
    const ids = DOCTRINE_LAWS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const law of DOCTRINE_LAWS) {
    describe(law.id, () => {
      it("names a test file that exists", () => {
        expect(existsSync(join(root, law.testFile)), `${law.testFile} does not exist`).toBe(true);
      });

      it("that file contains the named test", () => {
        const body = readFileSync(join(root, law.testFile), "utf8");
        expect(body.includes(law.testName), `${law.testFile} does not contain "${law.testName}"`).toBe(true);
      });
    });
  }

  // idea-atlas I6 / P2-14 acceptance: the harness is never named with a
  // path, a skill or a count on the one file that lists what enforces this
  // site's own laws.
  it("never names the private harness, a skill, or a filesystem path", () => {
    const body = readFileSync(join(root, "src/data/doctrine.ts"), "utf8");
    expect(/AgentHarness|skill|~\//.test(body)).toBe(false);
  });
});
