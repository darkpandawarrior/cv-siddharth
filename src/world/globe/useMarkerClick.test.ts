import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { claimGuideClick, GUIDE_CLICK_RADIUS_PX, nearestGuideClickTarget, registerGuideClickTargets, useMarkerClick } from "./useMarkerClick.ts";

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

it("curated targets win only within the screen radius and unregister on unmount", () => {
  const review = { x: 20, y: 30, priority: 1, select: vi.fn() };
  const city = { x: 21, y: 30, select: vi.fn() };
  const detach = registerGuideClickTargets(() => [review, city]);
  try {
    expect(nearestGuideClickTarget([review], { clientX: 20 + GUIDE_CLICK_RADIUS_PX, clientY: 30 })).toBe(review);
    expect(nearestGuideClickTarget([review, city], { clientX: 20, clientY: 30 })).toBe(review);
    // Touchscreen integer rounding must not promote a city over its review.
    expect(nearestGuideClickTarget([city, review], { clientX: 21, clientY: 30 })).toBe(review);
    expect(claimGuideClick({ clientX: 20, clientY: 30 })).toBe(true);
    expect(review.select).toHaveBeenCalledOnce();
    expect(city.select).not.toHaveBeenCalled();
    expect(claimGuideClick({ clientX: 21 + GUIDE_CLICK_RADIUS_PX + 1, clientY: 30 })).toBe(false);
  } finally { detach(); }
  expect(claimGuideClick({ clientX: 20, clientY: 30 })).toBe(false);
});
