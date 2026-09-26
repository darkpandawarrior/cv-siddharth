// ponytail: .test.ts, not .test.tsx — see GatewayCompare.test.ts's own note.
// vitest.config.ts's `include` glob only picks up `*.test.ts`.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { repoOf, agoLabel, CiStrip } from "./CiStrip.tsx";

describe("repoOf", () => {
  it("matches a GitHub link whose repo name equals the slug, case/hyphen-insensitive", () => {
    expect(repoOf("paymentslab-kmp", [{ label: "GitHub", url: "https://github.com/darkpandawarrior/PaymentsLab-KMP" }])).toBe(
      "darkpandawarrior/PaymentsLab-KMP",
    );
    expect(repoOf("doori", [{ label: "GitHub", url: "https://github.com/darkpandawarrior/Doori" }])).toBe("darkpandawarrior/Doori");
  });

  it("ignores links that point at a different repo (siblings, foundations)", () => {
    const links = [
      { label: "kmp-toolkit", url: "https://github.com/darkpandawarrior/kmp-toolkit" },
      { label: "Doori (sibling KMP app)", url: "#project/doori" },
    ];
    expect(repoOf("kmp-family", links)).toBeNull();
  });

  it("returns null for an empty links array (stutter)", () => {
    expect(repoOf("stutter", [])).toBeNull();
  });
});

describe("agoLabel", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("is null before the clock has ticked (SSR / first paint)", () => {
    expect(agoLabel("2026-09-24T09:00:00Z", null)).toBeNull();
  });

  it("renders whole hours under 48h", () => {
    expect(agoLabel("2026-09-24T09:00:00Z", now)).toBe("3 h ago");
  });

  it("renders minutes under an hour", () => {
    expect(agoLabel("2026-09-24T11:45:00Z", now)).toBe("15 m ago");
  });

  it("renders days at 48h and beyond", () => {
    expect(agoLabel("2026-09-20T12:00:00Z", now)).toBe("4 d ago");
  });
});

describe("CiStrip SSR", () => {
  it("renders the fixed private label for a project with no repo link at all", () => {
    const html = renderToString(createElement(CiStrip, { slug: "stutter", links: [] }));
    expect(html).toContain("private, not polled");
  });

  it("renders nothing for a public project whose links never match its own slug", () => {
    const html = renderToString(
      createElement(CiStrip, {
        slug: "kmp-family",
        links: [{ label: "kmp-toolkit", url: "https://github.com/darkpandawarrior/kmp-toolkit" }],
      }),
    );
    expect(html).toBe("");
  });

  it("is deterministic for a matched repo before hydration (no fabricated age)", () => {
    const links = [{ label: "GitHub", url: "https://github.com/darkpandawarrior/PaymentsLab-KMP" }];
    const first = renderToString(createElement(CiStrip, { slug: "paymentslab-kmp", links }));
    const second = renderToString(createElement(CiStrip, { slug: "paymentslab-kmp", links }));
    expect(second).toBe(first);
    expect(first).toContain("no public push in the last 20 events");
  });
});
