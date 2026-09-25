import { Skia, type SkRuntimeEffect } from "@shopify/react-native-skia";

// Shared value-noise helpers. SkSL needs every helper declared before use and
// loops with constant bounds, so both shaders inline their own copy.
const NOISE = /* sksl */ `
float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p = p * 2.03 + float2(1.7, 9.2);
    amp *= 0.5;
  }
  return v;
}
`;

/**
 * Stylised "gummy" 3D flame: four nested teardrop layers share one noise-driven
 * sway, and each layer is lit as a rounded volume (cylindrical normals, a
 * top-left key light, specular gloss and a darkened rim) so it reads as a
 * physical object instead of a flat sticker. Embers rise above the tip.
 *
 * Coordinates: `p` is in flame units — x centred, y pointing up from the base,
 * 1.0 = nominal flame height.
 */
const FLAME_SKSL = /* sksl */ `
uniform float2 uOrigin;
uniform float2 uSize;
uniform float uTime;
uniform float uIgnite;  // 0 = cold grey ember, 1 = burning
uniform float uScale;   // squash/pop driven from JS springs
uniform float uShake;   // anticipation tremble before ignition
uniform float uHot;     // 1 = milestone colour set (blue-hot)

${NOISE}

// Returns |x| / halfWidth (< 1 inside the layer) and a pseudo 3D normal.
float layerField(float2 q, float s, float yOff, float lick, float lickAmt,
                 out float3 n, out float yN) {
  float y = (q.y - yOff) / s;
  float x = q.x / s;
  const float c = 0.36;
  const float R = 0.36;
  float w;
  float ny;
  if (y < c) {
    float dy = (y - c) / R;
    w = R * sqrt(max(0.0, 1.0 - dy * dy));
    ny = dy * 0.85;
  } else {
    float k = clamp((y - c) / (1.0 - c), 0.0, 1.0);
    w = R * pow(1.0 - k, 1.25) * (1.0 + 0.3 * sin(k * 3.14159));
    ny = 0.6 * k;  // continuous with the bulb at k = 0 (no seam)
  }
  w *= (1.0 - lickAmt) + lickAmt * 2.0 * lick;
  // Zero width (above the tip / below the base) is outside, not a hairline.
  float f = w < 0.004 ? 10.0 : abs(x) / w;
  float fc = min(f, 1.0);
  float nz = sqrt(max(0.0, 1.0 - fc * fc));
  n = normalize(float3(sign(x) * fc, ny * (0.35 + 0.65 * nz), max(nz, 0.08)));
  yN = clamp(y, 0.0, 1.0);
  return f;
}

float3 shadeLayer(float3 cLow, float3 cHigh, float yN, float3 n, float f) {
  float3 base = mix(cLow, cHigh, smoothstep(0.0, 0.9, yN));
  float3 L = normalize(float3(-0.45, 0.6, 0.7));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float3 H = normalize(L + float3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 26.0);
  float rim = pow(clamp(f, 0.0, 1.0), 3.0);
  float3 col = base * (0.6 + 0.52 * diff);
  col = mix(col, col * 0.68, rim * 0.65);
  col += base * (1.0 - clamp(f, 0.0, 1.0)) * 0.18;  // subsurface warmth
  col += float3(1.0, 0.97, 0.9) * spec * 0.6;         // glossy highlight
  return col;
}

half4 main(float2 xy) {
  float2 local = xy - uOrigin;
  float u = uSize.y * 0.7;
  float t = uTime;
  float2 p = float2((local.x - uSize.x * 0.5) / u, (uSize.y * 0.94 - local.y) / u);
  float2 pe = p;  // embers ignore the pop scale
  p.x += uShake * 0.035 * sin(t * 63.0);
  p /= max(uScale, 0.001);

  float wob = mix(0.22, 1.0, uIgnite);
  float h = clamp(p.y, 0.0, 1.3);
  float sway = (sin(t * 3.3 + p.y * 4.5) * 0.05
              + (fbm(float2(p.y * 2.2 - t * 1.7, t * 0.6)) - 0.5) * 0.28) * h * h * wob;
  float2 q = float2(p.x - sway, p.y);
  float tip = 1.0 + (0.07 * sin(t * 9.0) + 0.12 * (noise(float2(t * 4.0, 3.1)) - 0.5)) * wob;
  q.y /= tip;
  float lick = fbm(float2(q.x * 3.4, q.y * 2.8 - t * 2.8));

  float3 n1; float3 n2; float3 n3; float3 n4;
  float y1; float y2; float y3; float y4;
  float f1 = layerField(q, 1.0, 0.0, lick, 0.34 * wob, n1, y1);
  // Two smaller tongues leaning outwards give the silhouette its flicker.
  float3 nl; float yl;
  float2 ql = float2(q.x + 0.15 + q.y * 0.2, q.y - 0.05);
  float fl = layerField(ql, 0.56, 0.0, lick, 0.4 * wob, nl, yl);
  float3 nr; float yr;
  float2 qr = float2(q.x - 0.16 - q.y * 0.24, q.y - 0.02);
  float fr = layerField(qr, 0.48, 0.0, 1.0 - lick, 0.4 * wob, nr, yr);
  if (fl < f1) { f1 = fl; n1 = nl; y1 = yl * 0.8; }
  if (fr < f1) { f1 = fr; n1 = nr; y1 = yr * 0.8; }
  float f2 = layerField(q, 0.74, 0.035, lick, 0.24 * wob, n2, y2);
  float f3 = layerField(q, 0.48, 0.07, lick, 0.16 * wob, n3, y3);
  float f4 = layerField(q, 0.27, 0.09, lick, 0.08 * wob, n4, y4);

  const float aa = 0.07;
  float c1 = smoothstep(1.0, 1.0 - aa, f1);
  float c2 = smoothstep(1.0, 1.0 - aa * 1.2, f2);
  float c3 = smoothstep(1.0, 1.0 - aa * 1.5, f3);
  float c4 = smoothstep(1.0, 1.0 - aa * 2.2, f4);

  // Fire palette, blended towards a blue-hot set on milestones.
  float3 o1 = mix(float3(0.80, 0.13, 0.05), float3(0.16, 0.26, 0.95), uHot);
  float3 o2 = mix(float3(1.00, 0.36, 0.10), float3(0.30, 0.55, 1.00), uHot);
  float3 m1 = mix(float3(1.00, 0.45, 0.08), float3(0.25, 0.62, 1.00), uHot);
  float3 m2 = mix(float3(1.00, 0.66, 0.15), float3(0.45, 0.82, 1.00), uHot);
  float3 i1 = mix(float3(1.00, 0.76, 0.20), float3(0.62, 0.92, 1.00), uHot);
  float3 i2 = mix(float3(1.00, 0.92, 0.50), float3(0.86, 0.98, 1.00), uHot);
  float3 core = float3(1.0, 0.98, 0.9);

  float3 col = shadeLayer(o1, o2, y1, n1, f1);
  // Contact shadow of the inner layers, offset down-right like the key light.
  float3 ns; float ys;
  float fs = layerField(q + float2(-0.02, 0.03), 0.74, 0.035, lick, 0.24 * wob, ns, ys);
  col *= 1.0 - 0.3 * smoothstep(1.3, 0.95, fs) * (1.0 - c2);
  col = mix(col, shadeLayer(m1, m2, y2, n2, f2), c2);
  col = mix(col, shadeLayer(i1, i2, y3, n3, f3), c3);
  float coreGlow = smoothstep(1.0, 0.0, f4) * (1.0 - smoothstep(0.4, 1.0, y4));
  col = mix(col, core, c4 * coreGlow * mix(0.45, 0.85, uIgnite));

  // Cold state: desaturated, dimmer ember.
  float lum = dot(col, float3(0.299, 0.587, 0.114));
  float3 cold = float3(lum * 0.62 + 0.16) * float3(0.95, 0.96, 1.0);
  col = mix(cold, col, uIgnite);
  float alpha = c1;

  // Tight inner glow hugging the flame silhouette.
  float gd = length((p - float2(0.0, 0.34)) * float2(1.3, 0.85));
  float glow = exp(-gd * 5.0) * 0.55 * uIgnite * (1.0 - c1);
  float3 glowCol = mix(float3(1.0, 0.45, 0.12), float3(0.3, 0.55, 1.0), uHot);

  // Embers drifting up past the tip.
  float3 emb = float3(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float s1 = hash(float2(fi, 1.7));
    float s2 = hash(float2(fi, 8.3));
    float s3 = hash(float2(fi, 4.1));
    float life = 1.3 + s2 * 1.3;
    float ph = fract(t / life + s1);
    float2 ep = float2((s3 - 0.5) * 0.46 + sin(t * 2.1 + fi * 1.7) * 0.07 * ph,
                       0.3 + ph * 1.02);
    float sz = (0.011 + 0.013 * s2) * (1.0 - ph * 0.55);
    float e = smoothstep(sz, sz * 0.25, length(pe - ep))
            * (1.0 - ph) * smoothstep(0.0, 0.12, ph);
    emb += mix(float3(1.0, 0.78, 0.3), float3(1.0, 0.45, 0.12), s3) * e;
  }
  emb *= uIgnite * (1.0 - c1);

  float edge = smoothstep(0.0, 28.0, local.x) * smoothstep(0.0, 28.0, uSize.x - local.x)
             * smoothstep(0.0, 36.0, local.y) * smoothstep(0.0, 18.0, uSize.y - local.y);
  float3 add = (glowCol * glow + emb * 1.4) * edge;
  return half4(col * alpha + add, alpha + (glow * 0.35 + length(emb) * 0.5) * edge);
}
`;

/**
 * Full-screen stage behind the flame: warm radial light, slowly rotating god
 * rays, and a shockwave ring + flash that fire at ignition (`uBurst` counts
 * seconds since then; negative before).
 */
const BACKDROP_SKSL = /* sksl */ `
uniform float2 uSize;
uniform float2 uCenter;
uniform float uTime;
uniform float uIgnite;
uniform float uBurst;
uniform float uHot;
uniform float uReveal;

half4 main(float2 xy) {
  float2 d = xy - uCenter;
  float md = min(uSize.x, uSize.y);
  float r = length(d) / md;

  float3 col = mix(float3(0.11, 0.045, 0.035), float3(0.025, 0.012, 0.02),
                   clamp(xy.y / uSize.y, 0.0, 1.0));
  col = mix(col, mix(col, float3(0.02, 0.03, 0.09), 0.8), uHot);
  float3 warm = mix(float3(1.0, 0.42, 0.1), float3(0.28, 0.55, 1.0), uHot);
  col += warm * exp(-r * 3.0) * (0.12 + 0.4 * uIgnite);

  float a = atan(d.y, d.x);
  float rays = pow(0.5 + 0.5 * cos(a * 14.0 + uTime * 0.35), 8.0)
             + 0.6 * pow(0.5 + 0.5 * cos(a * 8.0 - uTime * 0.22 + 1.3), 12.0);
  col += warm * rays * exp(-r * 2.2) * smoothstep(0.04, 0.22, r) * 0.3 * uIgnite;

  if (uBurst >= 0.0) {
    float rs = (1.0 - exp(-uBurst * 3.2)) * 1.05;
    float width = 0.012 + uBurst * 0.06;
    float ring = exp(-pow((r - rs) / width, 2.0)) * exp(-uBurst * 3.4);
    col += float3(1.0, 0.86, 0.58) * ring * 1.3;
    float rs2 = (1.0 - exp(-max(uBurst - 0.12, 0.0) * 2.4)) * 0.8;
    float ring2 = exp(-pow((r - rs2) / (width * 1.6), 2.0)) * exp(-uBurst * 2.8)
                * step(0.12, uBurst);
    col += warm * ring2 * 0.8;
    col += float3(1.0, 0.82, 0.55) * exp(-uBurst * 6.5) * exp(-r * 1.6) * 0.95;
  }

  float2 v = (xy / uSize - 0.5) * float2(1.0, 0.8);
  col *= 1.0 - 0.5 * smoothstep(0.35, 0.95, length(v) * 1.35);
  return half4(col * uReveal, uReveal);
}
`;

function compile(source: string, name: string): SkRuntimeEffect | null {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect && __DEV__) {
    console.warn(`[streak-celebration] ${name} shader failed to compile`);
  }
  return effect;
}

let flameEffect: SkRuntimeEffect | null | undefined;
let backdropEffect: SkRuntimeEffect | null | undefined;

export function getFlameEffect() {
  if (flameEffect === undefined) flameEffect = compile(FLAME_SKSL, "flame");
  return flameEffect;
}

export function getBackdropEffect() {
  if (backdropEffect === undefined) {
    backdropEffect = compile(BACKDROP_SKSL, "backdrop");
  }
  return backdropEffect;
}
