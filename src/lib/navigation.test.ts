import { describe, it, expect } from "vitest";
import { resolveSectionAction } from "./navigation";

describe("resolveSectionAction", () => {
  it("scrolls in place when already on the home route", () => {
    expect(resolveSectionAction("/")).toBe("scroll");
  });

  it("navigates home first from any other route", () => {
    expect(resolveSectionAction("/resume")).toBe("navigate");
    expect(resolveSectionAction("/project/mileway")).toBe("navigate");
    expect(resolveSectionAction("/lab")).toBe("navigate");
  });
});
