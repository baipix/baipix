import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';

const RED = pack(255, 0, 0);

/** A file with layers named after the row their only pixel is on, bottom to top. */
function scene(rows: (number | null)[]) {
  const e = new Editor();
  e.newFile(16, 16);
  rows.forEach((row, k) => {
    if (k) e.addLayer();
    const layer = e.getState().doc.layers[e.getState().doc.activeLayer];
    layer.name = row === null ? 'empty' : `row ${row}`;
    if (row !== null) layer.pixels[row * 16 + 3] = RED;
  });
  return e;
}
const names = (e: Editor) => e.getState().doc.layers.map((l) => l.name);

describe('sort layers by depth', () => {
  it('puts the lowest drawing in front, and leaves empty layers where they are', () => {
    const e = scene([12, 3, null, 8]);
    expect(e.sortByDepth()).toBe(3);
    expect(names(e)).toEqual(['row 3', 'row 8', 'empty', 'row 12']);
    // Already sorted: nothing to do.
    expect(e.sortByDepth()).toBe(0);
    e.undo();
    expect(names(e)).toEqual(['row 12', 'row 3', 'empty', 'row 8']);
  });

  it('keeps the active layer active', () => {
    const e = scene([12, 3]);
    e.selectLayer(0, 'single');
    e.sortByDepth();
    expect(e.getState().doc.layers[e.getState().doc.activeLayer].name).toBe('row 12');
  });
});
