import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { clampGrid, gridOffsets } from '../src/engine/repeat';

const RED = pack(255, 0, 0);

/** A 16×8 file with a 2×1 red sprite at (1, 1). */
function setup() {
  const e = new Editor();
  e.newFile(16, 8);
  const px = e.getState().doc.layers[0].pixels;
  px[16 + 1] = RED;
  px[16 + 2] = RED;
  const at = (layer: number, x: number, y: number) => e.getState().doc.layers[layer].pixels[y * 16 + x];
  return { e, at };
}

describe('repeat grid', () => {
  it('places copies a sprite and a gap apart, and keeps grids sensible', () => {
    expect(gridOffsets({ cols: 3, rows: 2, gapX: 1, gapY: 0 }, 2, 1)).toEqual([
      { dx: 3, dy: 0 },
      { dx: 6, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 3, dy: 1 },
      { dx: 6, dy: 1 },
    ]);
    expect(clampGrid({ cols: 0, rows: 999, gapX: -10, gapY: 2.4 }, 2, 1)).toEqual({
      cols: 1,
      rows: 64,
      gapX: -1,
      gapY: 2,
    });
  });

  it('repeats what is drawn on the layer, live, in one undo step', () => {
    const { e, at } = setup();
    expect(e.beginRepeat()).toBe(true);
    e.setRepeat({ cols: 3, rows: 1, gapX: 1, gapY: 0 });
    expect([at(0, 4, 1), at(0, 5, 1), at(0, 7, 1), at(0, 8, 1), at(0, 3, 1)]).toEqual([
      RED,
      RED,
      RED,
      RED,
      0,
    ]);
    // Changed live: the copies follow, nothing left behind.
    e.setRepeat({ cols: 2, rows: 2, gapX: 0, gapY: 1 });
    expect([at(0, 7, 1), at(0, 3, 1), at(0, 1, 3)]).toEqual([0, RED, RED]);
    expect(e.getState().repeat).toEqual({ cols: 2, rows: 2, gapX: 0, gapY: 1 });
    e.endRepeat(true);
    expect(e.getState().repeat).toBeNull();
    e.undo();
    expect([at(0, 3, 1), at(0, 1, 3), at(0, 1, 1)]).toEqual([0, 0, RED]);
  });

  it('puts everything back when dropped', () => {
    const { e, at } = setup();
    e.beginRepeat();
    e.endRepeat(false);
    expect(at(0, 4, 1)).toBe(0);
    expect(e.getState().canUndo).toBe(false);
  });

  it('repeats an instance as instances, selected together', () => {
    const { e, at } = setup();
    e.createComponent();
    e.addInstanceAt(e.getState().doc.layers[0].id, { x: 2, y: 5 });
    e.beginRepeat();
    e.setRepeat({ cols: 3, rows: 1, gapX: 2, gapY: 0 });
    e.endRepeat(true);
    const { doc, selectedLayers } = e.getState();
    expect(doc.layers).toHaveLength(4);
    expect(doc.layers.slice(1).map((l) => l.instance?.x)).toEqual([1, 5, 9]);
    expect(selectedLayers).toHaveLength(3);
    expect(at(3, 9, 5)).toBe(RED);
    // One undo takes the copies away.
    e.undo();
    expect(e.getState().doc.layers).toHaveLength(2);
  });
});
