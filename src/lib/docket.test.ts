import { describe, it, expect } from "vitest";
import { splitDocket } from "./docket.ts";

describe("splitDocket", () => {
  it("splits a leading docket from the next line", () => {
    expect(splitDocket("> some text\nrest of the body")).toEqual({
      docket: "some text",
      rest: "rest of the body",
    });
  });

  it("consumes separating blank lines but preserves body indentation and trailing whitespace", () => {
    expect(splitDocket("> some text\n \t\n\n  rest of the body  \n")).toEqual({
      docket: "some text",
      rest: "  rest of the body  \n",
    });
  });

  it("trims spaces and tabs around the docket text", () => {
    expect(splitDocket("> \t  spaced text  \t \nrest")).toEqual({
      docket: "spaced text",
      rest: "rest",
    });
  });

  it("returns a body without a leading blockquote verbatim", () => {
    const body = " \tOpening prose\n\nClosing prose  \n";
    expect(splitDocket(body)).toEqual({ docket: null, rest: body });
  });

  it("accepts a docket at the end of the string without a newline", () => {
    expect(splitDocket("> some text")).toEqual({ docket: "some text", rest: "" });
  });

  it("leaves a blockquote on the second line in the body", () => {
    const body = "Opening prose\n> quoted text\nrest";
    expect(splitDocket(body)).toEqual({ docket: null, rest: body });
  });

  it("does not skip whitespace before a blockquote", () => {
    const body = " > quoted text\nrest";
    expect(splitDocket(body)).toEqual({ docket: null, rest: body });
  });

  it("extracts the documented relay slug from an entry", () => {
    expect(splitDocket("> Entry #2250 · Series 7 of 16, Alpha Axmoiri System\n\nThe relay arrived.\n\n> A later quotation.")).toEqual({
      docket: "Entry #2250 · Series 7 of 16, Alpha Axmoiri System",
      rest: "The relay arrived.\n\n> A later quotation.",
    });
  });

  it("accepts CRLF line endings and consumes the separating blank line", () => {
    expect(splitDocket("> some text\r\n\r\nrest\r\n")).toEqual({
      docket: "some text",
      rest: "rest\r\n",
    });
  });
});
