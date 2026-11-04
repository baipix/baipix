import {
  alpha,
  blue,
  green,
  pack,
  red,
  fromHex,
  oklchToColor,
  opaque,
  toHex,
  toOklab,
  withAlpha,
  type Color,
  type Lab,
} from './color';
import { clamp } from './math';

export interface PalettePreset {
  name: string;
  colors: string;
}

export const PALETTE_PRESETS: Record<string, PalettePreset> = {
  sweetie16: {
    name: 'Sweetie 16',
    colors:
      '1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57',
  },
  pico8: {
    name: 'PICO-8',
    colors:
      '000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa',
  },
  endesga32: {
    name: 'Endesga 32',
    colors:
      'be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569',
  },
  dawnbringer16: {
    name: 'DawnBringer 16',
    colors:
      '140c1c 442434 30346d 4e4a4e 854c30 346524 d04648 757161 597dce d27d2c 8595a1 6daa2c d2aa99 6dc2ca dad45e deeed6',
  },
  dawnbringer32: {
    name: 'DawnBringer 32',
    colors:
      '000000 222034 45283c 663931 8f563b df7126 d9a066 eec39a fbf236 99e550 6abe30 37946e 4b692f 524b24 323c39 3f3f74 306082 5b6ee1 639bff 5fcde4 cbdbfc ffffff 9badb7 847e87 696a6a 595652 76428a ac3232 d95763 d77bba 8f974a 8a6f30',
  },
  resurrect64: {
    name: 'Resurrect 64',
    colors:
      '2e222f 3e3546 625565 966c6c ab947a 694f62 7f708a 9babb2 c7dcd0 ffffff 6e2727 b33831 ea4f36 f57d4a ae2334 e83b3b fb6b1d f79617 f9c22b 7a3045 9e4539 cd683d e6904e fbb954 4c3e24 676633 a2a947 d5e04b fbff86 165a4c 239063 1ebc73 91db69 cddf6c 313638 374e4a 547e64 92a984 b2ba90 0b5e65 0b8a8f 0eaf9b 30e1b9 8ff8e2 323353 484a77 4d65b4 4d9be6 8fd3ff 45293f 6b3e75 905ea9 a884f3 eaaded 753c54 a24b6f cf657f ed8099 831c5d c32454 f04f78 f68181 fca790 fdcbb0',
  },
  aap64: {
    name: 'AAP-64',
    colors:
      '060608 141013 3b1725 73172d b4202a df3e23 fa6a0a f9a31b ffd541 fffc40 d6f264 9cdb43 59c135 14a02e 1a7a3e 24523b 122020 143464 285cc4 249fde 20d6c7 a6fcdb ffffff fef3c0 fad6b8 f5a097 e86a73 bc4a9b 793a80 403353 242234 221c1a 322b28 71413b bb7547 dba463 f4d29c dae0ea b3b9d1 8b93af 6d758d 4a5462 333941 422433 5b3138 8e5252 ba756a e9b5a3 e3e6ff b9bffb 849be4 588dbe 477d85 23674e 328464 5daf8d 92dcba cdf7e2 e4d2aa c7b08b a08662 796755 5a4e44 423934',
  },
  slso8: {
    name: 'SLSO8',
    colors: '0d2b45 203c56 544e68 8d697a d08159 ffaa5e ffd4a3 ffecd6',
  },
  pollen8: {
    name: 'Pollen8',
    colors: '73464c ab5675 ee6a7c ffa7a5 ffe07e ffe7d6 72dcbb 34acba',
  },
  oil6: {
    name: 'Oil 6',
    colors: 'fbf5ef f2d3ab c69fa5 8b6d9c 494d7e 272744',
  },
  twilight5: {
    name: 'Twilight 5',
    colors: 'fbbbad ee8695 4a7a96 333f58 292831',
  },
  gameboy: { name: 'Game Boy', colors: '0f380f 306230 8bac0f 9bbc0f' },
  kirokaze: {
    name: 'Kirokaze Game Boy',
    colors: '332c50 46878f 94e344 e2f3e4',
  },
  icecreamgb: {
    name: 'Ice Cream GB',
    colors: '7c3f58 eb6b6f f9a875 fff6d3',
  },
  demichrome: {
    name: '2-bit Demichrome',
    colors: '211e20 555568 a0a08b e9efec',
  },
  c64: {
    name: 'Commodore 64',
    colors:
      '000000 626262 898989 adadad ffffff 9f4e44 cb7e75 6d5412 a1683c c9d487 9ae29b 5cab5e 6abfc6 887ecb 50459b a057a3',
  },
  cga: {
    name: 'CGA',
    colors:
      '000000 555555 aaaaaa ffffff 0000aa 5555ff 00aa00 55ff55 00aaaa 55ffff aa0000 ff5555 aa00aa ff55ff aa5500 ffff55',
  },
  zxspectrum: {
    name: 'ZX Spectrum',
    colors:
      '000000 0000d8 0000ff d80000 ff0000 d800d8 ff00ff 00d800 00ff00 00d8d8 00ffff d8d800 ffff00 d8d8d8 ffffff',
  },
  grayscale: { name: 'Grayscale', colors: '000000 222222 444444 666666 888888 aaaaaa cccccc eeeeee ffffff' },
};

/** Extracts every 6-digit hex code from free text (Lospec .hex files, CSS, comma lists…). */
export function parseHexList(text: string): Color[] {
  const found = text.match(/#?\b[0-9a-f]{6}\b/gi) ?? [];
  const colors = found.map((h) => fromHex(h)).filter((c): c is Color => c !== null);
  return [...new Set(colors)];
}

export const presetColors = (key: string): Color[] => parseHexList(PALETTE_PRESETS[key]?.colors ?? '');

/** One hex code per line: the Lospec `.hex` format. */
export const toHexList = (colors: Color[]): string => colors.map((c) => toHex(c).slice(1)).join('\n') + '\n';

/**
 * GIMP palette (`.gpl`), also read by Aseprite, Krita and Inkscape: a header, then one
 * "R G B name" line per color. Comments (#), Name: and Columns: lines are skipped.
 */
export function parseGpl(text: string): Color[] {
  const colors: Color[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/.exec(line);
    if (!m) continue;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)));
    colors.push(pack(r, g, b));
  }
  return [...new Set(colors)];
}

export function toGpl(colors: Color[], name: string): string {
  const lines = colors.map((c) => {
    const rgb = [red(c), green(c), blue(c)].map((v) => String(v).padStart(3)).join(' ');
    return `${rgb}\t${toHex(c).slice(1)}`;
  });
  return `GIMP Palette\nName: ${name.replace(/[\r\n]/g, ' ')}\nColumns: 8\n#\n${lines.join('\n')}\n`;
}

/** Colors from a palette file: GIMP `.gpl` when it says so, hex codes otherwise (`.hex`, `.txt`…). */
export const parsePaletteFile = (text: string): Color[] =>
  /^\s*GIMP Palette/.test(text) ? parseGpl(text) : (parsePaintNet(text) ?? parseHexList(text));

/**
 * Paint.NET palette (`.txt`, also on Lospec): comment lines starting with ;, then one AARRGGBB
 * code per line. The alpha is left out, as colors in a palette are opaque. Null when it isn't one.
 */
function parsePaintNet(text: string): Color[] | null {
  const codes = text
    .split(/\r?\n/)
    .map((line) => /^\s*[0-9a-f]{2}([0-9a-f]{6})\s*$/i.exec(line)?.[1])
    .filter((code): code is string => !!code);
  if (!codes.length) return null;
  return parseHexList(codes.join(' '));
}

/**
 * How lighten and shade pick the next color:
 * - `ramp`: the next step in the same color family (close hue), ending on the palette's neutrals;
 * - `palette`: any palette color close in hue and chroma, even from another family;
 * - `free`: no palette, the lightness changes directly (see `shiftLightness`).
 */
export type ShadeMode = 'ramp' | 'palette' | 'free';

/** Below this OKLCH chroma a color counts as a neutral (grays, near-black, near-white). */
const NEUTRAL_CHROMA = 0.035;
/** Widest hue gap between two steps of one ramp. Pixel art ramps shift hue, so it's generous. */
const RAMP_HUE_GAP = 55;

/** Hue angle in degrees, and the gap between two of them (0..180). */
const hueOf = (lab: Lab): number => ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const chromaOf = (lab: Lab): number => Math.hypot(lab[1], lab[2]);

/** Palette with precomputed OKLab values, for fast perceptual lookups. */
export class PaletteIndex {
  private readonly entries: { color: Color; lab: Lab }[];

  constructor(colors: Color[]) {
    this.entries = colors.map((color) => ({ color, lab: toOklab(color) }));
  }

  get size(): number {
    return this.entries.length;
  }

  /** Closest palette color (alpha preserved from the input). */
  nearest(c: Color): Color {
    if (!this.entries.length) return c;
    const [L, a, b] = toOklab(c);
    let best = this.entries[0].color;
    let bestDistance = Infinity;
    for (const e of this.entries) {
      const d = (e.lab[0] - L) ** 2 + (e.lab[1] - a) ** 2 + (e.lab[2] - b) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = e.color;
      }
    }
    return withAlpha(best, alpha(c));
  }

  /**
   * Next lighter (dir = 1) or darker (dir = -1) palette color, or null when there is none.
   * `ramp` stays in the color's family; `palette` takes the closest in hue and chroma.
   */
  shade(c: Color, dir: 1 | -1, mode: Exclude<ShadeMode, 'free'> = 'ramp'): Color | null {
    return mode === 'ramp' ? this.rampStep(c, dir) : this.closestStep(c, dir);
  }

  /**
   * Same family: close hue for colors, neutrals for neutrals. The next step is the smallest
   * real change in lightness. When the family has nothing further, it ends on the nearest neutral
   * (highlights to white, shadows to black), like most pixel art ramps.
   */
  private rampStep(c: Color, dir: 1 | -1): Color | null {
    const lab = toOklab(c);
    const C = chromaOf(lab);
    const h = hueOf(lab);
    let best: Color | null = null;
    let bestScore = Infinity;
    let end: Color | null = null;
    let endGap = Infinity;
    for (const e of this.entries) {
      const dL = e.lab[0] - lab[0];
      if (dir > 0 ? dL <= 0.04 : dL >= -0.04) continue;
      const eC = chromaOf(e.lab);
      const gap = hueGap(h, hueOf(e.lab));
      const neutral = eC < NEUTRAL_CHROMA;
      let family: boolean;
      if (C < 0.02)
        family = eC < 0.08; // no real hue to compare
      else if (C < NEUTRAL_CHROMA) family = neutral || (eC < 0.08 && gap <= RAMP_HUE_GAP);
      else family = !neutral && gap <= RAMP_HUE_GAP;
      if (family) {
        const score = Math.abs(dL) + (gap / 180) * 0.4 + Math.abs(eC - C) * 0.4;
        if (score < bestScore) {
          bestScore = score;
          best = e.color;
        }
      } else if (neutral && Math.abs(dL) < endGap) {
        endGap = Math.abs(dL);
        end = e.color;
      }
    }
    const next = best ?? end;
    return next === null ? null : withAlpha(next, alpha(c));
  }

  /** Any palette color close in hue and chroma (the original behavior). */
  private closestStep(c: Color, dir: 1 | -1): Color | null {
    const [L, a, b] = toOklab(c);
    let best: Color | null = null;
    let bestScore = Infinity;
    for (const e of this.entries) {
      const dL = e.lab[0] - L;
      if (dir > 0 ? dL <= 0.012 : dL >= -0.012) continue;
      const score = Math.hypot(e.lab[1] - a, e.lab[2] - b) * 2.4 + Math.abs(dL);
      if (score < bestScore) {
        bestScore = score;
        best = e.color;
      }
    }
    return best === null ? null : withAlpha(best, alpha(c));
  }
}

const rotateToward = (h: number, target: number, amount: number): number => {
  let d = target - h;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return h + Math.sign(d) * Math.min(Math.abs(d), amount);
};

/**
 * Lighter (dir = 1) or darker (dir = -1) version of a color, outside any palette. `strength` is
 * 1 to 3 steps. With `hueShift`, highlights drift toward yellow and shadows toward blue-violet,
 * like `hueShiftedRamp`.
 */
export function shiftLightness(c: Color, dir: 1 | -1, strength: number, hueShift: boolean): Color {
  const [L, a, b] = toOklab(c);
  const C = Math.hypot(a, b);
  let h = Math.atan2(b, a);
  if (hueShift && C >= 0.02)
    h = dir > 0 ? rotateToward(h, 1.55, 0.1 * strength) : rotateToward(h, 4.9, 0.12 * strength);
  const lightness = clamp(L + dir * 0.07 * strength, 0, 1);
  return withAlpha(oklchToColor(lightness, C, h), alpha(c));
}

/**
 * Five-step ramp around a base color with hue shifting: highlights drift toward yellow,
 * shadows toward blue-violet, which reads more natural than plain lightness changes.
 */
export function hueShiftedRamp(base: Color): Color[] {
  const color = opaque(base);
  const [L, a, b] = toOklab(color);
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const ramp: Color[] = [];
  for (let k = -2; k <= 2; k++) {
    if (k === 0) {
      ramp.push(color);
      continue;
    }
    const lightness = clamp(L + k * 0.11, 0.1, 0.97);
    const hue = k > 0 ? rotateToward(h, 1.55, 0.16 * k) : rotateToward(h, 4.9, 0.18 * -k);
    const chroma = C < 0.02 ? C : C * (k > 0 ? 1 - 0.14 * k : 1 - 0.06 * -k);
    ramp.push(oklchToColor(lightness, chroma, hue));
  }
  return ramp;
}

export const sortByLightness = (colors: Color[]): Color[] =>
  [...colors].sort((x, y) => toOklab(x)[0] - toOklab(y)[0]);

export type RemapMode = 'nearest' | 'lightness';

/**
 * How to remap a drawing to another palette, color by color (opaque colors; alpha is kept apart).
 * `used` holds the drawing's colors and how many pixels have each.
 *
 * - `nearest`: each color goes to the closest one of the palette (in Oklab), like snapping.
 * - `lightness`: colors go to palette colors in the same order of lightness, darkest to darkest:
 *   recoloring that keeps shadows and highlights where they were.
 *
 * With `count` below the palette's size, only that many palette colors are used: the ones the
 * drawing needs most (`nearest`), or evenly spread from dark to light (`lightness`).
 */
export function remapTable(
  used: Map<Color, number>,
  palette: Color[],
  mode: RemapMode,
  count = palette.length,
): { table: Map<Color, Color>; colors: Color[] } {
  const table = new Map<Color, Color>();
  const target = [...new Set(palette.map(opaque))];
  const sources = [...used.keys()].map(opaque);
  if (!target.length || !sources.length) return { table, colors: target };
  const n = Math.max(1, Math.min(count, target.length));
  const lightness = (c: Color) => toOklab(c)[0];

  if (mode === 'lightness') {
    const byLight = [...target].sort((a, b) => lightness(a) - lightness(b));
    const kept =
      n >= byLight.length
        ? byLight
        : Array.from(
            { length: n },
            (_, i) => byLight[Math.round((i * (byLight.length - 1)) / Math.max(1, n - 1))],
          );
    const ordered = [...new Set(sources)].sort((a, b) => lightness(a) - lightness(b));
    ordered.forEach((c, i) => {
      const k =
        ordered.length > 1
          ? Math.round((i * (kept.length - 1)) / (ordered.length - 1))
          : Math.floor((kept.length - 1) / 2);
      table.set(c, kept[k]);
    });
    return { table, colors: [...new Set(kept)] };
  }

  // Nearest: snap to the whole palette, then keep the n palette colors covering the most pixels.
  const full = new PaletteIndex(target);
  let kept = target;
  if (n < target.length) {
    const weight = new Map<Color, number>();
    for (const [c, k] of used) {
      const t = opaque(full.nearest(c));
      weight.set(t, (weight.get(t) ?? 0) + k);
    }
    kept = [...weight.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([c]) => c);
  }
  const index = new PaletteIndex(kept);
  for (const c of sources) table.set(c, opaque(index.nearest(c)));
  return { table, colors: kept };
}
