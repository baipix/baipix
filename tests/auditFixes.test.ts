import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

const painted = (e: Editor) =>
  e
    .getState()
    .doc.layers.flatMap((l) => [...l.pixels])
    .filter((c) => c).length;
const draw = (e: Editor, pts: [number, number][]) => {
  e.beginStroke({ x: pts[0][0], y: pts[0][1] }, false, { shift: false });
  for (const [x, y] of pts.slice(1)) e.moveStroke({ x, y }, { shift: false });
  e.endStroke();
};

describe('flatten image', () => {
  it('keeps the drawing when the bottom layer is an instance', () => {
    const e = new Editor();
    e.newFile(8, 8, 'F');
    e.setColor('primary', RED);
    e.setTool('pencil');
    draw(e, [[0, 0]]);
    e.createComponent();
    const master = e.getState().doc.layers[0].id;
    // On another board: an instance as the bottom layer, a plain layer with its own pixel above.
    e.addBoard(16, 0, 8, 8, 'B');
    const board = e.getState().boards.find((b) => b.name === 'B')!;
    e.switchBoard(board.id);
    e.addInstanceAt(master, { x: 4, y: 4 });
    e.setActiveLayer(0);
    e.deleteLayer();
    expect(e.getState().doc.layers[0].instance).toBeTruthy();
    e.addLayer();
    e.setColor('primary', BLUE);
    draw(e, [[7, 7]]);
    e.flattenImage();
    const [only] = e.getState().doc.layers;
    expect(e.getState().doc.layers).toHaveLength(1);
    expect(only.instance).toBeUndefined();
    expect(only.pixels[7 * 8 + 7]).toBe(BLUE);
  });
});

describe('no empty undo steps', () => {
  it('a click with the Move tool, without a drag, leaves no step', () => {
    const e = new Editor();
    e.newFile(8, 8, 'M');
    e.setColor('primary', RED);
    e.setTool('pencil');
    draw(e, [[1, 1]]);
    e.setTool('move');
    e.beginStroke({ x: 1, y: 1 }, false, { shift: false });
    e.endStroke();
    e.undo();
    expect(painted(e)).toBe(0);
  });

  it('nudging while a handle is held does nothing', () => {
    const e = new Editor();
    e.newFile(8, 8, 'S');
    e.setColor('primary', RED);
    e.setTool('pencil');
    draw(e, [
      [2, 2],
      [4, 2],
    ]);
    e.setTool('move');
    expect(e.beginScale()).toBeTruthy();
    e.nudge(1, 0);
    e.endScale();
    const px = e.getState().doc.layers[0].pixels;
    expect(px[2 * 8 + 2]).toBe(RED);
    expect(px[2 * 8 + 5]).toBe(0);
  });
});

describe('merge down and cut', () => {
  it('merging a hidden layer down keeps what it holds', () => {
    const e = new Editor();
    e.newFile(8, 8, 'H');
    e.addLayer();
    e.setColor('primary', RED);
    e.setTool('pencil');
    draw(e, [[3, 3]]);
    e.setLayerVisible(1, false);
    e.mergeDown();
    expect(e.getState().doc.layers).toHaveLength(1);
    expect(e.getState().doc.layers[0].pixels[3 * 8 + 3]).toBe(RED);
  });

  it('cutting a whole layer leaves no selection behind', () => {
    const e = new Editor();
    e.newFile(8, 8, 'C');
    e.setColor('primary', RED);
    e.setTool('pencil');
    draw(e, [[3, 3]]);
    expect(e.cut()).toBe(true);
    expect(painted(e)).toBe(0);
    expect(e.getState().selection).toBeNull();
    e.paste();
    expect(painted(e)).toBe(1);
  });
});
