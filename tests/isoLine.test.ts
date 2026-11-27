import { describe, expect, it } from 'vitest';
import { snappedLine } from '../src/engine/raster';

const pixels = (x: number, y: number, runs?: number[]) => {
  const out: string[] = [];
  snappedLine({ x: 0, y: 0 }, { x, y }, (px, py) => out.push(`${px},${py}`), runs);
  return out;
};

describe('Shift on the line tool', () => {
  it('snaps near 2:1 to clean steps of two pixels', () => {
    expect(pixels(7, 3)).toEqual(['0,0', '1,0', '2,1', '3,1', '4,2', '5,2', '6,3', '7,3']);
    // A little off the angle still gives the same line.
    expect(pixels(6, 4)).toEqual(pixels(7, 3));
  });

  it('goes the same way up, left, and steep (1:2)', () => {
    expect(pixels(-7, -3)).toEqual(['0,0', '-1,0', '-2,-1', '-3,-1', '-4,-2', '-5,-2', '-6,-3', '-7,-3']);
    expect(pixels(3, 7)).toEqual(['0,0', '0,1', '1,2', '1,3', '2,4', '2,5', '3,6', '3,7']);
  });

  it('still locks to 0°, 45° and 90°', () => {
    expect(pixels(10, 1)).toEqual(Array.from({ length: 11 }, (_, x) => `${x},0`));
    expect(pixels(3, 3)).toEqual(['0,0', '1,1', '2,2', '3,3']);
    expect(pixels(0, -3)).toEqual(['0,0', '0,-1', '0,-2', '0,-3']);
  });

  it('snaps near 3:1 and 4:1 to clean steps of three and four pixels', () => {
    expect(pixels(8, 3)).toEqual(['0,0', '1,0', '2,0', '3,1', '4,1', '5,1', '6,2', '7,2', '8,2']);
    expect(pixels(7, 2)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,1', '5,1', '6,1', '7,1']);
    expect(pixels(-2, 7)).toEqual(['0,0', '0,1', '0,2', '0,3', '-1,4', '-1,5', '-1,6', '-1,7']);
  });

  it('keeps to 2:1 when only that step is allowed, as on an isometric grid', () => {
    const iso = pixels(8, 3, [2]);
    expect(iso.every((p, i) => p === `${i},${Math.floor(i / 2)}`)).toBe(true);
    expect(pixels(10, 1, [2])).toEqual(pixels(10, 1));
  });

  it('never puts two pixels of a step in the same column', () => {
    const xs = pixels(31, 15).map((p) => p.split(',')[0]);
    expect(new Set(xs).size).toBe(xs.length);
  });
});
