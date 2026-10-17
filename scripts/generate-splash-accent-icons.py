"""Recolors the rendered splash icon (blue glass glyph) for every accent color.

Hue and chroma of the blue glyph pixels move to the accent; neutral pixels
(white tile, highlights, checkmark) stay as they are, so the Liquid Glass look
of the original render survives. Lightness moves by the accent's offset from
the blue accent, the same rule plugins/accent-app-icons.js uses for the home
screen icons.

    python3 scripts/generate-splash-accent-icons.py
"""

import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "ios" / "reminds" / "Images.xcassets"
SOURCE = ASSETS / "SplashScreenAppIcon.imageset" / "icon-light@3x.png"
OUT = ROOT / "assets" / "images" / "splash"

M1 = np.array([
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
])
M2 = np.array([
    [0.2104542553, 0.7936177850, -0.0040720468],
    [1.9779984951, -2.4285922050, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.8086757660],
])


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def from_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def to_oklab(rgb):
    return np.cbrt(to_linear(rgb) @ M1.T) @ M2.T


def from_oklab(lab):
    return from_linear(((lab @ np.linalg.inv(M2).T) ** 3) @ np.linalg.inv(M1).T)


def hex_to_rgb(value):
    return np.array([int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def accent_colors():
    source = (ROOT / "context" / "settings-store.tsx").read_text()
    block = re.search(r"ACCENT_COLORS = \[(.*?)\] as const", source, re.S).group(1)
    return dict(re.findall(r'id: "(\w+)", value: "(#[0-9A-Fa-f]{6})"', block))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    image = np.asarray(Image.open(SOURCE).convert("RGBA")).astype(float) / 255
    rgb, alpha = image[..., :3], image[..., 3:]
    lab = to_oklab(rgb)
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    hue = np.arctan2(lab[..., 2], lab[..., 1])

    colors = accent_colors()
    blue = to_oklab(hex_to_rgb(colors["blue"]))
    blue_chroma = np.hypot(blue[1], blue[2])
    blue_hue = np.arctan2(blue[2], blue[1])
    # 0 for neutral pixels, 1 for fully blue ones.
    weight = np.clip(chroma / blue_chroma, 0, 1)

    for accent_id, value in colors.items():
        target = to_oklab(hex_to_rgb(value))
        target_chroma = np.hypot(target[1], target[2])
        target_hue = np.arctan2(target[2], target[1])

        out = lab.copy()
        out[..., 0] += weight * (target[0] - blue[0])
        new_chroma = chroma * (target_chroma / blue_chroma)
        new_hue = hue + (target_hue - blue_hue)
        out[..., 1] = new_chroma * np.cos(new_hue)
        out[..., 2] = new_chroma * np.sin(new_hue)

        result = np.concatenate([from_oklab(out), alpha], -1)
        Image.fromarray((result * 255).round().astype(np.uint8)).save(
            OUT / f"icon-{accent_id}.png", optimize=True
        )
        print(f"icon-{accent_id}.png")


if __name__ == "__main__":
    main()
