import { alpha, blue, green, red, toHex, type Color } from '../color';

/** The languages the drawing can be exported to as code. */
export type CodeLanguage = 'react' | 'svg' | 'css' | 'json' | 'ascii';
export const CODE_LANGUAGES: CodeLanguage[] = ['react', 'svg', 'css', 'json', 'ascii'];

/** The file each language is saved as. */
export const CODE_EXTENSIONS: Record<CodeLanguage, string> = {
  react: 'tsx',
  svg: 'svg',
  css: 'css',
  json: 'json',
  ascii: 'txt',
};

/** What the code is made from: the drawing merged, its SVG (layered or not), and its name. */
export interface CodeInput {
  name: string;
  width: number;
  height: number;
  /** The drawing's pixels, merged (or the active layer alone), row by row. */
  pixels: Uint32Array;
  /** The drawing as SVG, layers kept: what the SVG tab shows. */
  svg: string;
  /** The drawing as flat SVG, one path per color: what React and CSS are made of. */
  flatSvg: string;
}

/** A color of the drawing, named for code: `ink`, `light-blue`, `red-2`… */
export interface NamedColor {
  name: string;
  color: Color;
}

const HUES: [number, string][] = [
  [15, 'red'],
  [40, 'orange'],
  [65, 'yellow'],
  [90, 'lime'],
  [150, 'green'],
  [175, 'teal'],
  [195, 'cyan'],
  [220, 'sky'],
  [250, 'blue'],
  [275, 'violet'],
  [300, 'purple'],
  [335, 'pink'],
  [360, 'red'],
];

/**
 * A short plain name for a color, from its hue and lightness.
 */
export function colorName(color: Color): string {
  const [r, g, b] = [red(color), green(color), blue(color)].map((v) => v / 255);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const l = (max + min) / 2;
  const d = max - min;

  if (l < 0.16) return 'ink';
  if (l > 0.93 && d < 0.1) return 'paper';

  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (s < 0.15) return l < 0.35 ? 'dark-gray' : l > 0.7 ? 'light-gray' : 'gray';

  let hueSector: number;

  if (max === r) {
    hueSector = ((g - b) / d) % 6;
  } else if (max === g) {
    hueSector = (b - r) / d + 2;
  } else {
    hueSector = (r - g) / d + 4;
  }

  const degrees = (hueSector * 60 + 360) % 360;
  const hue = HUES.find(([limit]) => degrees < limit)![1];

  if (l < 0.3) return `dark-${hue}`;
  if (l > 0.72) return `light-${hue}`;

  return hue;
}

function assignColorNames(sortedColors: [Color, number][]): NamedColor[] {
  const taken = new Map<string, number>();
  const named: NamedColor[] = [];

  for (const [color] of sortedColors) {
    const base = colorName(color);
    const count = (taken.get(base) ?? 0) + 1;

    taken.set(base, count);
    named.push({ name: count === 1 ? base : `${base}-${count}`, color });
  }

  return named;
}

/**
 * The drawing's colors, most used first, each with a name of its own.
 */
export function namedColors(pixels: Uint32Array): NamedColor[] {
  const counts = new Map<Color, number>();

  for (const color of pixels) {
    if (!alpha(color)) continue;

    const count = counts.get(color) ?? 0;
    counts.set(color, count + 1);
  }

  const sortedColors = [...counts].sort((a, b) => b[1] - a[1]);
  return assignColorNames(sortedColors);
}

/**
 * `My knight 2` → `MyKnight2`, for a component's name; `Sprite` when nothing is left.
 */
export function componentName(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .split(/[\s_-]+/)
    .filter(Boolean);
  const joined = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return /^[A-Za-z]/.test(joined) ? joined : `Sprite${joined}`;
}

/**
 * `My knight 2` → `my-knight-2`, for a CSS class; `sprite` when nothing is left.
 */
export function className(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  return /^[a-z]/.test(slug) ? slug : `sprite${slug ? `-${slug}` : ''}`;
}

const colorHex = (color: Color): string => {
  const hex = toHex(color);
  const opacity = alpha(color);

  if (opacity === 255) return hex;

  return `${hex}${opacity.toString(16).padStart(2, '0')}`;
};

/**
 * SVG attributes in their React spelling: `shape-rendering` → `shapeRendering`.
 */
function svgToJsx(svg: string): string {
  return svg
    .replace(/ xmlns="[^"]*"/, '')
    .replace(
      /\s([a-z]+(?:-[a-z]+)+)=/g,
      (_, attr: string) => ` ${attr.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())}=`,
    )
    .replace(/\/>/g, ' />');
}

function cssDimensions(input: CodeInput): [string, string] {
  const size = input.flatSvg.match(/width="(\d+)" height="(\d+)"/);
  return size ? [size[1], size[2]] : [String(input.width), String(input.height)];
}

/**
 * Quotes are swapped and the few characters a data URL can't hold are escaped.
 */
function cssDataUri(svg: string): string {
  return svg
    .trim()
    .replace(/"/g, "'")
    .replace(/\n/g, '')
    .replace(/[%#<>{}]/g, (c) => encodeURIComponent(c));
}

/**
 * A React component that draws the sprite, sized by its props like an icon.
 */
function writeReact(input: CodeInput): string {
  const name = componentName(input.name);

  const body = svgToJsx(input.flatSvg.trim())
    .split('\n')
    // The root takes the props, after its own size, so `width`, `className`… can change it.
    .map((line, i) => (i === 0 ? line.replace(/>$/, ' {...props}>') : line))
    .map((line) => `    ${line}`)
    .join('\n');

  return [
    "import type { SVGProps } from 'react';",
    '',
    `/** ${input.name}, ${input.width} × ${input.height} pixels, drawn in Baipix. */`,
    `export function ${name}(props: SVGProps<SVGSVGElement>) {`,
    '  return (',
    body,
    '  );',
    '}',
    '',
  ].join('\n');
}

/** The drawing as a background image, and its colors as custom properties. */
function writeCss(input: CodeInput): string {
  const cls = className(input.name);
  const [w, h] = cssDimensions(input);
  const data = cssDataUri(input.flatSvg);
  const colors = namedColors(input.pixels);
  return [
    `/* ${input.name}, ${input.width} × ${input.height} pixels, drawn in Baipix. */`,
    ':root {',
    ...colors.map(({ name, color }) => `  --${cls}-${name}: ${colorHex(color)};`),
    '}',
    '',
    `.${cls} {`,
    `  width: ${w}px;`,
    `  height: ${h}px;`,
    `  background: url("data:image/svg+xml,${data}") no-repeat center / contain;`,
    '  image-rendering: pixelated;',
    '}',
    '',
  ].join('\n');
}

function pixelRows(input: CodeInput, colors: NamedColor[]): string[] {
  const index = new Map(colors.map((c, i) => [c.color, i + 1]));
  const rows: string[] = [];
  for (let y = 0; y < input.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < input.width; x++) {
      const c = input.pixels[y * input.width + x];
      row.push(alpha(c) ? index.get(c)! : 0);
    }
    rows.push(`    [${row.join(', ')}]`);
  }
  return rows;
}

/** Size, named colors, and the pixels as rows of color numbers (0 is empty). */
function writeJson(input: CodeInput): string {
  const colors = namedColors(input.pixels);
  return [
    '{',
    `  "name": ${JSON.stringify(input.name)},`,
    `  "width": ${input.width},`,
    `  "height": ${input.height},`,
    '  "colors": [',
    colors.map((c) => `    { "name": "${c.name}", "value": "${colorHex(c.color)}" }`).join(',\n'),
    '  ],',
    '  "pixels": [',
    pixelRows(input, colors).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

/** One character per color, the most used first; past them, letters and digits. */
const GLYPHS = '#@%*+=o~^xs&$:!?abcdefghijklmnpqrtuvwyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** The drawing in characters, with the legend on top: for a README or a comment. */
function writeAscii(input: CodeInput): string {
  const colors = namedColors(input.pixels).slice(0, GLYPHS.length);
  const glyph = new Map(colors.map((c, i) => [c.color, GLYPHS[i]]));
  const lines = [`${input.name}, ${input.width} × ${input.height}`, '', '. empty'];
  for (const c of colors) lines.push(`${glyph.get(c.color)} ${colorHex(c.color)} ${c.name}`);
  lines.push('');
  for (let y = 0; y < input.height; y++) {
    let row = '';
    for (let x = 0; x < input.width; x++) {
      const c = input.pixels[y * input.width + x];
      // Past the glyphs (a drawing of many colors), the rest share the last one.
      row += alpha(c) ? (glyph.get(c) ?? GLYPHS[GLYPHS.length - 1]) : '.';
    }
    lines.push(row);
  }
  return lines.join('\n') + '\n';
}

/** The drawing as code, in the language picked. */
export function codeOf(language: CodeLanguage, input: CodeInput): string {
  switch (language) {
    case 'react':
      return writeReact(input);
    case 'svg':
      return input.svg;
    case 'css':
      return writeCss(input);
    case 'json':
      return writeJson(input);
    case 'ascii':
      return writeAscii(input);
  }
}
