import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import type { BoxFace } from '../src/engine/isoBox';
import { isoRamp, type RampDirection } from '../src/engine/isoRamp';

const MARK: Record<BoxFace, string> = {
  top: 'T',
  left: 'L',
  right: 'R',
  edge: 'o',
  light: '+',
  bevelLeft: 'l',
  bevelRight: 'r',
};

/** The ramp as rows of text. */
function art(direction: RampDirection, steps: number): string[] {
  const cells = new Map<string, string>();
  isoRamp({ x: 0, y: 0 }, { width: 3, depth: 3, height: 6 }, direction, steps, (x, y, f) =>
    cells.set(`${x},${y}`, MARK[f]),
  );
  const xs = [...cells.keys()].map((k) => +k.split(',')[0]);
  const ys = [...cells.keys()].map((k) => +k.split(',')[1]);
  const rows: string[] = [];
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    let r = '';
    for (let x = Math.min(...xs); x <= Math.max(...xs); x++) r += cells.get(`${x},${y}`) ?? '.';
    rows.push(r);
  }
  return rows;
}

describe('isometric stairs and ramps', () => {
  it('rises toward its far corner: the slope, the high end and the side showing', () => {
    expect(art('se', 0)).toEqual([
      '...........TT',
      '.........TTTR',
      '.......TTTRRR',
      '.....TTTRRRRR',
      '...TTTLRRRRRR',
      '.TTTLLLRRRRRR',
      'TTLLLLLRRRRRR',
      '.LLLLLLRRRRR.',
      '...LLLLRRR...',
      '.....LLR.....',
    ]);
  });

  it('becomes a staircase with steps, treads and risers taking turns', () => {
    expect(art('nw', 3)).toEqual([
      '......TT......',
      '....TTTTTT....',
      '..TTTTTTRR....',
      'TTTTTTRRTT....',
      'LLTTRRTTTTTT..',
      'LLLRTTTTTTRR..',
      'LLTTTTTTRRTT..',
      'LLLLTTRRTTTTTT',
      'LLLLLRTTTTTTRR',
      'LLLLTTTTTTRRRR',
      '..LLLLTTRRRR..',
      '....LLLRRR....',
      '......LR......',
    ]);
  });

  it('is drawn by the ramp tool from a drag, without hanging on its first point', () => {
    const e = new Editor();
    e.newFile(48, 32);
    e.setColor('primary', pack(170, 150, 120));
    e.setTool('ramp');
    e.beginStroke({ x: 24, y: 4 }, false, { shift: false });
    e.moveStroke({ x: 24, y: 16 }, { shift: false });
    e.endStroke();
    expect(e.getState().doc.layers[0].pixels.some(Boolean)).toBe(true);
  });
});

describe('lying cylinders', () => {
  it('lies along an axis: its round end in front, its body going back', () => {
    const e = new Editor();
    e.newFile(48, 40);
    e.setColor('primary', pack(176, 120, 72));
    e.setOption('cylinderAxis', 'left');
    e.setOption('boxHeight', 6);
    e.setTool('cylinder');
    e.beginStroke({ x: 26, y: 16 }, false, { shift: false });
    e.moveStroke({ x: 33, y: 30 }, { shift: false });
    e.endStroke();
    const px = e.getState().doc.layers[0].pixels;
    const xs = [...px.keys()].filter((i) => px[i]).map((i) => i % 48);
    // The body reaches back up-left, 2 pixels across per step: 12 pixels left of the round end.
    expect(Math.min(...xs)).toBe(26 - 12);
    expect(Math.max(...xs)).toBe(33);
    // Upright again: the same drag is a standing cylinder, nothing left of the drag.
    e.setOption('cylinderAxis', 'up');
    const up = e.getState().doc.layers[0].pixels;
    expect(Math.min(...[...up.keys()].filter((i) => up[i]).map((i) => i % 48))).toBeGreaterThanOrEqual(26);
  });
});

describe('floor tiles, edge by edge', () => {
  it('draws the outline only along the edges asked for', () => {
    const e = new Editor();
    e.newFile(32, 32);
    e.setIsoGrid(16);
    e.setColor('primary', pack(255, 0, 0));
    e.setTool('rect');
    e.setOption('plane', 'ground');
    e.setOption('filled', false);
    const tile = () => {
      e.beginStroke({ x: 16, y: 4 }, false, { shift: false });
      e.moveStroke({ x: 16, y: 12 }, { shift: false });
      e.endStroke();
      return [...e.getState().doc.layers[0].pixels.keys()].filter(
        (i) => e.getState().doc.layers[0].pixels[i],
      );
    };
    const all = tile();
    e.undo();
    e.setOption('tileEdges', { nw: true, ne: true, sw: false, se: false });
    const upper = tile();
    // Only the two upper edges: nothing below the middle row, and fewer pixels than all four.
    const ys = (cells: number[]) => cells.map((i) => Math.floor(i / 32));
    expect(upper.length).toBeLessThan(all.length);
    expect(Math.max(...ys(upper))).toBeLessThan(Math.max(...ys(all)));
    expect(Math.min(...ys(upper))).toBe(Math.min(...ys(all)));
  });
});
