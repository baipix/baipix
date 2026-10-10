import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { colorMask, combine, fromCanvasMask, inSelection, polygonMask } from '../src/engine/selection';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);
const W = 8;
const count = (m: Uint8Array) => m.reduce((n, v) => n + v, 0);

describe('selection shapes', () => {
  it('lasso: the pixels inside the path, the path included', () => {
    const square = polygonMask(
      [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 4 },
        { x: 1, y: 4 },
      ],
      W,
      W,
    );
    expect(count(square)).toBe(16);
    const triangle = polygonMask(
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 0, y: 6 },
      ],
      W,
      W,
    );
    expect(triangle[0]).toBe(1);
    expect(triangle[6 * W + 6]).toBe(0);
  });

  it('magic wand: the area of a color, or that color everywhere', () => {
    const p = new Uint32Array(W * W);
    p[0] = RED;
    p[1] = RED;
    p[5] = RED; // not touching
    expect(count(colorMask(p, W, W, 0, 0, true))).toBe(2);
    expect(count(colorMask(p, W, W, 0, 0, false))).toBe(3);
  });

  it('adds and takes away, and keeps a plain rectangle mask-free', () => {
    const a = new Uint8Array(W * W);
    a.fill(1, 0, 4); // (0..3, 0)
    const b = new Uint8Array(W * W);
    b.fill(1, 2, 6); // (2..5, 0)
    const sel = combine(fromCanvasMask(a, W, W), b, 'add', W, W)!;
    expect(sel).toEqual({ x: 0, y: 0, w: 6, h: 1 });
    const cut = combine(sel, b, 'subtract', W, W)!;
    expect(cut).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    const holed = combine(
      sel,
      Uint8Array.from({ length: W * W }, (_, i) => (i === 3 ? 1 : 0)),
      'subtract',
      W,
      W,
    )!;
    expect(holed.mask).toBeDefined();
    expect(inSelection(holed, 3, 0)).toBe(false);
    expect(inSelection(holed, 4, 0)).toBe(true);
  });
});

describe('shaped selections in the editor', () => {
  /** A red pixel at (1, 1) and (5, 1), blue at (3, 1): a wand on red, not contiguous, takes both reds. */
  const setup = () => {
    const e = new Editor();
    e.newFile(W, W);
    const p = e.getState().doc.layers[0].pixels;
    p[W + 1] = RED;
    p[W + 5] = RED;
    p[W + 3] = BLUE;
    e.setTool('wand');
    e.setOption('wandContiguous', false);
    const click = (x: number, y: number, mods: { shift?: boolean; duplicate?: boolean } = {}) => {
      e.beginStroke({ x, y }, false, { shift: !!mods.shift, ...mods });
      e.endStroke();
    };
    const px = (x: number, y: number) => e.getState().doc.layers[0].pixels[y * W + x];
    return { e, click, px };
  };

  it('fills and clears only the selected pixels', () => {
    const { e, click, px } = setup();
    click(1, 1);
    const sel = e.getState().selection!;
    expect(sel).toMatchObject({ x: 1, y: 1, w: 5, h: 1 });
    e.setColor('primary', BLUE);
    e.fill();
    expect([px(1, 1), px(3, 1), px(5, 1), px(2, 1)]).toEqual([BLUE, BLUE, BLUE, 0]);
    e.undo();
    e.clearSelection();
    expect([px(1, 1), px(3, 1), px(5, 1)]).toEqual([0, BLUE, 0]);
  });

  it('adds with Shift, takes away with Alt, and inverts', () => {
    const { e, click } = setup();
    click(1, 1);
    click(3, 1, { shift: true });
    expect(inSelection(e.getState().selection, 3, 1)).toBe(true);
    click(1, 1, { duplicate: true });
    expect(e.getState().selection).toEqual({ x: 3, y: 1, w: 1, h: 1 });
    e.invertSelection();
    expect(inSelection(e.getState().selection, 3, 1)).toBe(false);
    expect(inSelection(e.getState().selection, 0, 0)).toBe(true);
  });

  it('moves, copies and flips only the selected pixels, the shape following', () => {
    const { e, click, px } = setup();
    click(1, 1);
    e.nudge(0, 2);
    expect([px(1, 3), px(5, 3), px(3, 3), px(3, 1)]).toEqual([RED, RED, 0, BLUE]);
    expect(e.getState().selection!.mask).toBeDefined();
    expect(inSelection(e.getState().selection, 3, 3)).toBe(false);
    e.copy();
    e.deselect();
    e.paste();
    const pasted = e.getState().doc.layers[1].pixels;
    expect(pasted.filter((c) => c === BLUE)).toHaveLength(0);
    expect(pasted.filter((c) => c === RED)).toHaveLength(2);
  });

  it('keeps the pencil inside the shape', () => {
    const { e, click, px } = setup();
    click(1, 1);
    e.setTool('pencil');
    e.setColor('primary', BLUE);
    e.beginStroke({ x: 2, y: 1 }, false, { shift: false });
    e.moveStroke({ x: 5, y: 1 }, { shift: false });
    e.endStroke();
    expect([px(2, 1), px(4, 1), px(5, 1)]).toEqual([0, 0, BLUE]);
  });

  it('lasso selects by drawing around', () => {
    const e = new Editor();
    e.newFile(W, W);
    e.setTool('lassoSelect');
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    for (const [x, y] of [
      [6, 0],
      [0, 6],
    ])
      e.moveStroke({ x, y }, { shift: false });
    e.endStroke();
    const sel = e.getState().selection!;
    expect(sel).toMatchObject({ x: 0, y: 0, w: 7, h: 7 });
    expect(inSelection(sel, 1, 1)).toBe(true);
    expect(inSelection(sel, 6, 6)).toBe(false);
  });
});
