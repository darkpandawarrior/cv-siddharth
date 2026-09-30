import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { useMarkerClick } from "./useMarkerClick.ts";

it("selects a single marker tap but leaves a nearby double tap to canvas zoom", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let click!: ReturnType<typeof useMarkerClick>;
    renderToString(createElement(() => { click = useMarkerClick(); return null; }));
    const select = vi.fn();
    click({ clientX: 20, clientY: 30 }, select);
    vi.advanceTimersByTime(350);
    expect(select).toHaveBeenCalledTimes(1);
    click({ clientX: 20, clientY: 30 }, select);
    vi.advanceTimersByTime(100);
    click({ clientX: 21, clientY: 31 }, select);
    vi.advanceTimersByTime(350);
    expect(select).toHaveBeenCalledTimes(1);
    click({ clientX: 20, clientY: 30 }, select);
    vi.advanceTimersByTime(100);
    click({ clientX: 100, clientY: 100 }, select);
    vi.advanceTimersByTime(350);
    expect(select).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
