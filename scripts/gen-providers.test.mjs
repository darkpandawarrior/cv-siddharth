import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyArchetype, parseProviderDoc, buildProviders, ARCHETYPES } from "./gen-providers.mjs";

const dirs = [];
function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("classifyArchetype", () => {
  it("A, bare or with a caveat, is always native-sdk", () => {
    expect(classifyArchetype("A (native SDK — AlphaSDK)")).toBe("native-sdk");
    expect(classifyArchetype("A (native SDK, India) / C (REST, LATAM) in reality")).toBe("native-sdk");
  });

  it("C, bare, assumed, or prefixed with 'shipped as', is always hosted-webview", () => {
    expect(classifyArchetype("C (hosted checkout) — per general conventions.")).toBe("hosted-webview");
    expect(classifyArchetype("C (hosted checkout), assumed.")).toBe("hosted-webview");
    expect(classifyArchetype("shipped as C (hosted checkout) for catalog consistency, but the plan flags this")).toBe(
      "hosted-webview",
    );
  });

  it("D, bare or as 'Archetype-D-...', is always mobile-money", () => {
    expect(classifyArchetype("D (async mobile money, poll) — per the plan's reference")).toBe("mobile-money");
    expect(classifyArchetype("Archetype-D-simplest (per `CashGateway`'s own KDoc) — a record-only gateway")).toBe(
      "mobile-money",
    );
  });

  it("a literal 'internal rail' mention wins regardless of any letter nearby", () => {
    expect(classifyArchetype('Archetype-E ("internal rail," per `WalletGateway`\'s own KDoc) — backed entirely')).toBe(
      "internal",
    );
  });

  it("'Tier-4 stub' is always stub", () => {
    expect(classifyArchetype("Tier-4 stub — catalog entry + research doc only, no working integration.")).toBe("stub");
  });

  it("text that disclaims the lettered taxonomy falls to other, never a forced guess", () => {
    expect(
      classifyArchetype("no SDK, no partner onboarding — a raw NPCI `upi://pay` deep link handed to the system"),
    ).toBe("other");
  });
});

describe("parseProviderDoc", () => {
  const FIXTURE = [
    "# AcceptCard",
    "",
    "- **Region:** Global",
    "- **Archetype:** C (hosted checkout) — likely MPGS Hosted Checkout, unconfirmed this session.",
    "- **Status shipped:** `MOCK_MODE`.",
    "- **Docs:** not tracked down this session.",
    "",
    "Catalog entry per the plan's rule.",
    "",
  ].join("\n");

  it("reads name from the H1, slug from the filename, archetype label from the classifier", () => {
    const p = parseProviderDoc(FIXTURE, "acceptcard.md");
    expect(p).toEqual({
      slug: "acceptcard",
      name: "AcceptCard",
      region: "Global",
      archetype: "hosted-webview",
      archetypeLabel: "Hosted webview",
      status: "MOCK_MODE",
    });
  });

  it("joins a Region field wrapped across continuation lines into one string (savvy.md's real shape)", () => {
    const wrapped = [
      "# Savvy",
      "",
      "- **Region:** unconfirmed (the provider name alone suggests an NMI-backed",
      "  white-label integration)",
      "- **Archetype:** C (hosted checkout), assumed.",
      "- **Status shipped:** `MOCK_MODE`.",
      "",
    ].join("\n");
    expect(parseProviderDoc(wrapped, "savvy.md").region).toBe(
      "unconfirmed (the provider name alone suggests an NMI-backed white-label integration)",
    );
  });

  it("falls back to the slug when a doc somehow has no H1", () => {
    const noH1 = "- **Region:** Global\n- **Archetype:** C (hosted checkout)\n- **Status shipped:** `MOCK_MODE`.\n";
    expect(parseProviderDoc(noH1, "nameless.md").name).toBe("nameless");
  });
});

/** The 10-file fixture below stands in for the acceptance line's "75 on the
 *  fixture directory" — a real `PaymentsLab` checkout isn't available in CI,
 *  so this is docs/providers/*.md's exact shape at a size a test can hand-
 *  author ground truth for. Every archetype bucket is represented, plus the
 *  two edge shapes the real corpus actually has (cash.md's "Archetype-D-
 *  simplest", upi-intent.md's taxonomy-disclaiming "other"). */
const FIXTURES = {
  "alpha.md": ["Native", "Global", "A (native SDK — AlphaSDK)"],
  "bravo.md": ["Bravo", "India", "C (hosted checkout) — per general conventions."],
  "charlie.md": ["Charlie", "MENA", "C (hosted checkout), assumed."],
  "delta.md": ["Delta", "Africa", "D (async mobile money, poll)"],
  "echo.md": ["Echo (Cash)", "Global", "Archetype-D-simplest (per `CashGateway`'s own KDoc) — record-only."],
  "foxtrot.md": ["Foxtrot", "LATAM", "shipped as C (hosted checkout) for catalog consistency."],
  "golf.md": ["Golf (Wallet)", "Global", 'Archetype-E ("internal rail," per `WalletGateway`\'s own KDoc).'],
  "hotel.md": ["Hotel", "EU", "Tier-4 stub — catalog entry + research doc only."],
  "india.md": ["India (UPI)", "India", "no SDK, no partner onboarding — a raw NPCI deep link."],
  "juliet.md": ["Juliet", "SEA", "A (native SDK, India) / C (REST, LATAM) in reality"],
};
const EXPECTED_ARCHETYPES = {
  "native-sdk": ["alpha.md", "juliet.md"],
  "hosted-webview": ["bravo.md", "charlie.md", "foxtrot.md"],
  "mobile-money": ["delta.md", "echo.md"],
  internal: ["golf.md"],
  stub: ["hotel.md"],
  other: ["india.md"],
};

function writeFixtureDir() {
  const dir = tmp("providers-fixture-");
  for (const [file, [name, region, archetype]] of Object.entries(FIXTURES)) {
    writeFileSync(
      join(dir, file),
      `# ${name}\n\n- **Region:** ${region}\n- **Archetype:** ${archetype}\n- **Status shipped:** \`MOCK_MODE\`.\n- **Docs:** https://example.com\n`,
    );
  }
  return dir;
}

describe("buildProviders", () => {
  it("returns null for a directory that does not exist — the caller decides the fallback", () => {
    expect(buildProviders(join(tmp("providers-empty-"), "no-such-dir"))).toBeNull();
  });

  it("providers.length equals the fixture directory's .md count, and archetype counts equal the per-archetype file counts", () => {
    const dir = writeFixtureDir();
    const providers = buildProviders(dir);
    expect(providers).toHaveLength(Object.keys(FIXTURES).length);

    for (const archetype of ARCHETYPES.map((a) => a.id)) {
      const got = providers.filter((p) => p.archetype === archetype).map((p) => p.slug + ".md").sort();
      expect(got, archetype).toEqual([...(EXPECTED_ARCHETYPES[archetype] ?? [])].sort());
    }
  });

  it("is sorted by slug, deterministically", () => {
    const dir = writeFixtureDir();
    const slugs = buildProviders(dir).map((p) => p.slug);
    expect(slugs).toEqual([...slugs].sort());
  });
});

/**
 * End-to-end (spawned, sandboxed — same shape as gen-project-stats.test.mjs's
 * scratchRepo): the acceptance line in full. A missing sibling leaves
 * providers.ts byte-identical and exits 0; a present sibling regenerates it
 * from the fixture directory; two runs over unchanged input are idempotent.
 */
function scratchRepo() {
  const root = tmp("gen-providers-e2e-");
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "src", "data"), { recursive: true });
  copyFileSync(new URL("gen-providers.mjs", import.meta.url), join(root, "scripts/gen-providers.mjs"));
  return root;
}

const COMMITTED_FIXTURE =
  "// AUTO-GENERATED by scripts/gen-providers.mjs — do not edit by hand.\n" +
  "export interface Provider { slug: string; name: string; region: string; archetype: string; archetypeLabel: string; status: string }\n\n" +
  'export const providers: Provider[] = [{ "slug": "acceptcard", "name": "AcceptCard", "region": "Global", "archetype": "hosted-webview", "archetypeLabel": "Hosted webview", "status": "MOCK_MODE" }] as const;\n';

describe("gen-providers.mjs (spawned, sandboxed)", () => {
  it("missing sibling: leaves providers.ts byte-identical, exit 0", () => {
    const root = scratchRepo();
    const outPath = join(root, "src/data/providers.ts");
    writeFileSync(outPath, COMMITTED_FIXTURE);

    const result = spawnSync(process.execPath, [join(root, "scripts/gen-providers.mjs")], {
      env: { ...process.env, CV_REPOS_ROOT: join(root, "no-such-repos-root") },
      encoding: "utf8",
      timeout: 15000,
    });

    expect(result.status).toBe(0);
    expect(readFileSync(outPath, "utf8")).toBe(COMMITTED_FIXTURE);
  }, 20000);

  it("missing sibling and nothing committed: exits non-zero rather than fabricating a catalog", () => {
    const root = scratchRepo();
    const result = spawnSync(process.execPath, [join(root, "scripts/gen-providers.mjs")], {
      env: { ...process.env, CV_REPOS_ROOT: join(root, "no-such-repos-root") },
      encoding: "utf8",
      timeout: 15000,
    });
    expect(result.status).not.toBe(0);
  }, 20000);

  it("sibling present: regenerates providers.ts from the fixture directory, and never leaks a secret-shaped string", () => {
    const root = scratchRepo();
    const providersDir = join(root, "android-root", "Android", "PaymentsLab", "docs", "providers");
    mkdirSync(providersDir, { recursive: true });
    for (const [file, [name, region, archetype]] of Object.entries(FIXTURES)) {
      writeFileSync(
        join(providersDir, file),
        `# ${name}\n\n- **Region:** ${region}\n- **Archetype:** ${archetype}\n- **Status shipped:** \`MOCK_MODE\`.\n- **Docs:** https://example.com\n`,
      );
    }

    const outPath = join(root, "src/data/providers.ts");
    const result = spawnSync(process.execPath, [join(root, "scripts/gen-providers.mjs")], {
      env: { ...process.env, CV_REPOS_ROOT: join(root, "android-root") },
      encoding: "utf8",
      timeout: 15000,
    });

    expect(result.status).toBe(0);
    const written = readFileSync(outPath, "utf8");
    expect(written).toMatch(/"slug": "alpha"/);
    expect(written).not.toMatch(/sk_live|secret|api[_-]?key/i);

    // A second run over the same, unchanged fixture directory must not
    // rewrite the file — idempotent, no wall-clock stamp to drift.
    const second = spawnSync(process.execPath, [join(root, "scripts/gen-providers.mjs")], {
      env: { ...process.env, CV_REPOS_ROOT: join(root, "android-root") },
      encoding: "utf8",
      timeout: 15000,
    });
    expect(second.status).toBe(0);
    expect(readFileSync(outPath, "utf8")).toBe(written);
  }, 20000);
});
