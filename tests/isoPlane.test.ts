import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { isoBox } from '../src/engine/isoBox';
import { planeShape, type IsoPlane } from '../src/engine/isoPlane';

type Wall = Exclude<IsoPlane, 'flat'>;

function art(kind: 'rect' | 'ellipse', plane: Wall, b: { x: number; y: number }, filled = false) {
  const cells = new Map<string, boolean>();
  planeShape(kind, plane, { x: 0, y: 0 }, b, filled, (x, y, o) => cells.set(`${x},${y}`, o));
  return cells;
}

const rows = (cells: Map<string, boolean>, w: number, h: number) =>
  Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const v = cells.get(`${x},${y}`);
      return v === undefined ? '.' : v ? '#' : '+';
    }).join(''),
  );

describe('drawing on an isometric plane', () => {
  it('puts a rectangle on the left wall in the dragged box, its top and bottom in 2:1 steps', () => {
    expect(rows(art('rect', 'left', { x: 5, y: 5 }), 6, 6)).toEqual([
      '##....',
      '#.##..',
      '#...##',
      '##...#',
      '..##.#',
      '....##',
    ]);
  });

  it('slopes the other way on the right wall, and fills', () => {
    expect(rows(art('rect', 'right', { x: 5, y: 5 }, true), 6, 6)).toEqual([
      '....##',
      '..##+#',
      '##+++#',
      '#+++##',
      '#+##..',
      '##....',
    ]);
  });

  it('keeps an ellipse on a wall in one piece', () => {
    const cells = [...art('ellipse', 'left', { x: 11, y: 13 }).keys()].map((k) => k.split(',').map(Number));
    const seen = new Set([cells[0].join(',')]);
    const queue = [cells[0]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k) && cells.some((c) => c.join(',') === k)) {
          seen.add(k);
          queue.push([x + dx, y + dy]);
        }
      }
    }
    expect(seen.size).toBe(cells.length);
  });

  it('only applies on an isometric grid', () => {
    const e = new Editor();
    e.newFile(16, 16);
    e.setColor('primary', pack(255, 0, 0));
    e.setTool('rect');
    e.setOption('plane', 'left');
    const draw = () => {
      e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
      e.moveStroke({ x: 5, y: 5 }, { shift: false });
      e.endStroke();
      return e.getState().doc.layers[0].pixels[0 * 16 + 4] !== 0;
    };
    // Flat, (4, 0) is on the rectangle's top edge.
    expect(draw()).toBe(true);
    e.undo();
    e.setIsoGrid(16);
    // On the left wall, the top edge has gone down by then: (4, 0) stays empty.
    expect(draw()).toBe(false);
  });
});

describe('Shift on a shape, with the isometric grid on', () => {
  const RED = pack(255, 0, 0);
  const shape = (tool: 'rect' | 'star' | 'heart', grid: boolean, shift: boolean) => {
    const e = new Editor();
    e.newFile(64, 64);
    if (grid) e.setIsoGrid(16);
    e.setColor('primary', RED);
    e.setTool(tool);
    e.setOption('filled', true);
    e.beginStroke({ x: 32, y: 8 }, false, { shift });
    e.moveStroke({ x: 32, y: 24 }, { shift });
    e.endStroke();
    const px = e.getState().doc.layers[0].pixels;
    return new Set([...px.keys()].filter((i) => px[i]).map((i) => `${i % 64},${Math.floor(i / 64)}`));
  };

  it('lays a square tile on the ground: exactly the box’s top', () => {
    const box = new Set<string>();
    isoBox({ x: 32, y: 8 }, { width: 8, depth: 8, height: 0 }, false, (x, y) => box.add(`${x},${y}`));
    expect(shape('rect', true, true)).toEqual(box);
  });

  it('lays the other shapes down inside the same diamond', () => {
    const box = new Set<string>();
    isoBox({ x: 32, y: 8 }, { width: 8, depth: 8, height: 0 }, false, (x, y) => box.add(`${x},${y}`));
    for (const tool of ['star', 'heart'] as const) {
      const cells = shape(tool, true, true);
      expect(cells.size).toBeGreaterThan(10);
      for (const c of cells) expect(box.has(c)).toBe(true);
    }
  });

  it('keeps its usual meaning without the grid: a square', () => {
    const cells = shape('rect', false, true);
    expect(cells.size).toBe(17 * 17);
  });
});
