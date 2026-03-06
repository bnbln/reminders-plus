#!/usr/bin/env python3

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


WIDTH = 720
HEIGHT = 1600

ACCENT_COLORS = {
    "blue": "#007AFF",
    "red": "#F4512C",
    "green": "#34C759",
    "orange": "#FF9500",
    "pink": "#FF2D55",
    "indigo": "#5856D6",
}

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "assets/images/streak-backgrounds"


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smootherstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 == edge1:
        return 0.0
    value = clamp((x - edge0) / (edge1 - edge0))
    return value * value * value * (value * (value * 6.0 - 15.0) + 10.0)


def parse_hex_color(value: str) -> tuple[float, float, float]:
    value = value.removeprefix("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in range(0, 6, 2))


def hash_noise(x: int, y: int, seed: int) -> float:
    value = (x * 73856093) ^ (y * 19349663) ^ seed
    value = (value ^ (value >> 13)) * 1274126177
    value &= 0xFFFFFFFF
    return value / 0xFFFFFFFF


def encode_png(width: int, height: int, rgba: bytearray) -> bytes:
    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        payload = chunk_type + data
        return (
            struct.pack("!I", len(data))
            + payload
            + struct.pack("!I", zlib.crc32(payload) & 0xFFFFFFFF)
        )

    rows = bytearray()
    stride = width * 4
    for row_start in range(0, len(rgba), stride):
        rows.append(0)
        rows.extend(rgba[row_start : row_start + stride])

    header = struct.pack("!2I5B", width, height, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(rows), level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def render_background(hex_color: str) -> bytearray:
    accent_r, accent_g, accent_b = parse_hex_color(hex_color)
    rgba = bytearray(WIDTH * HEIGHT * 4)
    blobs = (
        (0.50, 1.07, 0.78, 0.46, 1.18),
        (0.24, 0.96, 0.44, 0.31, 0.66),
        (0.77, 0.93, 0.48, 0.34, 0.62),
        (0.49, 0.84, 0.60, 0.24, 0.54),
        (0.18, 0.72, 0.34, 0.20, 0.20),
        (0.82, 0.70, 0.36, 0.22, 0.18),
    )

    pixel_index = 0
    width_minus_one = WIDTH - 1
    height_minus_one = HEIGHT - 1

    for y in range(HEIGHT):
        ny = y / height_minus_one
        vertical_fade = smootherstep(0.08, 0.88, ny)
        top_cut = smootherstep(0.0, 0.28, ny)
        floor_boost = smootherstep(0.72, 1.0, ny)

        for x in range(WIDTH):
            nx = x / width_minus_one
            intensity = 0.0

            for cx, cy, rx, ry, amplitude in blobs:
                dx = (nx - cx) / rx
                dy = (ny - cy) / ry
                intensity += amplitude * math.exp(-3.85 * (dx * dx + dy * dy))

            basin = math.exp(-((ny - 0.96) / 0.24) ** 2) * math.exp(-((nx - 0.5) / 0.72) ** 2)
            shoulder = math.exp(-((ny - 0.62) / 0.28) ** 2) * math.exp(-((nx - 0.5) / 0.95) ** 2)
            intensity = clamp((intensity * 0.78 + basin * 0.34 + shoulder * 0.18) * vertical_fade * top_cut)
            intensity *= 0.84 + 0.16 * floor_boost

            fine_noise = hash_noise(x, y, 0x9E3779B9) - 0.5
            coarse_noise = hash_noise(x // 2, y // 2, 0x7F4A7C15) - 0.5
            noise = fine_noise * 0.65 + coarse_noise * 0.35
            dither = noise * (0.034 + intensity * 0.026)

            alpha = clamp(intensity + dither)
            alpha = alpha ** 1.08
            highlight = clamp(intensity * 0.12 + max(noise, 0.0) * 0.03)

            red = clamp(accent_r * (1.0 + highlight), 0.0, 1.0)
            green = clamp(accent_g * (1.0 + highlight * 0.92), 0.0, 1.0)
            blue = clamp(accent_b * (1.0 + highlight * 0.88), 0.0, 1.0)

            rgba[pixel_index] = round(red * 255.0)
            rgba[pixel_index + 1] = round(green * 255.0)
            rgba[pixel_index + 2] = round(blue * 255.0)
            rgba[pixel_index + 3] = round(alpha * 255.0)
            pixel_index += 4

    return rgba


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, color in ACCENT_COLORS.items():
        png_bytes = encode_png(WIDTH, HEIGHT, render_background(color))
        output_path = OUTPUT_DIR / f"{name}.png"
        output_path.write_bytes(png_bytes)
        print(f"wrote {output_path}")


if __name__ == "__main__":
    main()
