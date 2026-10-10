import type { Point } from './math';

export type PlotFn = (x: number, y: number) => void;

/** Bresenham line, both ends included. */
export function line(x0: number, y0: number, x1: number, y1: number, plot: PlotFn): void {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Snaps the end point to 0°, 45° or 90° from the start point. */
export function constrainAngle(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay * 2) return { x: end.x, y: start.y };
  if (ay > ax * 2) return { x: start.x, y: end.y };
  const d = Math.max(ax, ay);
  return { x: start.x + Math.sign(dx) * d, y: start.y + Math.sign(dy) * d };
}

/** Makes the box defined by two points square. */
export function constrainSquare(start: Point, end: Point): Point {
  const d = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  return { x: start.x + (end.x < start.x ? -d : d), y: start.y + (end.y < start.y ? -d : d) };
}

export function rectOutline(x0: number, y0: number, x1: number, y1: number, plot: PlotFn): void {
  for (let x = x0; x <= x1; x++) {
    plot(x, y0);
    plot(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    plot(x0, y);
    plot(x1, y);
  }
}

/**
 * Ellipse inscribed in a rectangle (Alois Zingl's algorithm). Works for even sizes, unlike
 * the classic center/radius midpoint algorithm. Points can be emitted more than once.
 */
export function ellipseOutline(x0: number, y0: number, x1: number, y1: number, plot: PlotFn): void {
  if (x0 === x1 || y0 === y1) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) plot(x, y);
    return;
  }
  let a = Math.abs(x1 - x0);
  const b = Math.abs(y1 - y0);
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  if (x0 > x1) {
    x0 = x1;
    x1 += a;
  }
  if (y0 > y1) y0 = y1;
  y0 += (b + 1) >> 1;
  y1 = y0 - b1;
  a *= 8 * a;
  b1 = 8 * b * b;
  do {
    plot(x1, y0);
    plot(x0, y0);
    plot(x0, y1);
    plot(x1, y1);
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      dy += a;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      dx += b1;
      err += dx;
    }
  } while (x0 <= x1);
  while (y0 - y1 <= b) {
    plot(x0 - 1, y0);
    plot(x1 + 1, y0++);
    plot(x0 - 1, y1);
    plot(x1 + 1, y1--);
  }
}

/** Filled ellipse: collects the outline's horizontal spans, then fills them. */
/** Fills a convex outline row by row, from its leftmost to its rightmost point on each row. */
function fillConvex(outline: (plot: PlotFn) => void, plot: PlotFn): void {
  const spans = new Map<number, [number, number]>();
  outline((x, y) => {
    const s = spans.get(y);
    if (!s) spans.set(y, [x, x]);
    else {
      if (x < s[0]) s[0] = x;
      if (x > s[1]) s[1] = x;
    }
  });
  spans.forEach(([a, b], y) => {
    for (let x = a; x <= b; x++) plot(x, y);
  });
}

export function ellipseFilled(x0: number, y0: number, x1: number, y1: number, plot: PlotFn): void {
  fillConvex((p) => ellipseOutline(x0, y0, x1, y1, p), plot);
}

/** Rectangle with quarter-circle corners of radius `r` (clamped to fit). Points can repeat. */
export function roundRectOutline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  plot: PlotFn,
): void {
  r = Math.max(0, Math.min(Math.floor(r), Math.floor((x1 - x0) / 2), Math.floor((y1 - y0) / 2)));
  if (r === 0) return rectOutline(x0, y0, x1, y1, plot);
  const d = 2 * r;
  // Each corner is the matching quadrant of a (2r+1)-wide circle.
  ellipseOutline(x0, y0, x0 + d, y0 + d, (x, y) => x <= x0 + r && y <= y0 + r && plot(x, y));
  ellipseOutline(x1 - d, y0, x1, y0 + d, (x, y) => x >= x1 - r && y <= y0 + r && plot(x, y));
  ellipseOutline(x0, y1 - d, x0 + d, y1, (x, y) => x <= x0 + r && y >= y1 - r && plot(x, y));
  ellipseOutline(x1 - d, y1 - d, x1, y1, (x, y) => x >= x1 - r && y >= y1 - r && plot(x, y));
  for (let x = x0 + r + 1; x < x1 - r; x++) {
    plot(x, y0);
    plot(x, y1);
  }
  for (let y = y0 + r + 1; y < y1 - r; y++) {
    plot(x0, y);
    plot(x1, y);
  }
}

export function roundRectFilled(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  plot: PlotFn,
): void {
  fillConvex((p) => roundRectOutline(x0, y0, x1, y1, r, p), plot);
}

/** Closed polygon outline, Bresenham lines between consecutive vertices. */
export function polygonOutline(points: Point[], plot: PlotFn): void {
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    line(a.x, a.y, b.x, b.y, plot);
  });
}

/** Filled polygon (even-odd rule on pixel centers), outline included so edges match the outline. */
export function polygonFilled(points: Point[], plot: PlotFn): void {
  const ys = points.map((p) => p.y);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const ay = a.y + 0.5;
      const by = b.y + 0.5;
      if (ay <= cy !== by <= cy) xs.push(a.x + 0.5 + ((cy - ay) / (by - ay)) * (b.x - a.x));
    });
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k] - 0.5); x + 0.5 <= xs[k + 1]; x++) plot(x, y);
  }
  polygonOutline(points, plot);
}

/**
 * Keeps only the left half of what is plotted and mirrors it around the axis between x0 and x1.
 * Lines are not symmetric on their own (a→b and its mirror pick different pixels), so symmetric
 * shapes are drawn through this to stay exactly symmetric.
 */
export function mirroredHalf(x0: number, x1: number, plot: PlotFn): PlotFn {
  return (x, y) => {
    if (2 * x > x0 + x1) return;
    plot(x, y);
    if (2 * x < x0 + x1) plot(x0 + x1 - x, y);
  };
}

/** Triangle pointing up, inscribed in the rectangle. Even widths get a 2-pixel tip, to stay symmetric. */
export function trianglePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const mid = (x0 + x1) / 2;
  return [
    { x: Math.floor(mid), y: y0 },
    { x: Math.ceil(mid), y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Five-pointed star inscribed in the rectangle, mirrored exactly around its vertical axis. */
export function starPoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const unit = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? 0.5 : 1;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
  const minY = Math.min(...unit.map((p) => p.y));
  const maxY = Math.max(...unit.map((p) => p.y));
  const maxX = Math.max(...unit.map((p) => p.x));
  const w = x1 - x0;
  const h = y1 - y0;
  return unit.map((p) => {
    const u = (p.x + maxX) / (2 * maxX); // 0..1, left to right
    const x = u <= 0.5 ? x0 + Math.round(u * w) : x1 - Math.round((1 - u) * w);
    return { x, y: y0 + Math.round(((p.y - minY) / (maxY - minY)) * h) };
  });
}

/** Top-left aligned square brush footprint. Odd sizes are centered on (cx, cy). */
export function brush(cx: number, cy: number, size: number, plot: PlotFn, round = false): void {
  const o = Math.floor((size - 1) / 2);
  // A round tip keeps the cells within a radius a bit under half the size, so 3 gives a plus and
  // 4 a rounded square. Sizes 1 and 2 stay square: there's nothing to round.
  const c = (size - 1) / 2;
  const r2 = (size / 2 - 0.25) ** 2;
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      if (round && size > 2 && (dx - c) ** 2 + (dy - c) ** 2 > r2) continue;
      plot(cx - o + dx, cy - o + dy);
    }
}

/**
 * A point (or the top-left corner of a `size` square) and its mirrored counterparts around the axes,
 * given in pixels from the edges (see `mirrorAxes`), for symmetric drawing.
 */
export function mirrored(
  x: number,
  y: number,
  axisX: number,
  axisY: number,
  mirrorX: boolean,
  mirrorY: boolean,
  size = 1,
): Point[] {
  const mx = 2 * axisX - x - size;
  const my = 2 * axisY - y - size;
  const out: Point[] = [{ x, y }];
  if (mirrorX) out.push({ x: mx, y });
  if (mirrorY) out.push({ x, y: my });
  if (mirrorX && mirrorY) out.push({ x: mx, y: my });
  return out;
}

/**
 * "Pixel perfect": when the last three points form an L (b touches both a and p, while a and p
 * are diagonal), b is a doubled corner pixel and should be removed.
 */
export function isDoubledCorner(a: Point, b: Point, p: Point): boolean {
  return (
    Math.abs(a.x - p.x) === 1 &&
    Math.abs(a.y - p.y) === 1 &&
    (b.x === a.x || b.y === a.y) &&
    (b.x === p.x || b.y === p.y)
  );
}

/**
 * 4-way flood fill over `source`, starting at (x, y). Calls `visit` for every matching pixel index.
 * `canVisit` restricts the fill (e.g. to a selection).
 */
export function floodFill(
  source: Uint32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  visit: (index: number) => void,
  canVisit: (x: number, y: number) => boolean = () => true,
  seen: Uint8Array = new Uint8Array(width * height),
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const target = source[y * width + x];
  const stack = [y * width + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    const px = i % width;
    const py = (i / width) | 0;
    if (source[i] !== target || !canVisit(px, py)) continue;
    seen[i] = 1;
    visit(i);
    if (px > 0) stack.push(i - 1);
    if (px < width - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - width);
    if (py < height - 1) stack.push(i + width);
  }
}

/**
 * A heart filling a w × h box, as a mask: the pixels whose center is inside the classic heart
 * curve (x² + y² − 1)³ = x²y³. Its tip is always there, even when it falls between two pixels.
 */
export function heartMask(w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  if (w < 3 || h < 3) return mask.fill(1);
  let last = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2.4 - 1.2;
      const v = 1.25 - ((y + 0.5) / h) * 2.3;
      const a = u * u + v * v - 1;
      if (a * a * a - u * u * v * v * v > 0) continue;
      mask[y * w + x] = 1;
      last = y;
    }
  // Down to the bottom of the box: the middle pixel, or the two middle ones for an even width.
  for (let y = last + 1; y < h; y++) {
    mask[y * w + ((w - 1) >> 1)] = 1;
    mask[y * w + (w >> 1)] = 1;
  }
  return mask;
}

/** A filled heart in the box from (x0, y0) to (x1, y1). */
export function heartFilled(x0: number, y0: number, x1: number, y1: number, plot: PlotFn): void {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const mask = heartMask(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) plot(x0 + x, y0 + y);
}

/** The edge of a heart: its pixels touching the outside on a side. */
export function heartOutline(x0: number, y0: number, x1: number, y1: number, plot: PlotFn): void {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const mask = heartMask(w, h);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)))
        plot(x0 + x, y0 + y);
}
