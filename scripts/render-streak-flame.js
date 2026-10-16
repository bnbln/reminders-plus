#!/usr/bin/env node
/**
 * Renders the streak-celebration flame as pre-lit image layers.
 *
 * The silhouettes in streak-flame-contours.json were traced from the design
 * reference (a matte clay flame: a flat orange slab with a flat yellow slab on
 * its front, seen slightly from the right). Each contour becomes an exact 2D
 * distance field, which is extruded into a slab with rounded edges and
 * ray-marched on the CPU with soft key light, ambient occlusion and soft
 * shadows. Because it runs offline it can afford supersampling and accurate
 * lighting; the app only animates the resulting layers.
 *
 * Output (assets/images/streak-flame/):
 *   flame-back.png    orange back piece
 *   flame-front.png   yellow front piece
 *   flame-shade.png   shadow + occlusion the front piece casts onto the back
 *                     piece (black, alpha only — clip it to flame-back)
 *
 * Usage: node scripts/render-streak-flame.js [--preview]
 */
"use strict";

const { Buffer } = require("buffer");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CONTOURS = require("./streak-flame-contours.json");
const OUT_DIR = path.join(path.dirname(require.resolve("./streak-flame-contours.json")), "..", "assets", "images", "streak-flame");
const PREVIEW = process.argv.includes("--preview");

// --- Scene parameters (units: pixels of the traced reference) --------------
const YAW = (-24 * Math.PI) / 180; // turn so the right-hand walls face us
const PITCH = (-6 * Math.PI) / 180; // look up slightly to reveal bottom walls
const CENTER = [256, 256];
const BACK = { thickness: 30, radius: 14.5, pillow: 9 };
const FRONT = { thickness: 18, radius: 8.5, pillow: 6, embed: 2 };
// The traced outline includes the right-hand side wall; pulling it in a little
// keeps the rendered slab (which adds its own wall) at the reference size.
const OUTLINE_INSET = 2.5;
// Crop of the reference frame that holds the flame, and output scale.
const CROP = { x: 104, y: 52, w: 304, h: 404 };
const SCALE = PREVIEW ? 1.25 : 2.75;
const SUPERSAMPLE = PREVIEW ? 1 : 3;

// Matte clay albedos (sRGB, sampled from the reference's lit faces).
const BACK_ALBEDO = [244, 136, 50];
const FRONT_ALBEDO = [250, 206, 78];

// --- Small vector helpers ----------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (v) => {
  const c = clamp(v);
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
};

// --- 2D distance fields of the traced contours (screen space, y down) -----
function polygonSdfGrid(points, res) {
  const size = 512 * res;
  const grid = new Float32Array(size * size);
  const n = points.length;
  for (let gy = 0; gy < size; gy++) {
    const py = gy / res;
    for (let gx = 0; gx < size; gx++) {
      const px = gx / res;
      let d = Infinity;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const ex = xj - xi;
        const ey = yj - yi;
        const wx = px - xi;
        const wy = py - yi;
        const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey));
        const dx = wx - ex * t;
        const dy = wy - ey * t;
        const dd = dx * dx + dy * dy;
        if (dd < d) d = dd;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      grid[gy * size + gx] = inside ? -Math.sqrt(d) : Math.sqrt(d);
    }
  }
  return { grid, size, res };
}

function sampleGrid({ grid, size, res }, x, y) {
  const fx = x * res;
  const fy = y * res;
  if (fx < 0 || fy < 0 || fx >= size - 1 || fy >= size - 1) return 64;
  const x0 = fx | 0;
  const y0 = fy | 0;
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * size + x0;
  const a = grid[i] + (grid[i + 1] - grid[i]) * tx;
  const b = grid[i + size] + (grid[i + size + 1] - grid[i + size]) * tx;
  return a + (b - a) * ty;
}

// Separable Gaussian blur of a distance grid. The exact field has creases
// along its medial axis; the face swell uses this smooth copy so those creases
// never show up as dents in the lighting.
function blurGrid({ grid, size, res }, sigmaRef) {
  const sigma = sigmaRef * res;
  const rad = Math.ceil(sigma * 3);
  const kernel = [];
  let sum = 0;
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp((-i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const pass = (src, horizontal) => {
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let acc = 0;
        for (let k = -rad; k <= rad; k++) {
          const xx = horizontal ? Math.min(size - 1, Math.max(0, x + k)) : x;
          const yy = horizontal ? y : Math.min(size - 1, Math.max(0, y + k));
          acc += src[yy * size + xx] * kernel[k + rad];
        }
        out[y * size + x] = acc;
      }
    }
    return out;
  };
  return { grid: pass(pass(grid, true), false), size, res };
}

console.log("building distance fields…");
const GRID_RES = PREVIEW ? 1 : 4;
const outerGrid = polygonSdfGrid(CONTOURS.outer, GRID_RES);
const innerGrid = polygonSdfGrid(CONTOURS.inner, GRID_RES);
const outerSoft = blurGrid(outerGrid, 14);
const innerSoft = blurGrid(innerGrid, 10);

// --- Camera -----------------------------------------------------------------
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const cp = Math.cos(PITCH);
const sp = Math.sin(PITCH);
// camera → object: inverse of pitch(yaw(p)).
function toObject([x, y, z]) {
  const y1 = y * cp + z * sp;
  const z1 = -y * sp + z * cp;
  return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
}

// Front faces in object space (x right, y up, origin at CENTER). Projecting a
// z = 0 point gives screen x ≈ x·cos(yaw), y ≈ y·cos(pitch).
function backFace(x, y) {
  return sampleGrid(outerGrid, CENTER[0] + x * cy, CENTER[1] - y * cp) + OUTLINE_INSET;
}
function frontFace(x, y) {
  return sampleGrid(innerGrid, CENTER[0] + x * cy, CENTER[1] - y * cp);
}
const backSoft = (x, y) =>
  sampleGrid(outerSoft, CENTER[0] + x * cy, CENTER[1] - y * cp) + OUTLINE_INSET;
const frontSoft = (x, y) => sampleGrid(innerSoft, CENTER[0] + x * cy, CENTER[1] - y * cp);

// Slab extruded from a face between z0 and z1 with rounded edges of radius r.
// The front surface swells by up to `pillow` towards the middle (driven by the
// smooth field `soft`), so the face reads as soft clay rather than a cut-out.
function slab(d2, soft, z, z0, z1, r, pillow) {
  const swell = pillow * (1 - Math.exp(Math.min(soft, 0) / 45));
  const h = (z1 + swell - z0) / 2;
  const zc = (z0 + z1 + swell) / 2;
  const wx = d2 + r;
  const wy = Math.abs(z - zc) - h + r;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - r;
}
const backSdf = (p) =>
  slab(
    backFace(p[0], p[1]),
    backSoft(p[0], p[1]),
    p[2],
    -BACK.thickness,
    0,
    BACK.radius,
    BACK.pillow,
  );
const frontSdf = (p) =>
  slab(
    frontFace(p[0], p[1]),
    frontSoft(p[0], p[1]),
    p[2],
    -FRONT.embed,
    FRONT.thickness,
    FRONT.radius,
    FRONT.pillow,
  );

function normalOf(sdf, p) {
  // Wider than a grid cell so bilinear facets never show as banding.
  const e = 0.6;
  return norm([
    sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]),
    sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]),
    sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e]),
  ]);
}

function march(sdf, ro, rd) {
  let t = 0;
  for (let i = 0; i < 220; i++) {
    const p = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
    const d = sdf(p);
    if (d < 0.02) return p;
    t += Math.max(d * 0.9, 0.02);
    if (t > 600) break;
  }
  return null;
}

function softShadow(sdf, p, l, k) {
  let res = 1;
  let t = 1.2;
  for (let i = 0; i < 48 && t < 220; i++) {
    const d = sdf([p[0] + l[0] * t, p[1] + l[1] * t, p[2] + l[2] * t]);
    if (d < 0.01) return 0;
    res = Math.min(res, (k * d) / t);
    t += clamp(d, 0.8, 10);
  }
  return clamp(res);
}

function occlusion(sdf, p, n) {
  let occ = 0;
  let w = 1;
  for (let i = 1; i <= 6; i++) {
    const h = 2.5 * i;
    const d = sdf([p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h]);
    occ += (h - d) * w;
    w *= 0.62;
  }
  return clamp(1 - occ * 0.03);
}

// Soft key light from the top left, cool-ish sky fill, warm ground bounce.
const KEY = norm([-0.45, 0.6, 0.85]);
function shadeClay(albedo, n, ao, shadow) {
  const lin = albedo.map(srgbToLinear);
  const wrap = clamp((dot(n, KEY) + 0.45) / 1.45);
  const key = 1.02 * wrap * (0.55 + 0.45 * shadow);
  const sky = 0.42 * (0.6 + 0.4 * n[1]) * (0.5 + 0.5 * ao);
  const bounce = 0.12 * clamp(-n[1]) * ao;
  const half = norm([KEY[0], KEY[1], KEY[2] + 1]);
  const sheen = 0.035 * Math.pow(clamp(dot(n, half)), 10) * shadow;
  // Saturate the shadow side a little, like light scattering in clay.
  const sss = (1 - wrap) * 0.18;
  return lin.map((c, i) => {
    const tinted = c * (1 + sss * (i === 0 ? 0.25 : i === 1 ? -0.15 : -0.35));
    return tinted * (key + sky) + c * bounce + sheen;
  });
}

// --- Render -------------------------------------------------------------------
const W = Math.round(CROP.w * SCALE);
const H = Math.round(CROP.h * SCALE);
const layers = {
  back: new Float32Array(W * H * 4),
  front: new Float32Array(W * H * 4),
  shade: new Float32Array(W * H * 4),
};
const ss = SUPERSAMPLE;
const sampleWeight = 1 / (ss * ss);
const camDir = toObject([0, 0, -1]);

console.log(`rendering ${W}×${H} @${ss}×${ss}…`);
for (let y = 0; y < H; y++) {
  if (y % 100 === 0) console.log(`  row ${y}/${H}`);
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    for (let sj = 0; sj < ss; sj++) {
      for (let si = 0; si < ss; si++) {
        const sxp = CROP.x + (x + (si + 0.5) / ss) / SCALE;
        const syp = CROP.y + (y + (sj + 0.5) / ss) / SCALE;
        const ro = toObject([sxp - CENTER[0], -(syp - CENTER[1]), 300]);

        const hb = march(backSdf, ro, camDir);
        if (hb) {
          const n = normalOf(backSdf, hb);
          const lift = [hb[0] + n[0] * 0.4, hb[1] + n[1] * 0.4, hb[2] + n[2] * 0.4];
          const c = shadeClay(
            BACK_ALBEDO,
            n,
            occlusion(backSdf, hb, n),
            softShadow(backSdf, lift, KEY, 9),
          );
          for (let k = 0; k < 3; k++) layers.back[o + k] += c[k] * sampleWeight;
          layers.back[o + 3] += sampleWeight;
          // What the front piece does to the back piece at this point.
          const cover = (0.4 + 0.6 * softShadow(frontSdf, lift, KEY, 4)) * occlusion(frontSdf, hb, n);
          layers.shade[o + 3] += (1 - cover) * sampleWeight;
        }

        const hf = march(frontSdf, ro, camDir);
        if (hf) {
          const n = normalOf(frontSdf, hf);
          const lift = [hf[0] + n[0] * 0.4, hf[1] + n[1] * 0.4, hf[2] + n[2] * 0.4];
          const c = shadeClay(
            FRONT_ALBEDO,
            n,
            occlusion(frontSdf, hf, n),
            softShadow(frontSdf, lift, KEY, 9),
          );
          for (let k = 0; k < 3; k++) layers.front[o + k] += c[k] * sampleWeight;
          layers.front[o + 3] += sampleWeight;
        }
      }
    }
  }
}

// --- PNG output ---------------------------------------------------------------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(file, layer, { premultipliedLinear, alphaOnly }) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const o = y * (W * 4 + 1) + 1 + x * 4;
      const a = clamp(layer[i + 3]);
      if (alphaOnly) {
        raw[o] = raw[o + 1] = raw[o + 2] = 0;
      } else if (premultipliedLinear && a > 0) {
        for (let k = 0; k < 3; k++) raw[o + k] = linearToSrgb(layer[i + k] / a);
      }
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

const outDir = PREVIEW ? process.env.PREVIEW_DIR || OUT_DIR : OUT_DIR;
fs.mkdirSync(outDir, { recursive: true });
writePng(path.join(outDir, "flame-back.png"), layers.back, { premultipliedLinear: true });
writePng(path.join(outDir, "flame-front.png"), layers.front, { premultipliedLinear: true });
writePng(path.join(outDir, "flame-shade.png"), layers.shade, { alphaOnly: true });
console.log(`wrote ${W}×${H} layers to ${outDir}`);
