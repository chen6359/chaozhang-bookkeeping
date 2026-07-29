#!/usr/bin/env python3
"""Create the 12 standalone county scene posters from the approved sprite.

The source is three fiscal-state columns by four room rows.  This script only
creates static poster fallbacks; it never invents or transcodes motion media.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "world-county-rooms.jpg"
OUTPUT = ROOT / "public" / "scenes" / "county"
ROOMS = ("hall", "treasury", "council", "works")
FISCAL_STATES = ("stable", "strained", "deficit")


def main() -> None:
    with Image.open(SOURCE) as source:
        image = source.convert("RGB")
        width, height = image.size

        for row, room in enumerate(ROOMS):
            top = round(row * height / len(ROOMS))
            bottom = round((row + 1) * height / len(ROOMS))
            for column, fiscal_state in enumerate(FISCAL_STATES):
                left = round(column * width / len(FISCAL_STATES))
                right = round((column + 1) * width / len(FISCAL_STATES))
                destination = (
                    OUTPUT / room / fiscal_state / "poster.webp"
                )
                destination.parent.mkdir(parents=True, exist_ok=True)
                image.crop((left, top, right, bottom)).save(
                    destination,
                    "WEBP",
                    quality=90,
                    method=6,
                )

    print("created 12 county scene posters; no motion files were generated")


if __name__ == "__main__":
    main()
