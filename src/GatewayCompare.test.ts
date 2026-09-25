// ponytail: no .test.tsx here — vitest.config.ts runs this project with no
// jsdom and an `include` glob scoped to `*.test.ts` (see EvidenceChip.test.ts,
// themeColor.test.ts and friends: this repo deliberately tests React logic as
// plain functions and reaches for `renderToString` only, never
// @testing-library/react). `createElement` stands in for JSX so this file
// can stay a plain `.ts` module under that same convention. (The lane brief
// named this file GatewayCompare.test.tsx; that extension is silently never
// picked up by vitest run's own include glob — verified empirically — so
// this keeps the working precedent instead.)
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { findProvider, GatewayCompare } from "./GatewayCompare.tsx";
import { providers } from "./data/providers.ts";

describe("findProvider", () => {
  const list = [
    { slug: "stripe", name: "Stripe", region: "Global", archetype: "native-sdk", archetypeLabel: "Native SDK", status: "SANDBOX_READY" },
    { slug: "cash", name: "Cash", region: "Global", archetype: "mobile-money", archetypeLabel: "Mobile money", status: "MOCK_MODE" },
  ];

  it("finds a provider by slug", () => {
    expect(findProvider("stripe", list)).toEqual(list[0]);
  });

  it("returns undefined for an unknown slug rather than throwing", () => {
    expect(findProvider("not-a-real-gateway", list)).toBeUndefined();
  });

  it("defaults to the real generated catalog when no list is passed", () => {
    expect(findProvider(providers[0].slug)).toEqual(providers[0]);
  });
});

describe("GatewayCompare SSR", () => {
  it("renders both selects with every cataloged provider as an option, no hand-typed list", () => {
    const html = renderToString(createElement(GatewayCompare));
    expect(html).toContain(`${providers.length}`);
    expect(html).toContain("cataloged gateways");
    expect((html.match(/<select/g) ?? []).length).toBe(2);
    for (const p of providers.slice(0, 3)) {
      expect(html).toContain(p.name);
    }
  });

  it("is deterministic: two renders produce identical output", () => {
    const first = renderToString(createElement(GatewayCompare));
    const second = renderToString(createElement(GatewayCompare));
    expect(second).toBe(first);
  });
});
