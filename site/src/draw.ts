/**
 * Pictures for the Draw page, drawn at build time with the editor's own engine: its shapes,
 * dithering, palettes and SVG export. What the page shows is what the tools do.
 */
import { BLEND_MODES, flatten } from '../../src/engine/composite';
import { adjustColor, fromHex, NO_ADJUSTMENT, opaque, toHex, type Color } from '../../src/engine/color';
import { ditherSecond, type DitherPattern } from '../../src/engine/dither';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import {
  PALETTE_PRESETS,
  presetColors,
  remapTable,
  sortByLightness,
  type RemapMode,
} from '../../src/engine/palette';
import {
  ellipseOutline,
  heartOutline,
  line,
  polygonOutline,
  rectOutline,
  roundRectOutline,
  starPoints,
  trianglePoints,
} from '../../src/engine/raster';
import { en } from '../../src/i18n/en';
import { TOOL_LIST } from '../../src/ui/tools';
import { deserializeDocument } from '../../src/storage/fileFormat';
import colorsFile from './art/colors.baipix?raw';
import { galleryDoc } from './gallery';

/** Sweetie 16, the palette of the pictures below. */
const C = Object.fromEntries(
  Object.entries({
    ink: '#1a1c2c',
    plum: '#5d275d',
    red: '#b13e53',
    orange: '#ef7d57',
    yellow: '#ffcd75',
    lime: '#a7f070',
    green: '#38b764',
    teal: '#257179',
    navy: '#29366f',
    blue: '#3b5dc9',
    sky: '#41a6f6',
    cyan: '#73eff7',
    white: '#f4f4f4',
    silver: '#94b0c2',
    slate: '#566c86',
    dark: '#333c57',
    pink: '#ff4d8d', // the editor's axis color, for what a tool takes away
  }).map(([k, v]) => [k, fromHex(v)!]),
) as Record<string, Color>;

class Canvas {
  pixels: Uint32Array;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.pixels = new Uint32Array(w * h);
  }
  set = (x: number, y: number, c: Color) => {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.pixels[y * this.w + x] = c;
  };
  get = (x: number, y: number) => this.pixels[y * this.w + x];
  svg(pixelSize = 1, gap = 0) {
    return toSvg(this.pixels, this.w, this.h, renderGeometry(this.w, this.h, pixelSize, gap));
  }
}

// ---- Draw: dithering ------------------------------------------------------------------------

/** A dusk sky: two colors, blended by the patterns from sparse to dense. */
function ditherBand() {
  const steps: (DitherPattern | 'first' | 'second')[] = ['first', 'dots', 'checker', 'dense', 'second'];
  const cell = 8;
  const [violet, peach] = [fromHex('#4f4aa8')!, fromHex('#f79a76')!];
  const c = new Canvas(steps.length * cell, 10);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const step = steps[Math.floor(x / cell)];
      const second = step === 'second' || (step !== 'first' && ditherSecond(step, x, y));
      c.set(x, y, second ? peach : violet);
    }
  return c.svg();
}

// ---- Shapes ---------------------------------------------------------------------------------

/** The six shapes in a 3 × 2 grid, each in a 12 × 12 cell. */
function shapes() {
  // Four on top, three under them, centered: the seven shapes of the menu.
  const c = new Canvas(57, 29);
  const x = (i: number) => (i < 4 ? i * 14 : (i - 4) * 14 + 7) + 1;
  const y = (i: number) => (i < 4 ? 0 : 14) + 1;
  const plot = (color: Color) => (px: number, py: number) => c.set(px, py, color);
  line(x(0), y(0) + 11, x(0) + 11, y(0), plot(C.plum));
  rectOutline(x(1), y(1), x(1) + 11, y(1) + 11, plot(C.blue));
  roundRectOutline(x(2), y(2), x(2) + 11, y(2) + 11, 3, plot(C.sky));
  ellipseOutline(x(3), y(3), x(3) + 11, y(3) + 11, plot(C.green));
  polygonOutline(trianglePoints(x(4), y(4), x(4) + 11, y(4) + 11), plot(C.orange));
  polygonOutline(starPoints(x(5), y(5), x(5) + 11, y(5) + 11), plot(C.teal));
  heartOutline(x(6), y(6), x(6) + 11, y(6) + 10, plot(C.red));
  return c.svg();
}

const HEART = ['.##...##.', '#yy#.###.', '#y######.', '########.', '.######..', '..####...', '...##....'];

// ---- Colors: one drawing, other palettes ------------------------------------------------------

/**
 * The same drawing remapped to other palettes, and with its hue turned: what Image › Adjustments does.
 * Only the colors change, so the drawing is drawn once (one path per color, filled with a CSS
 * variable) and each version is a list of colors for those variables.
 */
function recolor() {
  const doc = deserializeDocument(JSON.parse(colorsFile));
  const { width: w, height: h } = doc;
  const pixels = flatten(doc);
  const used = new Map<Color, number>();
  for (const c of pixels) if (c >>> 24) used.set(opaque(c), (used.get(opaque(c)) ?? 0) + 1);
  const sources = [...used.keys()];
  const index = new Map(sources.map((c, i) => [toHex(c), i]));
  // The drawing, its fills turned into variables (--c0, --c1…) that default to the original colors.
  const svg = toSvg(pixels, w, h, renderGeometry(w, h, 1, 0)).replace(
    /fill="(#[0-9a-f]{6})"/g,
    (_, hex: string) => `style="fill:var(--c${index.get(hex)},${hex})"`,
  );
  const paths = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')).trim();
  const version = (map: (c: Color) => Color) => {
    const colors = sources.map(map);
    return {
      vars: colors.map((c, i) => `--c${i}:${toHex(c)}`).join(';'),
      swatches: sortByLightness([...new Set(colors)]).map(toHex),
    };
  };
  const remap = (key: string, mode: RemapMode) => {
    const { table } = remapTable(used, presetColors(key), mode);
    return version((c) => table.get(c) ?? c);
  };
  return {
    w,
    h,
    paths,
    versions: [
      { label: 'Original', detail: `${used.size} colors`, ...version((c) => c) },
      {
        label: PALETTE_PRESETS.icecreamgb.name,
        detail: 'Remap, by lightness',
        ...remap('icecreamgb', 'lightness'),
      },
      { label: PALETTE_PRESETS.slso8.name, detail: 'Remap, by lightness', ...remap('slso8', 'lightness') },
      { label: PALETTE_PRESETS.pico8.name, detail: 'Remap, nearest color', ...remap('pico8', 'nearest') },
      {
        label: 'Hue +140°',
        detail: 'Adjustments',
        ...version((c) => adjustColor(c, { ...NO_ADJUSTMENT, hue: 140 })),
      },
    ],
  };
}

// ---- Export ---------------------------------------------------------------------------------

/**
 * The knight, one square per pixel grouped by color, for the gap demo: the page shrinks each square
 * around its center (a CSS variable), which looks like the editor's gap growing between pixels.
 */
function knight() {
  const doc = galleryDoc('knight.baipix');
  const pixels = flatten(doc, { includeBackground: false });
  const { width: w, height: h } = doc;
  const byColor = new Map<string, string[]>();
  pixels.forEach((c, i) => {
    if (!(c >>> 24)) return;
    const hex = toHex(c);
    const rects = byColor.get(hex) ?? [];
    rects.push(`<rect x="${i % w}" y="${Math.floor(i / w)}" width="1" height="1"/>`);
    byColor.set(hex, rects);
  });
  const groups = [...byColor].map(([hex, rects]) => `<g fill="${hex}">${rects.join('')}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${groups}</svg>`;
}

/** The heart as Copy as SVG writes it, to show in full. */
function heartCode() {
  const c = new Canvas(9, 7);
  HEART.forEach((row, y) =>
    [...row].forEach((ch, x) => ch !== '.' && c.set(x, y, ch === 'y' ? C.white : C.red)),
  );
  return c.svg(1).trim();
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The same SVG, indented and colored for the code block: tags, attribute names, values. */
function highlight(svg: string) {
  return svg
    .split('\n')
    .map((line, i, lines) => {
      const indent = i > 0 && i < lines.length - 1 ? '  ' : '';
      // Attributes first: the tag pass adds spans with attributes of their own.
      const html = escape(line)
        .replace(
          / ([a-z-]+)=("[^"]*")/g,
          ' <span class="tok-attr">$1</span>=<span class="tok-value">$2</span>',
        )
        .replace(/(&lt;\/?)([a-z]+)/g, '$1<span class="tok-tag">$2</span>');
      return indent + html;
    })
    .join('\n');
}

// ---- Shortcuts ------------------------------------------------------------------------------

const label = (key: keyof typeof en) => en[key];

export const draw = {
  dither: ditherBand(),
  shapes: shapes(),
  knight: knight(),
  heartCode: heartCode(),
  heartHtml: highlight(heartCode()),
  recolor: recolor(),
  paletteCount: Object.keys(PALETTE_PRESETS).length,
  blendModes: BLEND_MODES.length,
  tools: TOOL_LIST.map((t) => ({ name: label(t.label), key: t.shortcut })),
};
