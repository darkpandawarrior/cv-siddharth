import { describe, it, expect } from "vitest";
import { altitudeFor, focusHandoffUrl } from "./altitude.ts";

describe("altitudeFor", () => {
  it("classifies each room route", () => {
    expect(altitudeFor("/playground")).toBe("street");
    expect(altitudeFor("/map")).toBe("orbit");
    expect(altitudeFor("/map?focus=kmp-family")).toBe("orbit");
    expect(altitudeFor("/globe")).toBe("globe");
    expect(altitudeFor("/globe?focus=pune")).toBe("globe");
  });

  it("falls back to street for the home route and any unknown pathname, never throws", () => {
    expect(altitudeFor("/")).toBe("street");
    expect(altitudeFor("/nonexistent-room")).toBe("street");
    expect(altitudeFor("")).toBe("street");
  });
});

describe("focusHandoffUrl", () => {
  it("row 1: STREET at a landmark -> ORBIT, node centred and lit", () => {
    expect(focusHandoffUrl("street", "orbit", "hodi")).toBe("/map?focus=hodi");
  });

  it("row 2: STREET at the Sangam -> ORBIT, the foundation node", () => {
    expect(focusHandoffUrl("street", "orbit", "kmp-family")).toBe("/map?focus=kmp-family");
  });

  it("row 3: ORBIT -> GLOBE always arrives at Pune, ignoring any slug", () => {
    expect(focusHandoffUrl("orbit", "globe")).toBe("/globe?focus=pune");
    expect(focusHandoffUrl("orbit", "globe", "some-node")).toBe("/globe?focus=pune");
  });

  it("row 4: GLOBE or ORBIT node -> STREET, the hodi moored there", () => {
    expect(focusHandoffUrl("globe", "street", "hodi")).toBe("/playground?at=hodi");
    expect(focusHandoffUrl("orbit", "street", "hodi")).toBe("/playground?at=hodi");
  });

  it("row 4 with no slug: the daypart spawn, not a broken query string", () => {
    expect(focusHandoffUrl("globe", "street")).toBe("/playground");
    expect(focusHandoffUrl("orbit", "street")).toBe("/playground");
  });

  it("an unrecognised from/to pair falls back to the plain target room, never throws", () => {
    expect(focusHandoffUrl("street", "street")).toBe("/playground");
    expect(focusHandoffUrl("street", "globe")).toBe("/globe");
    expect(focusHandoffUrl("globe", "orbit")).toBe("/map");
  });
});
