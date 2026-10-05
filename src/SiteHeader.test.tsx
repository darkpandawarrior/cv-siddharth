import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader.tsx";

it("renders identical route chrome across two server renders", () => {
  const header = <SiteHeader><nav><a href="/">Portfolio</a></nav></SiteHeader>;
  const first = renderToString(header);
  expect(renderToString(header)).toBe(first);
  expect(first).toContain('<header data-spine="route-header"');
  expect(first).toContain("print:hidden");
  expect(first).toContain('<nav><a href="/">Portfolio</a></nav>');
});
