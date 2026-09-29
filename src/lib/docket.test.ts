import { describe, expect, it } from "vitest";
import { splitDocket } from "./docket.ts";

describe("splitDocket", () => {
  it("splits a leading blockquote line off the rest of the body", () => {
    expect(splitDocket("> some text\nrest of the body")).toEqual({
      docket: "some text",
      rest: "rest of the body",
    });
  });

  it("consumes a blank line separating the docket from the rest", () => {
    expect(splitDocket("> some text\n\nrest of the body")).toEqual({
      docket: "some text",
      rest: "rest of the body",
    });
  });

  it("trims leading/trailing whitespace inside the docket line itself", () => {
    expect(splitDocket("> \t  spaced text  \t\nrest")).toEqual({
      docket: "spaced text",
      rest: "rest",
    });
  });

  it("returns docket null and the body verbatim when there is no leading blockquote", () => {
    const body = "  no leading blockquote here\nmore text";
    expect(splitDocket(body)).toEqual({ docket: null, rest: body });
  });

  it("handles a body that is only the docket line with no trailing content", () => {
    expect(splitDocket("> only line")).toEqual({ docket: "only line", rest: "" });
  });

  it("does not treat a blockquote on a later line as the docket", () => {
    const body = "first line\n> quoted\nmore";
    expect(splitDocket(body)).toEqual({ docket: null, rest: body });
  });

  it("handles a real docket format from the corpus (the folio)", () => {
    expect(splitDocket("> Page 30 of 91\nThe rest of the entry follows here.")).toEqual({
      docket: "Page 30 of 91",
      rest: "The rest of the entry follows here.",
    });
  });
});
