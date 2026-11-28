import { describe, expect, it } from 'vitest';
import { mirroredHalf, polygonHalf, polygonShape } from '../src/engine/raster';

/** The polygon drawn in the box, as rows of # and . */
const draw = (w: number, h: number, sides: number, flatTop = false, filled = false) => {
  const on = new Set<string>();
  polygonShape(
    polygonHalf(0, 0, w - 1, h - 1, sides, flatTop),
    filled,
    mirroredHalf(0, w - 1, (x, y) => on.add(`${x},${y}`)),
  );
  const ys = [...on].map((k) => +k.split(',')[1]);
  return Array.from({ length: Math.max(...ys) + 1 }, (_, y) =>
    Array.from({ length: w }, (_, x) => (on.has(`${x},${y}`) ? '#' : '.')).join(''),
  );
};

/** Pixels of the outline with no neighbor (8 around): a lone pixel, or a gap. */
const lonely = (rows: string[]) =>
  rows.flatMap((row, y) =>
    [...row].flatMap((c, x) => {
      if (c !== '#') return [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && rows[y + dy]?.[x + dx] === '#') return [];
      return [`${x},${y}`];
    }),
  );

describe('polygon', () => {
  it('is symmetric and in one piece', () => {
    for (const sides of [3, 4, 5, 6, 7, 8, 12])
      for (const flat of [false, true]) {
        const rows = draw(21, 18, sides, flat);
        expect(rows.every((r) => r === [...r].reverse().join(''))).toBe(true);
        expect(lonely(rows)).toEqual([]);
      }
  });

  it('draws a pointy hexagon with 2:1 sides, in even runs of two', () => {
    const rows = draw(15, 16, 6);
    // The top: a corner on the axis, then runs of two going out.
    expect(rows.slice(0, 4)).toEqual([
      '......###......',
      '....##...##....',
      '..##.......##..',
      '##...........##',
    ]);
  });

  it('draws a flat hexagon with a side on top and steep 1:2 sides', () => {
    const rows = draw(15, 13, 6, true);
    expect(rows[0]).toMatch(/^\.*#{5,}\.*$/);
    // Steep sides: two rows per column.
    expect(rows.slice(2, 8).map((r) => r.indexOf('#'))).toEqual([3, 3, 2, 2, 1, 1]);
  });

  it('makes a diamond from four sides, at 45° in a square box', () => {
    const rows = draw(9, 9, 4);
    expect(rows).toEqual([
      '....#....',
      '...#.#...',
      '..#...#..',
      '.#.....#.',
      '#.......#',
      '.#.....#.',
      '..#...#..',
      '...#.#...',
      '....#....',
    ]);
  });

  it('draws something from the first click, before the drag', () => {
    expect(draw(1, 1, 6)).toEqual(['#']);
    expect(draw(1, 4, 6, true, true)).toEqual(['#', '#', '#', '#']);
  });

  it('fills to its outline', () => {
    const outline = draw(15, 16, 6);
    const filled = draw(15, 16, 6, false, true);
    outline.forEach((row, y) => [...row].forEach((c, x) => c === '#' && expect(filled[y][x]).toBe('#')));
    expect(filled[8]).toBe('###############');
  });
});
