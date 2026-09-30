import { afterEach, describe, expect, it, vi } from "vitest";
import { __clearActionHandlersForTest, getActionHandler, KNOWN_ACTION_TYPES, registerActionHandler } from "./actions.ts";

afterEach(() => __clearActionHandlersForTest());

describe("KNOWN_ACTION_TYPES", () => {
  it("lists exactly the 10 built-in kinds", () => {
    expect(KNOWN_ACTION_TYPES).toEqual([
      "flyTo",
      "flyToPlace",
      "follow",
      "setLayer",
      "setStyle",
      "setTime",
      "select",
      "filter",
      "setView",
      "narrate",
    ]);
  });
});

describe("the extension registry", () => {
  it("returns undefined for an unregistered kind", () => {
    expect(getActionHandler("compare")).toBeUndefined();
  });
  it("returns the handler that was registered for a kind", () => {
    const handler = vi.fn();
    registerActionHandler("compare", handler);
    getActionHandler("compare")?.({ type: "compare", a: "today", b: "last Monday" });
    expect(handler).toHaveBeenCalledWith({ type: "compare", a: "today", b: "last Monday" });
  });
  it("__clearActionHandlersForTest empties the registry", () => {
    registerActionHandler("story", vi.fn());
    __clearActionHandlersForTest();
    expect(getActionHandler("story")).toBeUndefined();
  });
});
