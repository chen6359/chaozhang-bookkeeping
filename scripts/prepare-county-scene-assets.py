#!/usr/bin/env python3
"""Build deployment posters from the independently generated county scenes."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "video" / "sources" / "world" / "county"
OUTPUT_ROOT = ROOT / "public" / "scenes" / "county"
ROOMS = ("hall", "treasury", "council", "works")
STATES = ("stable", "strained", "deficit")


def build_poster(room: str, state: str) -> None:
    source = SOURCE_ROOT / room / state / "source.png"
    output = OUTPUT_ROOT / room / state / "poster.webp"
    if not source.exists():
        raise FileNotFoundError(source)

    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB")
        target_ratio = 16 / 9
        source_ratio = image.width / image.height
        if source_ratio > target_ratio:
            width = round(image.height * target_ratio)
            left = (image.width - width) // 2
            image = image.crop((left, 0, left + width, image.height))
        elif source_ratio < target_ratio:
            height = round(image.width / target_ratio)
            top = (image.height - height) // 2
            image = image.crop((0, top, image.width, top + height))

        image = image.resize((1600, 900), Image.Resampling.LANCZOS)
        image = ImageEnhance.Sharpness(image).enhance(1.08)
        image.save(output, "WEBP", quality=88, method=6)


def main() -> None:
    for room in ROOMS:
        for state in STATES:
            build_poster(room, state)


if __name__ == "__main__":
    main()
