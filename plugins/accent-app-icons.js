const fs = require("fs");
const path = require("path");

/**
 * Generates one Icon Composer file per accent color from assets/Reminder+.icon.
 *
 * Only the glyph's default (light) fill changes. Dark keeps the white glyph and
 * tinted is recolored by iOS anyway. The primary icon's glyph is intentionally a
 * bit darker than the blue accent (more contrast once Liquid Glass brightens
 * it), so every variant gets the same OKLab lightness offset. Changing the blue
 * in Reminder+.icon therefore moves all variants with it.
 */

const PRIMARY_ICON_NAME = "Reminder+";
const PRIMARY_ACCENT_ID = "blue";
const ALTERNATE_ICON_PREFIX = "AppIcon-";

// Single source of truth for the colors is the settings store.
function readAccentColors(projectRoot) {
  const source = fs.readFileSync(
    path.join(projectRoot, "context", "settings-store.tsx"),
    "utf8",
  );
  const block = source.match(/ACCENT_COLORS = \[([\s\S]*?)\] as const/);
  if (!block) throw new Error("[accent-app-icons] ACCENT_COLORS not found");
  const colors = [...block[1].matchAll(/id: "(\w+)", value: "(#[0-9A-Fa-f]{6})"/g)]
    .map(([, id, value]) => ({ id, value }));
  if (!colors.some((color) => color.id === PRIMARY_ACCENT_ID)) {
    throw new Error("[accent-app-icons] primary accent missing");
  }
  return colors;
}

function alternateIconName(accentId) {
  return `${ALTERNATE_ICON_PREFIX}${accentId[0].toUpperCase()}${accentId.slice(1)}`;
}

/** Accent id -> alternate icon name; the primary accent maps to null. */
function getAlternateIconNames(projectRoot) {
  return readAccentColors(projectRoot)
    .filter((color) => color.id !== PRIMARY_ACCENT_ID)
    .map((color) => alternateIconName(color.id));
}

// --- color math (sRGB / Display P3 -> OKLab and back) ---

const SRGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const P3_TO_XYZ = [
  [0.4865709, 0.2656677, 0.1982173],
  [0.2289746, 0.6917385, 0.0792869],
  [0, 0.0451134, 1.0439444],
];
const LINEAR_SRGB_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

const multiply = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c) => Math.min(1, Math.max(0, c));

function linearSrgbToOklab(rgb) {
  return multiply(LMS_TO_OKLAB, multiply(LINEAR_SRGB_TO_LMS, rgb).map(Math.cbrt));
}

function oklabToLinearSrgb(lab) {
  const lms = multiply(invert3(LMS_TO_OKLAB), lab).map((c) => c ** 3);
  return multiply(invert3(LINEAR_SRGB_TO_LMS), lms);
}

function hexToLinearSrgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => toLinear(c / 255));
}

// Icon Composer colors look like "display-p3:0.0,0.4,0.8,1.0" or "srgb:…".
function iconColorToLinearSrgb(value) {
  const [space, components] = value.split(":");
  const rgb = components.split(",").slice(0, 3).map(Number).map(toLinear);
  if (space === "srgb") return rgb;
  if (space === "display-p3") {
    return multiply(invert3(SRGB_TO_XYZ), multiply(P3_TO_XYZ, rgb));
  }
  throw new Error(`[accent-app-icons] unsupported color space ${space}`);
}

function linearSrgbToIconColor(rgb) {
  const c = rgb.map((v) => fromLinear(clamp01(v)).toFixed(5));
  return `srgb:${c.join(",")},1.00000`;
}

// --- icon files ---

function glyphLayers(iconJson) {
  return iconJson.groups.flatMap((group) => group.layers ?? []);
}

function defaultGlyphFill(layer) {
  return (layer["fill-specializations"] ?? []).find((spec) => !spec.appearance);
}

function iconGlyphColor(accentHex, primaryGlyphLab, primaryAccentLab) {
  const lab = linearSrgbToOklab(hexToLinearSrgb(accentHex));
  lab[0] += primaryGlyphLab[0] - primaryAccentLab[0];
  return linearSrgbToIconColor(oklabToLinearSrgb(lab));
}

function copyFolderSync(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

/**
 * Copies the primary icon and writes every accent variant into `targetDir`.
 * Stale variants (accent removed from the picker) are deleted.
 */
function writeAppIcons(projectRoot, targetDir) {
  const sourceDir = path.join(projectRoot, "assets", `${PRIMARY_ICON_NAME}.icon`);
  const primary = JSON.parse(fs.readFileSync(path.join(sourceDir, "icon.json"), "utf8"));
  const primaryFill = glyphLayers(primary).map(defaultGlyphFill).find(Boolean);
  if (!primaryFill?.value?.solid) {
    throw new Error("[accent-app-icons] primary glyph has no solid fill");
  }

  const colors = readAccentColors(projectRoot);
  const primaryGlyphLab = linearSrgbToOklab(iconColorToLinearSrgb(primaryFill.value.solid));
  const primaryAccentLab = linearSrgbToOklab(
    hexToLinearSrgb(colors.find((color) => color.id === PRIMARY_ACCENT_ID).value),
  );

  copyFolderSync(sourceDir, path.join(targetDir, `${PRIMARY_ICON_NAME}.icon`));

  const names = [];
  for (const color of colors) {
    if (color.id === PRIMARY_ACCENT_ID) continue;
    const name = alternateIconName(color.id);
    const iconDir = path.join(targetDir, `${name}.icon`);
    copyFolderSync(sourceDir, iconDir);

    const iconJson = structuredClone(primary);
    const solid = iconGlyphColor(color.value, primaryGlyphLab, primaryAccentLab);
    for (const layer of glyphLayers(iconJson)) {
      const fill = defaultGlyphFill(layer);
      if (fill?.value?.solid) fill.value = { solid };
    }
    fs.writeFileSync(path.join(iconDir, "icon.json"), `${JSON.stringify(iconJson, null, 2)}\n`);
    names.push(name);
  }

  for (const entry of fs.readdirSync(targetDir)) {
    const match = entry.match(/^(AppIcon-\w+)\.icon$/);
    if (match && !names.includes(match[1])) {
      fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
    }
  }
  return names;
}

module.exports = {
  PRIMARY_ICON_NAME,
  PRIMARY_ACCENT_ID,
  alternateIconName,
  getAlternateIconNames,
  writeAppIcons,
};
