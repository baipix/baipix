/**
 * Animated pictures for the Draw page, computed at build time: a starting picture and a
 * timeline of pixels placed or cleared. PixelPlay.astro plays them on a canvas in the browser.
 */
import { fromHex, toHex } from '../../src/engine/color';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import type { Point } from '../../src/engine/math';
import { outlinePixels } from '../../src/engine/outline';
import { isDoubledCorner } from '../../src/engine/raster';
import { galleryDoc } from './gallery';

export interface PixelAnimation {
  w: number;
  h: number;
  /** Colors as #rrggbb; pixels refer to them by index + 1 (0 is empty). */
  palette: string[];
  /** The picture before the first event, one palette index + 1 per pixel, row by row. */
  start: number[];
  /** Flat list of events: time (ms), x, y, palette index + 1 (0 clears the pixel). */
  events: number[];
  /** Time after the last event before the loop starts over. */
  hold: number;
  /** Strength of the light around a pixel that was just placed, 0 for none. */
  glow: number;
  /** The moment shown still, when the visitor asked for reduced motion. */
  still: number;
  /** The tool's cursor, drawn over the picture, and where it is: time (ms), x, y in art pixels. */
  tool?: 'pencil' | 'bucket' | 'spray';
  cursor?: number[];
}

/** Collects pixels and events, and keeps the palette as colors come in. */
class Timeline {
  palette: string[] = [];
  start: number[];
  events: number[] = [];
  constructor(
    public w: number,
    public h: number,
  ) {
    this.start = new Array(w * h).fill(0);
  }
  index(hex: string) {
    let i = this.palette.indexOf(hex);
    if (i < 0) i = this.palette.push(hex) - 1;
    return i + 1;
  }
  base(x: number, y: number, hex: string | null) {
    this.start[y * this.w + x] = hex ? this.index(hex) : 0;
  }
  at(t: number, x: number, y: number, hex: string | null) {
    this.events.push(Math.round(t), x, y, hex ? this.index(hex) : 0);
  }
  tool?: PixelAnimation['tool'];
  cursor: number[] = [];
  /** Where the tool's cursor is at `t`, in art pixels (it moves in a straight line between points). */
  point(t: number, x: number, y: number) {
    this.cursor.push(Math.round(t), +x.toFixed(2), +y.toFixed(2));
  }
  /** `still` defaults to the end of the timeline. */
  done(hold: number, glow: number, still?: number): PixelAnimation {
    const { w, h, palette, start } = this;
    // Sorted by time (stable), so the player can walk through them in order.
    const list: number[][] = [];
    for (let i = 0; i < this.events.length; i += 4) list.push(this.events.slice(i, i + 4));
    list.sort((a, b) => a[0] - b[0]);
    const events = list.flat();
    const shown = still ?? events[events.length - 4] ?? 0;
    const cursor = this.tool ? { tool: this.tool, cursor: this.cursor } : {};
    return { w, h, palette, start, events, hold, glow, still: shown, ...cursor };
  }
}

/** A tiny seeded random, so every build draws the same pictures. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Sweetie 16, like the other pictures of the page. */
const S = {
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
  pink: '#ff4d8d',
};

// ---- Hero: a lake at sunset ---------------------------------------------------------------------

/** Dusk colors, from the top of the sky down to the glow on the horizon. */
const DUSK = [
  '#3f3f9c',
  '#4f4aa8',
  '#6450b0',
  '#7c4fae',
  '#964fab',
  '#b04fa6',
  '#cc5299',
  '#e2608f',
  '#f27d84',
  '#f79a76',
  '#f9bf7c',
  '#fbe396',
];
const NIGHT = {
  deep: '#1f1b5c',
  water: '#2f2a7a',
  block: '#4b3a8f',
  wall: '#6a3f9c',
  rim: '#e2608f',
  lit: '#f9bf7c',
};

/** Smooth noise in [0, 1] on a grid of `cell` pixels: blocky edges, the way pixel art clouds are drawn. */
function blockNoise(seed: number, cell: number) {
  const hash = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 2 ** 32;
  };
  return (x: number, y: number) => {
    const fx = x / cell;
    const fy = y / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const top = hash(i, j) * (1 - u) + hash(i + 1, j) * u;
    const bottom = hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u;
    return top * (1 - v) + bottom * v;
  };
}

/**
 * A city by the water at dusk, as a function from a pixel to its color. `isCity` tells the
 * buildings apart from the sky and the water, to split the picture into layers.
 */
function duskCity(w: number, seed = 0) {
  const horizon = 44;
  const shore = 50;
  const random = seeded(19 + seed);
  const jitter = blockNoise(4, 5);
  const puff = blockNoise(9, 4);
  const streak = blockNoise(12, 6);

  // The sky in flat bands, their edges broken into steps; brightest just above the city.
  const band = (x: number, y: number) => {
    const t = Math.max(0, (y + (jitter(x, y * 2) - 0.5) * 5) / horizon);
    return Math.min(DUSK.length - 1, Math.floor(t ** 0.8 * DUSK.length));
  };

  // Clouds: long blobs, lighter than the sky behind them, with a bright top edge.
  const clouds = [
    { x: 30, y: 9, rx: 22, ry: 3 },
    { x: 118, y: 13, rx: 26, ry: 3.5 },
    { x: 70, y: 21, rx: 30, ry: 3.5 },
    { x: 14, y: 26, rx: 18, ry: 3 },
    { x: 140, y: 27, rx: 24, ry: 3 },
    { x: 92, y: 32, rx: 34, ry: 3 },
    { x: 36, y: 36, rx: 26, ry: 2.5 },
  ];
  const inCloud = (x: number, y: number) =>
    clouds.some((c) => ((x - c.x) / c.rx) ** 2 + ((y - c.y) / c.ry) ** 2 < 0.55 + puff(x, y * 1.6) * 0.9);

  // Two rows of buildings: a far skyline in the glow, and a nearer one in shadow.
  const skyline = (seed: number, min: number, max: number, widths: [number, number], gaps: number) => {
    const r = seeded(seed);
    const tops: number[] = [];
    while (tops.length < w) {
      const width = widths[0] + Math.floor(r() * (widths[1] - widths[0]));
      // Taller towers towards the middle, and now and then a gap down to the low roofs.
      const middle = Math.max(0, 1 - Math.abs(tops.length / w - 0.45) * 2);
      const height = r() < gaps ? 0.05 : r() ** 1.6 * (0.45 + middle * 0.55);
      const top = Math.round(max - (max - min) * height);
      for (let k = 0; k < width; k++) tops.push(top);
    }
    return tops;
  };
  const far = skyline(7 + seed, 18, 43, [2, 6], 0.3);
  const near = skyline(13 + seed, 37, 47, [4, 11], 0.15);
  const windows = new Set<number>();
  for (let i = 0; i < 70; i++) windows.add(Math.floor(random() * w) + (40 + Math.floor(random() * 9)) * w);

  const isCity = (x: number, y: number) => y < shore && y >= Math.min(far[x], near[x]);
  const color = (x: number, y: number): string => {
    if (y < shore) {
      if (y >= near[x]) {
        if (y === near[x]) return NIGHT.rim;
        if (windows.has(y * w + x) && x % 2 === 0) return NIGHT.lit;
        return y > 47 ? NIGHT.block : NIGHT.wall;
      }
      if (y >= far[x]) return DUSK[7];
      if (y >= horizon) return DUSK[DUSK.length - 1];
      const b = band(x, y);
      if (inCloud(x, y)) return DUSK[Math.min(DUSK.length - 1, b + (inCloud(x, y - 1) ? 2 : 3))];
      return DUSK[b];
    }
    // Water: dark, with the sky's colors laid in short horizontal streaks, brightest under the glow.
    const d = y - shore;
    const glow = 1 - Math.min(1, Math.abs(x - 72) / 64);
    // One streak every other row, longer and brighter under the glow.
    if (d % 2 === 1 && streak(x, y * 7) > 0.66 - glow * 0.3) {
      const k = DUSK.length - 1 - Math.floor(d * 0.5) - Math.floor((1 - glow) * 5);
      return DUSK[Math.max(4, k)];
    }
    return d < 6 ? NIGHT.water : NIGHT.deep;
  };
  return { color, isCity };
}

function hero(): PixelAnimation {
  const w = 160;
  const h = 64;
  const { color } = duskCity(w);
  const t = new Timeline(w, h);
  const random = seeded(23);
  const all: Point[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) all.push({ x, y });
  // A few pixels missing from the start, put in place one after the other.
  const missing = all.filter(() => random() < 0.035);
  const missingSet = new Set(missing.map((p) => p.y * w + p.x));
  for (const p of all) t.base(p.x, p.y, missingSet.has(p.y * w + p.x) ? null : color(p.x, p.y));
  const order = missing.map((p) => ({ p, k: random() })).sort((a, b) => a.k - b.k);
  const fill = 5200;
  order.forEach(({ p }, i) => t.at(400 + (i / order.length) ** 1.4 * fill, p.x, p.y, color(p.x, p.y)));
  // Then now and then, a pixel goes out and comes back.
  let time = 400 + fill + 600;
  for (let i = 0; i < 70; i++) {
    const p = all[Math.floor(random() * all.length)];
    t.at(time, p.x, p.y, null);
    t.at(time + 500 + random() * 500, p.x, p.y, color(p.x, p.y));
    time += 120 + random() * 160;
  }
  // The same pixels leave again, quietly, so the loop starts where it began.
  time += 1200;
  order.forEach(({ p }, i) => t.at(time + (i / order.length) * 1600, p.x, p.y, null));
  return t.done(300, 1, 400 + fill);
}

// ---- Draw: the pencil, with pixel perfect --------------------------------------------------------

/** A wavy stroke as a hand would draw it: one pixel at a time, sideways then down. */
function handStroke(): Point[] {
  const points: Point[] = [];
  let x = 1;
  let y = 6;
  points.push({ x, y });
  for (let t = 2; t <= 30; t++) {
    const ty = Math.round(6 - 4.5 * Math.sin(((t - 1) / 29) * Math.PI * 2));
    while (x < t) points.push({ x: ++x, y });
    while (y !== ty) points.push({ x, y: (y += Math.sign(ty - y)) });
  }
  return points;
}

/** The same stroke drawn twice: as is (doubled corners in pink), and with pixel perfect on. */
function pencil() {
  const stroke = handStroke();
  const raw = new Timeline(32, 12);
  const perfect = new Timeline(32, 12);
  raw.tool = perfect.tool = 'pencil';
  const kept: Point[] = [];
  const step = 45;
  stroke.forEach((p, i) => {
    const time = 300 + i * step;
    raw.at(time, p.x, p.y, S.blue);
    if (kept.length >= 2 && isDoubledCorner(kept[kept.length - 2], kept[kept.length - 1], p)) {
      const corner = kept.pop()!;
      raw.at(time, corner.x, corner.y, S.pink);
      perfect.at(time, corner.x, corner.y, null);
    }
    kept.push(p);
    perfect.at(time, p.x, p.y, S.blue);
    raw.point(time, p.x + 0.5, p.y + 0.5);
    perfect.point(time, p.x + 0.5, p.y + 0.5);
  });
  const removed = stroke.length - kept.length;
  return { raw: raw.done(2400, 0.5), perfect: perfect.done(2400, 0.5), removed };
}

// ---- Draw: paint bucket and spray --------------------------------------------------------------

const POT = [
  '....######....',
  '..##......##..',
  '.#..........#.',
  '#............#',
  '#............#',
  '#....####....#',
  '#...#....#...#',
  '#...#....#...#',
  '#....####....#',
  '#............#',
  '.#..........#.',
  '..##......##..',
  '....######....',
];

/** A ring drawn as a line, then filled from one click: the color spreads ring after ring. */
function bucket(): PixelAnimation {
  const w = 16;
  const h = 15;
  const t = new Timeline(w, h);
  t.tool = 'bucket';
  const wall = new Set<number>();
  POT.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') {
        t.base(x + 1, y + 1, S.silver);
        wall.add((y + 1) * w + x + 1);
      }
    }),
  );
  // Flood fill from the click, between the two rings.
  const seen = new Set<number>([4 * w + 4]);
  let ring: Point[] = [{ x: 4, y: 4 }];
  // The bucket comes in from the bottom right and clicks between the two rings.
  t.point(150, 13, 13);
  t.point(520, 4.5, 4.5);
  let time = 600;
  while (ring.length) {
    for (const p of ring) t.at(time, p.x, p.y, S.sky);
    const next: Point[] = [];
    for (const p of ring)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = p.x + dx;
        const y = p.y + dy;
        const k = y * w + x;
        if (x < 0 || y < 0 || x >= w || y >= h || seen.has(k) || wall.has(k)) continue;
        // Stay inside the outer ring.
        if (x < 1 || y < 1 || x > 14 || y > 13) continue;
        const row = POT[y - 1];
        const left = row.indexOf('#') + 1;
        const right = row.lastIndexOf('#') + 1;
        if (x < left || x > right) continue;
        seen.add(k);
        next.push({ x, y });
      }
    ring = next;
    time += 70;
  }
  t.point(time + 400, 4.5, 4.5);
  return t.done(2000, 0.6);
}

/** Spray along a curve: dots land around the cursor, a few at a time, in one color like the tool. */
function spray(): PixelAnimation {
  const w = 16;
  const h = 15;
  const t = new Timeline(w, h);
  t.tool = 'spray';
  const random = seeded(31);
  let time = 400;
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 1.6 + 0.6;
    const cx = 7.5 + Math.cos(a) * 4.5;
    const cy = 7 + Math.sin(a) * 4.5;
    t.point(time, cx, cy);
    for (let k = 0; k < 2; k++) {
      const r = random() * 2.6;
      const b = random() * Math.PI * 2;
      const x = Math.round(cx + Math.cos(b) * r);
      const y = Math.round(cy + Math.sin(b) * r);
      if (x >= 0 && y >= 0 && x < w && y < h) t.at(time, x, y, S.yellow);
    }
    time += 55;
  }
  return t.done(2000, 1);
}

// ---- Symmetry: one side drawn, the other follows ----------------------------------------------

function symmetry(): PixelAnimation {
  const doc = galleryDoc('starfighter.baipix');
  const ship = doc.layers.find((l) => l.name === 'Starfighter')!;
  const { width: w, height: h } = doc;
  const t = new Timeline(w, h);
  const hex = (x: number, y: number) => {
    const c = ship.pixels[y * w + x];
    return c >>> 24 ? toHex(c) : null;
  };
  const half = Math.ceil(w / 2);
  let time = 300;
  // Drawn from the nose down, the left half; the mirror lands at the same time.
  for (let y = 0; y < h; y++)
    for (let x = half - 1; x >= 0; x--) {
      const c = hex(x, y);
      if (!c) continue;
      t.at(time, x, y, c);
      const m = hex(w - 1 - x, y);
      if (m) t.at(time, w - 1 - x, y, m);
      time += 14;
    }
  return t.done(2600, 0.5);
}

// ---- Tile preview: one tile drawn, nine copies follow ------------------------------------------

function tiles(): PixelAnimation {
  const random = seeded(3);
  const tile: string[] = [];
  for (let y = 0; y < 16; y++) {
    const row = Math.floor(y / 4);
    for (let x = 0; x < 16; x++) {
      const bx = (x + (row % 2) * 4) % 8;
      const mortar = y % 4 === 3 || bx === 7;
      let color = mortar ? S.dark : S.red;
      if (!mortar && y % 4 === 0) color = S.orange;
      else if (!mortar && random() < 0.12) color = S.plum;
      tile.push(color);
    }
  }
  const t = new Timeline(48, 48);
  // Mortar first, then the bricks, then their light top edge and the specks.
  const order: number[] = [];
  const pass = (keep: (c: string) => boolean) => tile.forEach((c, i) => keep(c) && order.push(i));
  pass((c) => c === S.dark);
  pass((c) => c === S.red || c === S.plum);
  let time = 300;
  for (const i of order) {
    const x = i % 16;
    const y = Math.floor(i / 16);
    const c = tile[i] === S.plum ? S.red : tile[i];
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) t.at(time, x + tx * 16, y + ty * 16, c);
    time += 9;
  }
  time += 200;
  tile.forEach((c, i) => {
    if (c !== S.orange && c !== S.plum) return;
    const x = i % 16;
    const y = Math.floor(i / 16);
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) t.at(time, x + tx * 16, y + ty * 16, c);
    time += 14;
  });
  return t.done(2400, 0.4);
}

// ---- Start: tracing over a reference image ----------------------------------------------------

/** An apple, as smooth shapes: the reference image, and what each pixel of the tracing samples. */
const APPLE = {
  body: { cx: 12, cy: 14.5, rx: 8.6, ry: 7.6 },
  leaf: { cx: 15.6, cy: 5.2, rx: 3.2, ry: 1.5, angle: -28 },
  stem: { x: 11.4, y: 3, w: 1.3, h: 4.5 },
  light: { x: 8.5, y: 11 },
};

const inEllipse = (
  e: { cx: number; cy: number; rx: number; ry: number; angle?: number },
  x: number,
  y: number,
) => {
  const a = ((e.angle ?? 0) * Math.PI) / 180;
  const dx = x - e.cx;
  const dy = y - e.cy;
  const u = dx * Math.cos(a) + dy * Math.sin(a);
  const v = -dx * Math.sin(a) + dy * Math.cos(a);
  return (u / e.rx) ** 2 + (v / e.ry) ** 2 <= 1;
};

/** The reference: a soft SVG apple with gradients, nothing like pixels. */
function appleReference(): string {
  const { body, leaf, stem, light } = APPLE;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
    '<defs><radialGradient id="ref-apple" cx="' + light.x / 24 + '" cy="' + light.y / 24 + '" r="0.55">',
    `<stop offset="0" stop-color="${S.orange}"/><stop offset="0.45" stop-color="${S.red}"/><stop offset="1" stop-color="${S.plum}"/>`,
    '</radialGradient></defs>',
    `<rect x="${stem.x}" y="${stem.y}" width="${stem.w}" height="${stem.h}" rx="0.6" fill="${S.plum}"/>`,
    `<ellipse cx="${leaf.cx}" cy="${leaf.cy}" rx="${leaf.rx}" ry="${leaf.ry}" transform="rotate(${leaf.angle} ${leaf.cx} ${leaf.cy})" fill="${S.green}"/>`,
    `<ellipse cx="${body.cx}" cy="${body.cy}" rx="${body.rx}" ry="${body.ry}" fill="url(#ref-apple)"/>`,
    '</svg>',
  ].join('');
}

/** The apple traced at 24×24: the outline first, around the shape, then the fill, row by row. */
function trace(): { animation: PixelAnimation; reference: string } {
  const { body, leaf, stem, light } = APPLE;
  const n = 24;
  const t = new Timeline(n, n);
  const shape = (x: number, y: number): string | null => {
    const px = x + 0.5;
    const py = y + 0.5;
    if (inEllipse(body, px, py)) {
      const d = Math.hypot(px - light.x, py - light.y) / 11;
      if (Math.hypot(px - light.x, py - light.y) < 1.3) return S.white;
      return d < 0.35 ? S.orange : d < 0.8 ? S.red : S.plum;
    }
    if (inEllipse(leaf, px, py)) return py < leaf.cy - 0.2 ? S.lime : S.green;
    if (px >= stem.x && px <= stem.x + stem.w + 0.3 && py >= stem.y && py <= stem.y + stem.h) return S.plum;
    return null;
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && shape(x, y) !== null;
  const outline: Point[] = [];
  const fill: Point[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => !inside(x + dx, y + dy));
      (edge ? outline : fill).push({ x, y });
    }
  // Around the shape like a pen would go, starting at the top.
  const angle = (p: Point) => (Math.atan2(p.y + 0.5 - 12, p.x + 0.5 - 12) + Math.PI * 2.5) % (Math.PI * 2);
  outline.sort((a, b) => angle(a) - angle(b));
  let time = 500;
  for (const p of outline) {
    t.at(time, p.x, p.y, S.ink);
    time += 30;
  }
  time += 300;
  for (const p of fill) {
    t.at(time, p.x, p.y, shape(p.x, p.y));
    time += 9;
  }
  // The hold leaves time for the reference to be hidden, and the apple to be seen alone.
  return { animation: t.done(3800, 0.5), reference: appleReference() };
}

// ---- Layers: a scene in three layers ------------------------------------------------------------

const BALLOON = [
  '...####...',
  '..#oooo#..',
  '.#oyyoor#.',
  '#oyyooorr#',
  '#ooooooor#',
  '#ooooooor#',
  '.#ooooor#.',
  '..#oorr#..',
  '...#rr#...',
  '....##....',
  '...#..#...',
  '...#bb#...',
  '...####...',
];

/** Each layer as its own transparent SVG: what the page moves and hides, like the editor would. */
function layers() {
  const w = 96;
  const h = 64;
  const { color, isCity } = duskCity(w, 40);
  const svg = (keep: (x: number, y: number) => boolean) => {
    const pixels = new Uint32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (keep(x, y)) pixels[y * w + x] = fromHex(color(x, y))!;
    return toSvg(pixels, w, h, renderGeometry(w, h, 1, 0));
  };
  const bw = BALLOON[0].length;
  const bh = BALLOON.length;
  const tones: Record<string, string> = {
    '#': NIGHT.block,
    o: DUSK[9],
    y: DUSK[11],
    r: DUSK[6],
    b: NIGHT.wall,
  };
  const balloon = new Uint32Array(bw * bh);
  BALLOON.forEach((row, y) =>
    [...row].forEach((ch, x) => ch !== '.' && (balloon[y * bw + x] = fromHex(tones[ch])!)),
  );
  return {
    w,
    h,
    sky: svg((x, y) => !isCity(x, y)),
    city: svg(isCity),
    balloon: { svg: toSvg(balloon, bw, bh, renderGeometry(bw, bh, 1, 0)), w: bw, h: bh },
  };
}

// ---- Rework: Jumble along an edge ------------------------------------------------------------

/** Foliage against a dusk sky; the Jumble brush runs along the edge and swaps pixels as it goes. */
function jumble(): PixelAnimation {
  const w = 40;
  const h = 18;
  const edge = 8;
  const t = new Timeline(w, h);
  const specks = seeded(5);
  const pixels: string[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c =
        y < 4
          ? DUSK[10]
          : y < edge
            ? DUSK[9]
            : specks() < 0.12
              ? '#964fab'
              : y > 13
                ? NIGHT.block
                : NIGHT.wall;
      pixels.push(c);
      t.base(x, y, c);
    }
  const random = seeded(7);
  const size = 4;
  const swaps = Math.round(size * size * 0.15);
  let time = 500;
  // The Jumble tool's own swaps: random pairs inside the brush, as it goes left to right, twice.
  for (let pass = 0; pass < 2; pass++)
    for (let px = 0; px < w; px++) {
      for (let k = 0; k < swaps; k++) {
        const ax = px - 2 + Math.floor(random() * size);
        const ay = edge - 2 + Math.floor(random() * size);
        const bx = px - 2 + Math.floor(random() * size);
        const by = edge - 2 + Math.floor(random() * size);
        if ([ax, bx].some((v) => v < 0 || v >= w)) continue;
        const a = pixels[ay * w + ax];
        const b = pixels[by * w + bx];
        if (a === b) continue;
        pixels[ay * w + ax] = b;
        pixels[by * w + bx] = a;
        t.at(time, ax, ay, b);
        t.at(time, bx, by, a);
      }
      time += 55;
    }
  return t.done(2400, 0.4);
}

// ---- Shapes: an outline that lifts a sprite off its background -------------------------------

const MUSHROOM = [
  '....RRRRRR....',
  '..RRWWRRRRRR..',
  '.RRWWWRRRWWRR.',
  '.RRRWRRRRWWWR.',
  'RRRRRRRRRRRRRR',
  'RRWWRRRRRRRDRR',
  'DRWWRRRRRRDDRD',
  '.DDDRRRRRRDDD.',
  '....CCCCCC....',
  '...CCCCCCCC...',
  '...CcCCCCCC...',
  '...CcCCCCCC...',
  '....cCCCCC....',
];

/** When the outline panel changes, in ms: shared with the page, which plays the panel along. */
export const OUTLINE_STEPS = { tab: 900, square: 2200, round: 3500, apply: 4700, end: 6600 };

/** A mushroom on a dusk sky: its cap gets lost in the pink, until the Outline panel goes around it. */
function outline(): PixelAnimation {
  const w = 24;
  const h = 19;
  const t = new Timeline(w, h);
  const ox = 5;
  const oy = 3;
  const tones: Record<string, string> = {
    R: '#d64560',
    D: '#9c2f55',
    W: '#fff4e0',
    C: '#f6dcc0',
    c: '#d9b294',
  };
  const sprite = new Uint32Array(w * h);
  MUSHROOM.forEach((row, y) =>
    [...row].forEach((ch, x) => ch !== '.' && (sprite[(y + oy) * w + x + ox] = fromHex(tones[ch])!)),
  );
  const sky = (y: number) => DUSK[Math.min(DUSK.length - 1, 5 + Math.floor((y / h) * 6))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = sprite[y * w + x];
      t.base(x, y, c ? toHex(c) : sky(y));
    }
  // The editor's own outline, as its panel previews it: round corners first (the default),
  // then square corners, then round again. Each change lands all at once, like the live preview.
  const ink = '#2b1d3f';
  const around = (corners: boolean) =>
    outlinePixels(sprite, w, { x: 0, y: 0, w, h }, { place: 'outside', corners, color: fromHex(ink)! });
  const round = around(false);
  const square = around(true);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (sprite[i]) continue;
      if (round[i]) t.at(OUTLINE_STEPS.tab, x, y, ink);
      else if (square[i]) {
        t.at(OUTLINE_STEPS.square, x, y, ink);
        t.at(OUTLINE_STEPS.round, x, y, sky(y));
      }
    }
  return t.done(OUTLINE_STEPS.end - OUTLINE_STEPS.round, 0.3);
}

export const animations = {
  outline: outline(),
  jumble: jumble(),
  layers: layers(),
  trace: trace(),
  hero: hero(),
  pencil: pencil(),
  bucket: bucket(),
  spray: spray(),
  symmetry: symmetry(),
  tiles: tiles(),
};
