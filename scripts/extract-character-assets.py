#!/usr/bin/env python3
"""Extract one-character transparent assets from the legacy contact sheets.

The runtime must never crop a multi-character image.  This migration script is
only used once to turn the approved legacy art into standalone WebP files.
Every output has the same 512 x 768 transparent canvas and a shared foot line.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUT = PUBLIC / "characters"
RANKS = ("county", "prefecture", "governor", "regent", "emperor")
MOODS = ("neutral", "warning", "success")
CANVAS = (512, 768)
FOOT_LINE = 744


def border_background_mask(image: Image.Image) -> np.ndarray:
    """Flood-fill only warm, light pixels connected to the crop border."""

    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    h, w, _ = rgb.shape
    border = np.concatenate(
        (
            rgb[:14].reshape(-1, 3),
            rgb[-14:].reshape(-1, 3),
            rgb[:, :14].reshape(-1, 3),
            rgb[:, -14:].reshape(-1, 3),
        )
    )
    border_range = np.max(border, axis=1) - np.min(border, axis=1)
    paper_samples = border[
        (border[:, 0] > 168)
        & (border[:, 1] > 156)
        & (border[:, 2] > 138)
        & (border_range < 88)
    ]
    key = np.median(paper_samples if len(paper_samples) >= 24 else border, axis=0)
    distance = np.sqrt(np.sum((rgb - key) ** 2, axis=2))
    channel_range = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    warm_light = (
        (distance < 112)
        & (rgb[:, :, 0] > 168)
        & (rgb[:, :, 1] > 154)
        & (rgb[:, :, 2] > 132)
        # Paper backdrops stay nearly neutral; skin and warm costume details
        # have a wider red-to-blue spread and must never become part of the
        # flood fill.
        & (channel_range < 48)
    )

    background = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    # The source sheets have one-pixel divider rules. Seed the flood from a
    # shallow inner frame as well as the literal edge so those rules cannot
    # trap the paper background inside a cell.
    inset = min(10, max(2, min(h, w) // 20))
    for y in range(h):
        for x in range(w):
            if (
                (y < inset or y >= h - inset or x < inset or x >= w - inset)
                and warm_light[y, x]
                and not background[y, x]
            ):
                background[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if (
                0 <= ny < h
                and 0 <= nx < w
                and warm_light[ny, nx]
                and not background[ny, nx]
            ):
                background[ny, nx] = True
                queue.append((ny, nx))
    return background


def remove_edge_intrusions(mask: np.ndarray) -> np.ndarray:
    """Keep the central subject while dropping components entering from a side."""

    h, w = mask.shape
    # The legacy sheets contain divider rules and, occasionally, a hand or
    # scroll intruding from the neighbouring cell.  Clear a narrow guard band
    # before component analysis so a divider cannot join the central figure at
    # the row baseline and become part of the exported asset.
    guard = max(4, round(min(h, w) * 0.018))
    mask = mask.copy()
    mask[:guard, :] = False
    mask[-guard:, :] = False
    mask[:, :guard] = False
    mask[:, -guard:] = False

    seen = np.zeros_like(mask, dtype=bool)
    components: list[
        tuple[list[tuple[int, int]], bool, tuple[int, int, int, int], bool]
    ] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            queue = deque([(y, x)])
            seen[y, x] = True
            pixels: list[tuple[int, int]] = []
            touches_guard = False
            min_y = max_y = y
            min_x = max_x = x
            while queue:
                cy, cx = queue.popleft()
                pixels.append((cy, cx))
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                touches_guard = touches_guard or (
                    cx <= guard + 2
                    or cx >= w - guard - 3
                    or cy <= guard + 2
                    or cy >= h - guard - 3
                )
                for ny, nx in (
                    (cy - 1, cx),
                    (cy + 1, cx),
                    (cy, cx - 1),
                    (cy, cx + 1),
                ):
                    if (
                        0 <= ny < h
                        and 0 <= nx < w
                        and mask[ny, nx]
                        and not seen[ny, nx]
                    ):
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            box_width = max_x - min_x + 1
            box_height = max_y - min_y + 1
            divider_like = (
                (box_width <= max(7, round(w * 0.035)) and box_height >= h * 0.42)
                or (
                    box_height <= max(7, round(h * 0.025))
                    and box_width >= w * 0.42
                )
            )
            components.append(
                (
                    pixels,
                    touches_guard,
                    (min_y, min_x, max_y, max_x),
                    divider_like,
                )
            )

    if not components:
        return mask

    center_y = h / 2
    center_x = w / 2

    def subject_score(index: int) -> float:
        pixels, _, (min_y, min_x, max_y, max_x), divider_like = components[index]
        if divider_like:
            return -1
        component_y = (min_y + max_y) / 2
        component_x = (min_x + max_x) / 2
        distance = (
            abs(component_x - center_x) / max(center_x, 1)
            + abs(component_y - center_y) / max(center_y, 1)
        )
        centrality = max(0.35, 1.55 - distance)
        return len(pixels) * centrality

    main_index = max(range(len(components)), key=subject_score)
    cleaned = np.zeros_like(mask, dtype=bool)
    main_size = len(components[main_index][0])
    main_box = components[main_index][2]
    main_min_y, main_min_x, main_max_y, main_max_x = main_box
    padding_x = round(w * 0.12)
    padding_y = round(h * 0.12)
    for index, (pixels, touches_guard, box, divider_like) in enumerate(components):
        min_y, min_x, max_y, max_x = box
        near_main = not (
            max_x < main_min_x - padding_x
            or min_x > main_max_x + padding_x
            or max_y < main_min_y - padding_y
            or min_y > main_max_y + padding_y
        )
        keep = index == main_index or (
            not divider_like
            and not touches_guard
            and near_main
            and len(pixels) >= max(24, int(main_size * 0.0012))
        )
        if keep:
            ys, xs = zip(*pixels)
            cleaned[np.asarray(ys), np.asarray(xs)] = True
    return cleaned


def cutout(crop: Image.Image) -> Image.Image:
    rgba = crop.convert("RGBA")
    background = border_background_mask(rgba)
    foreground = remove_edge_intrusions(~background)
    matte = Image.fromarray((foreground * 255).astype(np.uint8), "L")
    matte = matte.filter(ImageFilter.GaussianBlur(0.55))
    rgba.putalpha(matte)
    return rgba


def normalize(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("empty character cutout")
    subject = image.crop(bbox)
    max_width, max_height = 472, 700
    scale = min(max_width / subject.width, max_height / subject.height)
    subject = subject.resize(
        (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = (CANVAS[0] - subject.width) // 2
    y = FOOT_LINE - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def save_asset(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalize(cutout(image)).save(
        path,
        "WEBP",
        quality=88,
        method=6,
        alpha_quality=95,
    )


def extract_players() -> None:
    for gender in ("male", "female"):
        sheet = Image.open(
            ROOT / "design-assets" / "characters" / "source-sheets" / f"ranks-{gender}.jpg"
        ).convert("RGB")
        width, height = sheet.size
        for index, rank in enumerate(RANKS):
            left = round(index * width / 5)
            right = round((index + 1) * width / 5)
            crop = sheet.crop((left, 0, right, height))
            save_asset(
                crop,
                OUT / "player" / gender / rank / "stable.webp",
            )


def extract_npcs() -> None:
    routes = {
        "comic": "npc-comic-ranks.jpg",
        "advisor": "npc-advisor-ranks.jpg",
        "companion-female": "npc-companion-female-ranks.jpg",
        "companion-male": "npc-companion-male-ranks.jpg",
    }
    for route, filename in routes.items():
        sheet = Image.open(
            ROOT / "design-assets" / "characters" / "source-sheets" / filename
        ).convert("RGB")
        width, height = sheet.size
        for row, mood in enumerate(MOODS):
            top = round(row * height / 3)
            bottom = round((row + 1) * height / 3)
            for column, rank in enumerate(RANKS):
                left = round(column * width / 5)
                right = round((column + 1) * width / 5)
                individual_source = (
                    ROOT
                    / "design-assets"
                    / "characters"
                    / "npc-individual"
                    / route
                    / rank
                    / f"{mood}.webp"
                )
                if route in {"comic", "advisor"}:
                    if not individual_source.exists():
                        raise FileNotFoundError(
                            f"missing standalone {route} asset: {individual_source}"
                        )
                    crop = Image.open(individual_source).convert("RGB")
                else:
                    crop = (
                        Image.open(individual_source).convert("RGB")
                        if individual_source.exists()
                        else sheet.crop((left, top, right, bottom))
                    )
                save_asset(
                    crop,
                    OUT / "npc" / route / rank / f"{mood}.webp",
                )


def validate() -> None:
    expected = 10 + 60
    assets = sorted(OUT.glob("player/*/*/stable.webp")) + sorted(
        OUT.glob("npc/*/*/*.webp")
    )
    if len(assets) != expected:
        raise RuntimeError(f"expected {expected} extracted assets, got {len(assets)}")
    for path in assets:
        image = Image.open(path).convert("RGBA")
        if image.size != CANVAS:
            raise RuntimeError(f"{path} has size {image.size}")
        alpha = np.asarray(image.getchannel("A"))
        if any(int(alpha[y, x]) != 0 for y, x in ((0, 0), (0, 511), (767, 0), (767, 511))):
            raise RuntimeError(f"{path} does not have transparent corners")
        if not 0.035 <= float(np.mean(alpha > 16)) <= 0.82:
            raise RuntimeError(f"{path} has implausible subject coverage")
    print(f"validated {len(assets)} standalone 512x768 transparent WebP assets")


if __name__ == "__main__":
    if not all(
        (OUT / "player" / gender / rank / "stable.webp").exists()
        for gender in ("male", "female")
        for rank in RANKS
    ):
        extract_players()
    extract_npcs()
    validate()
