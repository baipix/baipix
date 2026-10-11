import { describe, expect, it } from 'vitest';
import { snappedLine } from '../src/engine/raster';

const pixels = (x: number, y: number) => {
  const out: string[] = [];
  snappedLine({ x: 0, y: 0 }, { x, y }, (px, py) => out.push(`${px},${py}`));
  return out;
};

describe('Shift on the line tool', () => {
  it('snaps near 2:1 to clean steps of two pixels', () => {
    expect(pixels(7, 3)).toEqual(['0,0', '1,0', '2,1', '3,1', '4,2', '5,2', '6,3', '7,3']);
    // A little off the angle still gives the same line.
    expect(pixels(6, 4)).toEqual(pixels(7, 3));
  });

  it('goes the same way up, left, and steep (1:2)', () => {
    expect(pixels(-5, -2)).toEqual(['0,0', '-1,0', '-2,-1', '-3,-1', '-4,-2', '-5,-2']);
    expect(pixels(2, 5)).toEqual(['0,0', '0,1', '1,2', '1,3', '2,4', '2,5']);
  });

  it('still locks to 0°, 45° and 90°', () => {
    expect(pixels(5, 1)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0']);
    expect(pixels(3, 3)).toEqual(['0,0', '1,1', '2,2', '3,3']);
    expect(pixels(0, -3)).toEqual(['0,0', '0,-1', '0,-2', '0,-3']);
  });

  it('never puts two pixels of a step in the same column', () => {
    const xs = pixels(31, 15).map((p) => p.split(',')[0]);
    expect(new Set(xs).size).toBe(xs.length);
  });
});
