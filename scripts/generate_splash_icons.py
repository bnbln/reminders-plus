#!/usr/bin/env python3
"""Generates the light splash icon for every alternate app icon.

The splash icon (ios/reminds/Images.xcassets/SplashScreenAppIcon.imageset) is
an export of assets/Reminder+.icon. The alternate icons only change the light
glyph color (see plugins/accent-app-icons.js), so instead of exporting each
variant from Icon Composer this recolors the light export in OKLab: hue and
chroma move from the primary glyph color to the variant's glyph color, and
lightness moves by the same offset, weighted by how colored a pixel is. Gray
background, white checkmark and the dark export stay untouched.

Writes SplashScreenAppIcon-<Name>.imageset (light only) next to the original;
AppDelegate.swift pairs it with the original dark image at runtime.

Run after changing ACCENT_COLORS, the icon's glyph color or the splash export:
    python3 scripts/generate_splash_icons.py
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICON_JSON = ROOT / "assets/Reminder+.icon/icon.json"
SETTINGS_STORE = ROOT / "context/settings-store.tsx"
ASSETS_DIR = ROOT / "ios/reminds/Images.xcassets"
SOURCE_SET = ASSETS_DIR / "SplashScreenAppIcon.imageset"
SCALES = {"1x": "icon-light.png", "2x": "icon-light@2x.png", "3x": "icon-light@3x.png"}

# Must match plugins/accent-app-icons.js.
PRIMARY_ACCENT_ID = "blue"
ALTERNATE_ICON_PREFIX = "AppIcon-"

SRGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.072175],
        [0.0193339, 0.119192, 0.9503041],
    ]
)
P3_TO_XYZ = np.array(
    [
        [0.4865709, 0.2656677, 0.1982173],
        [0.2289746, 0.6917385, 0.0792869],
        [0, 0.0451134, 1.0439444],
    ]
)
LINEAR_SRGB_TO_LMS = np.array(
    [
        [0.4122214708, 0.5363325363, 0.0514459929],
        [0.2119034982, 0.6806995451, 0.1073969566],
        [0.0883024619, 0.2817188376, 0.6299787005],
    ]
)
LMS_TO_OKLAB = np.array(
    [
        [0.2104542553, 0.793617785, -0.0040720468],
        [1.9779984951, -2.428592205, 0.4505937099],
        [0.0259040371, 0.7827717662, -0.808675766],
    ]
)
P3_TO_SRGB = np.linalg.inv(SRGB_TO_XYZ) @ P3_TO_XYZ
SRGB_TO_P3 = np.linalg.inv(P3_TO_SRGB)


def to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def from_linear(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def linear_srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    return np.cbrt(rgb @ LINEAR_SRGB_TO_LMS.T) @ LMS_TO_OKLAB.T


def oklab_to_linear_srgb(lab: np.ndarray) -> np.ndarray:
    lms = (lab @ np.linalg.inv(LMS_TO_OKLAB).T) ** 3
    return lms @ np.linalg.inv(LINEAR_SRGB_TO_LMS).T


def hex_to_oklab(value: str) -> np.ndarray:
    n = int(value[1:], 16)
    rgb = np.array([(n >> 16) & 255, (n >> 8) & 255, n & 255]) / 255
    return linear_srgb_to_oklab(to_linear(rgb))


def icon_color_to_oklab(value: str) -> np.ndarray:
    space, components = value.split(":")
    rgb = to_linear(np.array([float(c) for c in components.split(",")[:3]]))
    if space == "display-p3":
        rgb = P3_TO_SRGB @ rgb
    elif space != "srgb":
        raise ValueError(f"unsupported color space {space}")
    return linear_srgb_to_oklab(rgb)


def read_accent_colors() -> dict[str, str]:
    source = SETTINGS_STORE.read_text()
    block = re.search(r"ACCENT_COLORS = \[([\s\S]*?)\] as const", source)
    if not block:
        raise RuntimeError("ACCENT_COLORS not found")
    return dict(re.findall(r'id: "(\w+)", value: "(#[0-9A-Fa-f]{6})"', block.group(1)))


def primary_glyph_oklab() -> np.ndarray:
    icon = json.loads(ICON_JSON.read_text())
    for group in icon["groups"]:
        for layer in group.get("layers", []):
            for spec in layer.get("fill-specializations", []):
                if "appearance" not in spec and "solid" in spec["value"]:
                    return icon_color_to_oklab(spec["value"]["solid"])
    raise RuntimeError("primary glyph has no solid fill")


def recolor(image: Image.Image, source: np.ndarray, target: np.ndarray) -> Image.Image:
    """Moves pixels colored like `source` to `target`; the export is Display P3."""
    data = np.asarray(image.convert("RGBA")).astype(np.float64) / 255
    rgb, alpha = data[..., :3], data[..., 3:]
    lab = linear_srgb_to_oklab(to_linear(rgb) @ P3_TO_SRGB.T)

    source_chroma = np.hypot(source[1], source[2])
    target_chroma = np.hypot(target[1], target[2])
    turn = np.arctan2(target[2], target[1]) - np.arctan2(source[2], source[1])
    scale = target_chroma / source_chroma
    cos, sin = np.cos(turn) * scale, np.sin(turn) * scale

    a, b = lab[..., 1], lab[..., 2]
    weight = np.clip(np.hypot(a, b) / source_chroma, 0, 1)
    out = np.stack(
        [
            lab[..., 0] + (target[0] - source[0]) * weight,
            a * cos - b * sin,
            a * sin + b * cos,
        ],
        axis=-1,
    )
    p3 = from_linear(oklab_to_linear_srgb(out) @ SRGB_TO_P3.T)
    pixels = np.round(np.concatenate([p3, alpha], axis=-1) * 255).astype(np.uint8)
    return Image.fromarray(pixels, "RGBA")


def main() -> None:
    colors = read_accent_colors()
    primary_glyph = primary_glyph_oklab()
    primary_accent = hex_to_oklab(colors[PRIMARY_ACCENT_ID])

    written = set()
    for accent_id, value in colors.items():
        if accent_id == PRIMARY_ACCENT_ID:
            continue
        # Same darkening the alternate icons get in plugins/accent-app-icons.js.
        glyph = hex_to_oklab(value)
        glyph[0] += primary_glyph[0] - primary_accent[0]

        name = f"SplashScreen{ALTERNATE_ICON_PREFIX}{accent_id[0].upper()}{accent_id[1:]}"
        target_dir = ASSETS_DIR / f"{name}.imageset"
        shutil.rmtree(target_dir, ignore_errors=True)
        target_dir.mkdir()
        images = []
        for scale, filename in SCALES.items():
            source = Image.open(SOURCE_SET / filename)
            recolored = recolor(source, primary_glyph, glyph)
            recolored.save(
                target_dir / filename,
                icc_profile=source.info.get("icc_profile"),
                optimize=True,
            )
            images.append({"idiom": "universal", "filename": filename, "scale": scale})
        contents = {"images": images, "info": {"version": 1, "author": "xcode"}}
        (target_dir / "Contents.json").write_text(json.dumps(contents, indent=2) + "\n")
        written.add(target_dir.name)
        print(f"{name}  {value}")

    # Drop variants whose accent left the picker.
    for entry in ASSETS_DIR.glob(f"SplashScreen{ALTERNATE_ICON_PREFIX}*.imageset"):
        if entry.name not in written:
            shutil.rmtree(entry)


if __name__ == "__main__":
    main()
