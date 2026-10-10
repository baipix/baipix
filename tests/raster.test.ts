import { describe, expect, it } from 'vitest';
import {
  heartMask,
  heartOutline,
  brush,
  constrainAngle,
  ellipseFilled,
  ellipseOutline,
  floodFill,
  isDoubledCorner,
  line,
  mirrored,
  mirroredHalf,
  polygonFilled,
  polygonOutline,
  roundRectOutline,
  starPoints,
  trianglePoints,
} from '../src/engine/raster';

const collect = (fn: (plot: (x: number, y: number) => void) => void) => {
  const pts = new Set<string>();
  fn((x, y) => pts.add(`${x},${y}`));
  return pts;
};

describe('line', () => {
  it('includes both ends and one pixel per step on a diagonal', () => {
    const pts = collect((p) => line(0, 0, 3, 3, p));
    expect([...pts]).toEqual(['0,0', '1,1', '2,2', '3,3']);
  });

  it('snaps angles', () => {
    expect(constrainAngle({ x: 0, y: 0 }, { x: 10, y: 2 })).toEqual({ x: 10, y: 0 });
    expect(constrainAngle({ x: 0, y: 0 }, { x: 5, y: 4 })).toEqual({ x: 5, y: 5 });
  });
});

describe('ellipse', () => {
  it('fits exactly in its bounding box, even sizes included', () => {
    const pts = collect((p) => ellipseOutline(0, 0, 7, 5, p));
    const xs = [...pts].map((s) => +s.split(',')[0]);
    const ys = [...pts].map((s) => +s.split(',')[1]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(7);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(5);
  });

  it('is symmetric', () => {
    const pts = collect((p) => ellipseFilled(0, 0, 9, 9, p));
    for (const s of pts) {
      const [x, y] = s.split(',').map(Number);
      expect(pts.has(`${9 - x},${y}`)).toBe(true);
      expect(pts.has(`${x},${9 - y}`)).toBe(true);
    }
  });
});

describe('pixel perfect', () => {
  it('detects an L-shaped doubled corner', () => {
    expect(isDoubledCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(isDoubledCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
});

describe('floodFill', () => {
  it('fills only the connected region', () => {
    // 4×3, a wall of 1s in column 2
    const src = Uint32Array.from([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const filled: number[] = [];
    floodFill(src, 4, 3, 0, 0, (i) => filled.push(i));
    expect(filled.sort((a, b) => a - b)).toEqual([0, 1, 4, 5, 8, 9]);
  });
});

describe('mirrored', () => {
  it('mirrors on both axes', () => {
    // An 8 × 8 canvas: both axes in the middle, at 4.
    expect(mirrored(1, 2, 4, 4, true, true)).toEqual([
      { x: 1, y: 2 },
      { x: 6, y: 2 },
      { x: 1, y: 5 },
      { x: 6, y: 5 },
    ]);
  });
});

describe('shapes', () => {
  const mirrorOf = (set: Set<string>, x0: number, x1: number) =>
    [...set].every((k) => {
      const [x, y] = k.split(',').map(Number);
      return set.has(`${x0 + x1 - x},${y}`);
    });

  it('draws a rounded rectangle with empty corners', () => {
    const px = collect((p) => roundRectOutline(0, 0, 9, 7, 2, p));
    expect(px.has('0,0')).toBe(false);
    expect(px.has('9,7')).toBe(false);
    expect(px.has('4,0')).toBe(true);
    expect(px.has('0,4')).toBe(true);
    // A zero radius is a plain rectangle.
    expect(collect((p) => roundRectOutline(0, 0, 5, 5, 0, p)).has('0,0')).toBe(true);
  });

  it('keeps triangles and stars symmetric, and fills them without holes', () => {
    for (const [x1, y1] of [
      [8, 8],
      [9, 6],
      [15, 15],
    ]) {
      for (const points of [trianglePoints(0, 0, x1, y1), starPoints(0, 0, x1, y1)]) {
        const outline = collect((p) => polygonOutline(points, mirroredHalf(0, x1, p)));
        const filled = collect((p) => polygonFilled(points, mirroredHalf(0, x1, p)));
        expect(mirrorOf(outline, 0, x1)).toBe(true);
        expect(mirrorOf(filled, 0, x1)).toBe(true);
        expect([...outline].every((k) => filled.has(k))).toBe(true);
        expect(filled.size).toBeGreaterThan(outline.size);
      }
    }
    const tri = trianglePoints(0, 0, 8, 8);
    expect(tri[0]).toEqual({ x: 4, y: 0 });
    expect(tri[2]).toEqual({ x: 8, y: 8 });
  });
});

describe('round brush tip', () => {
  const cells = (size: number, round: boolean) => {
    const out: string[] = [];
    brush(0, 0, size, (x, y) => out.push(`${x},${y}`), round);
    return out;
  };

  it('rounds the corners from size 3', () => {
    expect(cells(3, true).sort()).toEqual(['-1,0', '0,-1', '0,0', '0,1', '1,0'].sort());
    expect(cells(4, true)).toHaveLength(12);
    expect(cells(8, true).length).toBeLessThan(64);
  });

  it('leaves sizes 1 and 2, and square tips, as they were', () => {
    expect(cells(1, true)).toEqual(cells(1, false));
    expect(cells(2, true)).toEqual(cells(2, false));
    expect(cells(5, false)).toHaveLength(25);
  });
});

describe('heart', () => {
  const draw = (w: number, h: number) => {
    const m = heartMask(w, h);
    return Array.from({ length: h }, (_, y) =>
      [...m.slice(y * w, y * w + w)].map((c) => (c ? '#' : '.')).join(''),
    );
  };

  it('looks like a heart, even small', () => {
    expect(draw(7, 6)).toEqual(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']);
  });

  it('reaches the bottom of the box, with an even width too', () => {
    const rows = draw(16, 14);
    expect(rows.at(-1)).toBe('.......##.......');
    // Symmetric.
    expect(rows.every((r) => r === [...r].reverse().join(''))).toBe(true);
  });

  it('outlines its edge only', () => {
    const edge: string[] = [];
    heartOutline(0, 0, 8, 7, (x, y) => edge.push(`${x},${y}`));
    expect(edge).toContain('0,1');
    expect(edge).not.toContain('4,3'); // the middle stays empty
  });
});
