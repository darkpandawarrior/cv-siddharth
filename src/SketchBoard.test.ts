import { describe, it, expect, vi } from "vitest";
import { Box, type Editor } from "tldraw";
import { fitBoardToViewport } from "./SketchBoard.tsx";

/** A minimal stand-in for tldraw's Editor — just the four methods
 *  fitBoardToViewport calls. */
function fakeEditor(screen: { width: number; height: number }, content: Box) {
  return {
    getViewportScreenBounds: () => screen,
    getCurrentPageBounds: () => content,
    zoomToFit: vi.fn(),
    zoomToBounds: vi.fn(),
  } as unknown as Editor & { zoomToFit: ReturnType<typeof vi.fn>; zoomToBounds: ReturnType<typeof vi.fn> };
}

describe("fitBoardToViewport — blueprint-sketch-thin-band-mobile", () => {
  it("on a landscape viewport, fits the whole board as before", () => {
    const editor = fakeEditor({ width: 1200, height: 800 }, new Box(0, 0, 2000, 900));
    fitBoardToViewport(editor, { animation: { duration: 400 } });
    expect(editor.zoomToFit).toHaveBeenCalledWith({ animation: { duration: 400 } });
    expect(editor.zoomToBounds).not.toHaveBeenCalled();
  });

  it("on a portrait viewport, crops the width and keeps the full height instead of shrinking to fit the whole (wide, short) board", () => {
    // A typical wide-short board — this is the exact shape that used to
    // read as ~2/3 black on a phone.
    const content = new Box(0, 100, 2000, 900);
    const editor = fakeEditor({ width: 400, height: 800 }, content);
    fitBoardToViewport(editor, { animation: { duration: 400 } });

    expect(editor.zoomToFit).not.toHaveBeenCalled();
    expect(editor.zoomToBounds).toHaveBeenCalledTimes(1);
    const [crop, opts] = editor.zoomToBounds.mock.calls[0] as [Box, unknown];

    // Full height kept — that's the actual fix: zoomToFit was the one
    // shrinking this to leave space unused.
    expect(crop.height).toBe(content.height);
    // Width narrowed to the viewport's own aspect ratio (400:800 → half as
    // wide as it is tall), not left at the board's full 2000.
    expect(crop.width).toBeCloseTo(content.height * (400 / 800), 5);
    expect(crop.width).toBeLessThan(content.width);
    // Centred horizontally within the original content bounds.
    const contentMidX = content.x + content.width / 2;
    expect(crop.x + crop.width / 2).toBeCloseTo(contentMidX, 5);
    expect(opts).toEqual({ animation: { duration: 400 } });
  });

  it("does not crop past the board's own width when the board is already narrow enough for the viewport's ratio", () => {
    // A board narrower (relative to its height) than the viewport's own
    // ratio asks for, so there is nothing to crop.
    const content = new Box(0, 0, 300, 900);
    const editor = fakeEditor({ width: 400, height: 800 }, content);
    fitBoardToViewport(editor);
    const [crop] = editor.zoomToBounds.mock.calls[0] as [Box];
    expect(crop.width).toBe(content.width);
    expect(crop.height).toBe(content.height);
  });
});
