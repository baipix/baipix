import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { cleanEllipse } from '../src/engine/raster';

/** The top half of an outlined ellipse, as text. */
function top(w: number, h: number): string[] {
  const cells = new Set<string>();
  cleanEllipse(0, 0, w - 1, h - 1, false, (x, y) => cells.add(`${x},${y}`));
  const rows: string[] = [];
  for (let y = 0; y < Math.ceil(h / 2); y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += cells.has(`${x},${y}`) ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

/** Each row's run along the outline: its pixels in the right half. */
const runs = (rows: string[]) => rows.map((row) => row.slice(row.length / 2).split('#').length - 1);

describe('isometric ellipse', () => {
  it('is drawn in runs that only get shorter toward the sides, with two-pixel steps', () => {
    expect(top(32, 16)).toEqual([
      '..........############..........',
      '.......###............###.......',
      '.....##..................##.....',
      '...##......................##...',
      '..#..........................#..',
      '.#............................#.',
      '#..............................#',
      '#..............................#',
    ]);
    for (const [w, h] of [
      [16, 8],
      [24, 12],
      [48, 24],
      [40, 20],
    ]) {
      const r = runs(top(w, h)).slice(1);
      for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThanOrEqual(r[i - 1]);
    }
  });

  it('is symmetric, and fills', () => {
    const cells = new Set<string>();
    cleanEllipse(0, 0, 15, 7, true, (x, y) => cells.add(`${x},${y}`));
    for (const c of cells) {
      const [x, y] = c.split(',').map(Number);
      expect(cells.has(`${15 - x},${y}`)).toBe(true);
      expect(cells.has(`${x},${7 - y}`)).toBe(true);
    }
    expect(cells.has('8,4')).toBe(true);
  });

  it('comes from Shift on the ellipse tool with the isometric grid on, twice as wide as tall', () => {
    const e = new Editor();
    e.newFile(64, 64);
    e.setColor('primary', pack(255, 0, 0));
    e.setTool('ellipse');
    const bounds = () => {
      const { width, layers } = e.getState().doc;
      const px = layers[0].pixels;
      const pts = [...px.keys()].filter((i) => px[i]).map((i) => [i % width, Math.floor(i / width)]);
      const xs = pts.map(([x]) => x);
      const ys = pts.map(([, y]) => y);
      return [Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1];
    };
    e.setIsoGrid(16);
    e.beginStroke({ x: 2, y: 2 }, false, { shift: true });
    e.moveStroke({ x: 20, y: 20 }, { shift: true });
    e.endStroke();
    expect(bounds()).toEqual([38, 19]);
  });
});
