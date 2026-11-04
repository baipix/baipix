/**
 * Colors are packed into a single uint32 using the same byte order as ImageData on
 * little-endian machines (0xAABBGGRR). This lets pixel buffers be copied straight into
 * an ImageData without any conversion.
 */
export type Color = number;

export const pack = (r: number, g: number, b: number, a = 255): Color =>
  (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;

export const red = (c: Color): number => c & 255;
export const green = (c: Color): number => (c >>> 8) & 255;
export const blue = (c: Color): number => (c >>> 16) & 255;
export const alpha = (c: Color): number => c >>> 24;

export const withAlpha = (c: Color, a: number): Color => ((c & 0x00ffffff) | ((a & 255) << 24)) >>> 0;
export const opaque = (c: Color): Color => (c | 0xff000000) >>> 0;

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** `#rrggbb`, alpha ignored. */
export const toHex = (c: Color): string => `#${hex2(red(c))}${hex2(green(c))}${hex2(blue(c))}`;

/** Parses `#rgb`, `rgb`, `#rrggbb` or `rrggbb`. Returns null when invalid. */
export function fromHex(input: string, a = 255): Color | null {
  let h = input.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return pack((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}

export const toCss = (c: Color): string =>
  `rgba(${red(c)},${green(c)},${blue(c)},${(alpha(c) / 255).toFixed(3)})`;

export interface Hsv {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hh < 60
      ? [c, x, 0]
      : hh < 120
        ? [x, c, 0]
        : hh < 180
          ? [0, c, x]
          : hh < 240
            ? [0, x, c]
            : hh < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Hue shift in degrees; saturation and brightness in %, 100 = unchanged, 0..200. */
export interface ColorAdjustment {
  hue: number;
  saturation: number;
  brightness: number;
}

export const NO_ADJUSTMENT: ColorAdjustment = { hue: 0, saturation: 100, brightness: 100 };

/** Below 100% scales the value down; above, moves it toward 1 (so full values still change). */
const scaleUnit = (v: number, percent: number): number => {
  const k = Math.max(0, Math.min(200, percent)) / 100;
  return k <= 1 ? v * k : v + (1 - v) * (k - 1);
};

/** Adjusts hue, saturation and brightness (HSV) of a color; alpha and transparent pixels are kept. */
export function adjustColor(c: Color, adj: ColorAdjustment): Color {
  if (!alpha(c)) return c;
  const hsv = rgbToHsv(red(c), green(c), blue(c));
  const [r, g, b] = hsvToRgb({
    h: hsv.h + adj.hue,
    s: scaleUnit(hsv.s, adj.saturation),
    v: scaleUnit(hsv.v, adj.brightness),
  });
  return pack(r, g, b, alpha(c));
}

/* ---- OKLab: a perceptual color space, used for shading, ramps and nearest-color search ---- */

export type Lab = [number, number, number];

const toLinear = (c: number): number => {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
};
const toSrgb = (c: number): number => {
  const n = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, n)) * 255);
};

export function toOklab(c: Color): Lab {
  const r = toLinear(red(c));
  const g = toLinear(green(c));
  const b = toLinear(blue(c));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH to sRGB, reducing chroma until the color fits in gamut. */
export function oklchToColor(L: number, C: number, h: number): Color {
  let chroma = C;
  for (let i = 0; i < 40; i++) {
    const lin = oklabToLinear(L, chroma * Math.cos(h), chroma * Math.sin(h));
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005) || chroma < 0.001) {
      return pack(toSrgb(lin[0]), toSrgb(lin[1]), toSrgb(lin[2]));
    }
    chroma *= 0.93;
  }
  const lin = oklabToLinear(L, 0, 0);
  return pack(toSrgb(lin[0]), toSrgb(lin[1]), toSrgb(lin[2]));
}
