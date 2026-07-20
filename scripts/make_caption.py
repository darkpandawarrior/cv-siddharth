#!/usr/bin/env python3
"""Render a caption as a transparent 1280x720 PNG overlay (bottom-center pill).

Used by rebuild-showcase.mjs because common ffmpeg builds (Homebrew macOS,
some CI images) ship without the drawtext/freetype filter — compositing a
pre-rendered PNG via the built-in `overlay` filter works everywhere.
Usage: make_caption.py "caption text" out.png
"""
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
FONTS = [
    "/System/Library/Fonts/Helvetica.ttc",  # macOS
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Ubuntu CI
]


def main() -> None:
    text, out = sys.argv[1], sys.argv[2]
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = None
    for path in FONTS:
        try:
            font = ImageFont.truetype(path, 30)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    tw, th = right - left, bottom - top
    x, y = (W - tw) // 2, H - 58 - th
    pad = 16
    draw.rectangle([x - pad, y - pad, x + tw + pad, y + th + pad], fill=(11, 15, 13, 140))
    draw.text((x - left, y - top), text, font=font, fill=(232, 239, 233, 255))
    img.save(out)


if __name__ == "__main__":
    main()
