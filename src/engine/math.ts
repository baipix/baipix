export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectFromPoints = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x) + 1,
  h: Math.abs(a.y - b.y) + 1,
});

/** Intersects a rectangle with the canvas bounds. */
export const clipRect = (r: Rect, width: number, height: number): Rect => {
  const x0 = clamp(r.x, 0, width);
  const y0 = clamp(r.y, 0, height);
  const x1 = clamp(r.x + r.w, 0, width);
  const y1 = clamp(r.y + r.h, 0, height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
