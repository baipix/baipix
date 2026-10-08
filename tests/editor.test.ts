import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { DEFAULT_TILE_OPACITY, Editor } from '../src/engine/editor';
import { documentFromJson, documentToJson } from '../src/storage/fileFormat';

const RED = pack(255, 0, 0);
const drag = (e: Editor, pts: [number, number][], secondary = false) => {
  e.beginStroke({ x: pts[0][0], y: pts[0][1] }, secondary, { shift: false });
  for (const [x, y] of pts.slice(1)) e.moveStroke({ x, y }, { shift: false });
  e.endStroke();
};
const layer = (e: Editor) => e.getState().doc.layers[e.getState().doc.activeLayer].pixels;
const painted = (e: Editor) => [...layer(e)].filter(Boolean).length;

describe('Editor', () => {
  it('draws with the pencil and undoes/redoes', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [
      [0, 0],
      [3, 0],
    ]);
    expect(painted(e)).toBe(4);
    e.undo();
    expect(painted(e)).toBe(0);
    e.redo();
    expect(painted(e)).toBe(4);
  });

  it('removes doubled corners in pixel-perfect mode', () => {
    const e = new Editor();
    drag(e, [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
    expect(painted(e)).toBe(3);
    e.setOption('pixelPerfect', false);
    drag(e, [
      [5, 0],
      [6, 0],
      [6, 1],
    ]);
    expect(painted(e)).toBe(6);
  });

  it('draws symmetrically', () => {
    const e = new Editor();
    e.setView('mirrorX', true);
    drag(e, [[0, 0]]);
    const px = layer(e);
    expect(px[0]).not.toBe(0);
    expect(px[31]).not.toBe(0);
  });

  it('fills a closed area with the bucket', () => {
    const e = new Editor();
    e.setTool('rect');
    drag(e, [
      [0, 0],
      [4, 4],
    ]);
    e.setTool('bucket');
    e.setColor('primary', RED);
    drag(e, [[2, 2]]);
    expect(layer(e)[2 * 32 + 2]).toBe(RED);
    expect(layer(e)[10 * 32 + 10]).toBe(0);
  });

  it('keeps no undo step for a stroke that changes nothing', () => {
    const e = new Editor();
    e.setTool('eraser');
    drag(e, [[3, 3]]);
    expect(e.getState().canUndo).toBe(false);
  });

  it('refuses to draw on a hidden layer', () => {
    const e = new Editor();
    const notices: string[] = [];
    e.onNotice((n) => notices.push(n.type));
    e.setLayerVisible(0, false);
    expect(e.beginStroke({ x: 1, y: 1 }, false, { shift: false })).toBe(false);
    expect(notices).toContain('layerHidden');
  });

  it('moves the layer under the pointer with the Move tool', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [[1, 1]]); // layer 1
    e.addLayer();
    drag(e, [[5, 5]]); // layer 2, now active
    const move = (from: [number, number], to: [number, number], keepLayer = false) => {
      e.beginStroke({ x: from[0], y: from[1] }, false, { shift: false, keepLayer });
      e.moveStroke({ x: to[0], y: to[1] }, { shift: false });
      e.endStroke();
    };
    e.setTool('move');
    move([1, 1], [2, 1]);
    expect(e.getState().doc.activeLayer).toBe(0);
    expect(layer(e)[1 * 32 + 2]).toBe(RED);
    // Beside every layer: nothing moves, the frame goes away, the layer stays active.
    move([10, 10], [10, 11]);
    expect(e.getState().layerFramed).toBe(false);
    expect(e.getState().doc.activeLayer).toBe(0);
    expect(layer(e)[1 * 32 + 2]).toBe(RED);
    // Escape does the same, and leaves a multiple selection for the active layer alone.
    move([5, 5], [5, 5]);
    expect(e.getState().layerFramed).toBe(true);
    e.selectLayer(0, 'toggle');
    expect(e.getState().selectedLayers).toHaveLength(2);
    expect(e.deselectLayers()).toBe(true);
    expect(e.getState().layerFramed).toBe(false);
    expect(e.getState().selectedLayers).toEqual([e.getState().doc.layers[0].id]);
    expect(e.deselectLayers()).toBe(false);
    e.setActiveLayer(0);
    // Cmd/Ctrl: the active layer moves (and is framed again), even over another layer's pixel.
    move([5, 5], [5, 6], true);
    expect(e.getState().layerFramed).toBe(true);
    expect(e.getState().doc.activeLayer).toBe(0);
    expect(layer(e)[2 * 32 + 2]).toBe(RED);
    expect(e.getState().doc.layers[1].pixels[5 * 32 + 5]).toBe(RED);
    // A hole inside the active layer's frame still moves it.
    e.setTool('pencil');
    drag(e, [[7, 7]]);
    e.setTool('move');
    move([4, 4], [4, 5]);
    expect(layer(e)[3 * 32 + 2]).toBe(RED);
    // Locked layers are skipped.
    e.setActiveLayer(1);
    e.setLayerLocked(1, true);
    expect(e.layerAt({ x: 5, y: 5 })).toBe(-1);
  });

  it('leaves the reference image out of undo', () => {
    const e = new Editor();
    const ref = { src: 'data:image/png;base64,', width: 2, height: 1, x: 0, y: 0, w: 32, h: 16 };
    e.setReference({ ...ref, opacity: 0.5, visible: true });
    drag(e, [[1, 1]]);
    e.updateReference({ x: 4, opacity: 2 });
    expect(e.getState().doc.reference?.opacity).toBe(1);
    e.undo();
    expect(painted(e)).toBe(0);
    expect(e.getState().doc.reference?.x).toBe(4);
    e.resize(34, 32);
    expect(e.getState().doc.reference?.x).toBe(5);
    e.setReference(null);
    expect(e.getState().doc.reference).toBeUndefined();
  });

  it('selects the reference like a layer', () => {
    const e = new Editor();
    const ref = { src: 'data:image/png;base64,', width: 1, height: 1, x: 0, y: 0, w: 8, h: 8 };
    e.setReference({ ...ref, opacity: 1, visible: true });
    // A new reference is selected, with the Move tool, to place it.
    expect(e.getState().referenceSelected).toBe(true);
    expect(e.getState().tool).toBe('move');
    e.nudge(2, 1);
    expect(e.getState().doc.reference).toMatchObject({ x: 2, y: 1 });
    e.setActiveLayer(0);
    expect(e.getState().referenceSelected).toBe(false);
    e.selectReference();
    e.setTool('pencil');
    e.setColor('primary', RED);
    drag(e, [[1, 1]]);
    // Drawing goes back to the active layer.
    expect(e.getState().referenceSelected).toBe(false);
    expect(painted(e)).toBe(1);
  });

  it('keeps the pixels a layer move pushes off the canvas', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [[30, 5]]);
    e.setTool('move');
    const move = (dx: number) => {
      e.beginStroke({ x: 30, y: 5 }, false, { shift: false, keepLayer: true });
      e.moveStroke({ x: 30 + dx, y: 5 }, { shift: false });
      e.endStroke();
    };
    move(5); // off the right edge
    expect(painted(e)).toBe(0);
    move(-5); // and back
    expect(layer(e)[5 * 32 + 30]).toBe(RED);
    // A smaller canvas keeps what it cuts off, a bigger one brings it back.
    e.resize(16, 32);
    expect(painted(e)).toBe(0);
    e.resize(32, 32);
    expect(layer(e)[5 * 32 + 30]).toBe(RED);
    // Flipping the layer flips what's outside too: x 35 becomes -4, then 1 once moved back in.
    move(5);
    e.flip(true);
    move(5);
    expect(layer(e)[5 * 32 + 1]).toBe(RED);
  });

  it('remembers the tile opacity, and gives older saves the default', () => {
    const e = new Editor();
    e.setView('tileOpacity', 1);
    const saved = e.getPreferences();
    const f = new Editor();
    f.setPreferences(saved);
    expect(f.getState().view.tileOpacity).toBe(1);
    const older = new Editor();
    older.setPreferences({ view: { grid: true, tile: true, mirrorX: false, mirrorY: false } as never });
    expect(older.getState().view.tileOpacity).toBe(DEFAULT_TILE_OPACITY);
  });

  it('sprays random pixels inside its circle', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    e.setTool('spray');
    e.setOption('spraySize', 8);
    e.setOption('sprayDensity', 100);
    e.beginStroke({ x: 16, y: 16 }, false, { shift: false });
    for (let k = 0; k < 20; k++) e.moveStroke({ x: 16, y: 16 }, { shift: false }); // holding still
    e.endStroke();
    const px = layer(e);
    let n = 0;
    for (let i = 0; i < px.length; i++) {
      if (!px[i]) continue;
      n++;
      const x = i % 32;
      const y = Math.floor(i / 32);
      expect(Math.hypot(x - 16, y - 16)).toBeLessThanOrEqual(4.5);
    }
    expect(n).toBeGreaterThan(5);
    e.undo();
    expect(painted(e)).toBe(0);
  });

  it('jumbles the pixels under the brush without adding colors', () => {
    const e = new Editor();
    const BLUE = pack(0, 0, 255);
    e.setTool('pencil');
    e.setOption('size', 8);
    e.setColor('primary', RED);
    drag(e, [[12, 12]]);
    e.setColor('primary', BLUE);
    drag(e, [[18, 12]]);
    const original = [...layer(e)];
    e.setTool('jumble');
    e.setOption('jumbleSize', 12);
    e.beginStroke({ x: 15, y: 12 }, false, { shift: false });
    for (let k = 0; k < 30; k++) e.moveStroke({ x: 15, y: 12 }, { shift: false });
    e.endStroke();
    // Same colors in the same amounts, some of them in other places.
    expect([...layer(e)].sort()).toEqual([...original].sort());
    expect([...layer(e)].filter((c, i) => c !== original[i]).length).toBeGreaterThan(0);
  });

  it('blends semi-transparent colors with the option', () => {
    const e = new Editor();
    const HALF_BLUE = pack(0, 0, 255, 128);
    e.setColor('primary', RED);
    drag(e, [[1, 1]]);
    e.setColor('primary', HALF_BLUE);
    drag(e, [[1, 1]]);
    expect(layer(e)[32 + 1]).toBe(HALF_BLUE); // replaced
    e.undo();
    e.setOption('blend', true);
    // Twice over the same pixel in one stroke: it mixes once, from the pixel before the stroke.
    drag(e, [
      [1, 1],
      [2, 1],
      [1, 1],
    ]);
    const mixed = layer(e)[32 + 1];
    expect(mixed >>> 24).toBe(255);
    expect(mixed & 0xff).toBeGreaterThan(100); // still part red
    expect((mixed >> 16) & 0xff).toBeGreaterThan(100); // and part blue
  });

  it('stabilizes freehand strokes on a string', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    e.setOption('stabilizer', 4);
    // Wobbles shorter than the string never reach the drawing: only the starting pixel is painted.
    drag(e, [
      [10, 10],
      [12, 11],
      [9, 12],
      [11, 9],
    ]);
    expect(painted(e)).toBe(1);
    e.undo();
    // A long stroke stops one string length behind the pointer.
    drag(e, [
      [2, 20],
      [20, 20],
    ]);
    expect(layer(e)[20 * 32 + 16]).toBe(RED);
    expect(layer(e)[20 * 32 + 17]).toBe(0);
    // Off, the stroke goes all the way.
    e.undo();
    e.setOption('stabilizer', 0);
    drag(e, [
      [2, 20],
      [20, 20],
    ]);
    expect(layer(e)[20 * 32 + 20]).toBe(RED);
  });

  it('fills the shape a stroke draws with lasso fill', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    const square: [number, number][] = [
      [4, 4],
      [12, 4],
      [12, 12],
      [4, 12],
      [4, 5],
    ];
    drag(e, square);
    const outline = painted(e);
    expect(layer(e)[8 * 32 + 8]).toBe(0);
    e.undo();
    e.setOption('lassoFill', true);
    drag(e, square);
    expect(layer(e)[8 * 32 + 8]).toBe(RED);
    expect(painted(e)).toBe(81); // the 9×9 square, outline included
    expect(painted(e)).toBeGreaterThan(outline);
    expect(layer(e)[2 * 32 + 2]).toBe(0);
    // One undo step for the stroke and its fill.
    e.undo();
    expect(painted(e)).toBe(0);
  });

  it('has a Lasso fill tool that always fills', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    e.setTool('lassoFill');
    drag(e, [
      [4, 4],
      [12, 4],
      [12, 12],
      [4, 12],
      [4, 5],
    ]);
    expect(e.getState().options.lassoFill).toBe(false);
    expect(painted(e)).toBe(81);
  });

  it('resizes the active layer or the selection by its handles', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [
      [2, 2],
      [3, 2],
    ]); // a 2×1 line
    const from = e.beginScale();
    expect(from).toEqual({ x: 2, y: 2, w: 2, h: 1 });
    e.previewScale({ x: 2, y: 2, w: 4, h: 2 }); // ×2
    e.endScale();
    expect(painted(e)).toBe(8);
    expect(layer(e)[3 * 32 + 5]).toBe(RED);
    // Past the canvas edge, the pixels are kept, like a move.
    e.beginScale();
    e.previewScale({ x: 2, y: 2, w: 40, h: 2 });
    e.endScale();
    e.beginScale();
    e.previewScale({ x: 2, y: 2, w: 4, h: 2 });
    e.endScale();
    expect(painted(e)).toBe(8);
    // Each resize is one undo step.
    e.undo();
    e.undo();
    e.undo();
    expect(painted(e)).toBe(2);
    // With a selection, only its content is resized.
    e.setTool('select');
    drag(e, [
      [2, 2],
      [2, 3],
    ]); // the red pixel at (2, 2) and the empty one under it
    expect(e.beginScale()).toEqual({ x: 2, y: 2, w: 1, h: 2 });
    e.previewScale({ x: 2, y: 2, w: 3, h: 3 });
    e.endScale();
    expect(layer(e)[2 * 32 + 4]).toBe(RED); // the red pixel, 3 wide now
    expect(layer(e)[4 * 32 + 2]).toBe(0); // the empty one, at the bottom
    expect(layer(e)[2 * 32 + 5]).toBe(0);
    expect(e.getState().selection).toEqual({ x: 2, y: 2, w: 3, h: 3 });
    // Cancelling gives everything back, without an undo step.
    e.beginScale();
    e.previewScale({ x: 0, y: 0, w: 9, h: 9 });
    e.cancelScale();
    expect(layer(e)[2 * 32 + 4]).toBe(RED);
    expect(layer(e)[0]).toBe(0);
    expect(e.getState().selection).toEqual({ x: 2, y: 2, w: 3, h: 3 });
  });

  it('liquifies: pushes, expands and shrinks without new colors', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    e.setTool('pencil');
    e.setOption('size', 4);
    drag(e, [[16, 16]]); // a 4×4 block, 14..17
    const count = () => painted(e);
    const onlyRed = () => [...layer(e)].every((c) => c === 0 || c === RED);
    e.setTool('liquify');
    e.setOption('liquifySize', 16);
    e.setOption('liquifyStrength', 100);
    // Push to the right: the block's content moves right.
    drag(e, [
      [15, 16],
      [22, 16],
    ]);
    expect(layer(e)[16 * 32 + 19]).toBe(RED);
    expect(onlyRed()).toBe(true);
    e.undo();
    expect(count()).toBe(16);
    // Expand makes it bigger, Shrink smaller, holding still at its center.
    const hold = (mode: 'expand' | 'shrink') => {
      e.setOption('liquifyMode', mode);
      e.beginStroke({ x: 15, y: 15 }, false, { shift: false });
      for (let k = 0; k < 6; k++) e.moveStroke({ x: 15, y: 15 }, { shift: false });
      e.endStroke();
    };
    hold('expand');
    expect(count()).toBeGreaterThan(16);
    expect(onlyRed()).toBe(true);
    e.undo();
    hold('shrink');
    expect(count()).toBeLessThan(16);
    expect(onlyRed()).toBe(true);
  });

  it('wraps strokes around the edges in tile preview', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    const stroke = () =>
      drag(e, [
        [29, 5],
        [34, 5],
      ]);
    stroke();
    expect(painted(e)).toBe(3); // 29, 30, 31: stops at the edge
    e.undo();
    e.setView('tile', true);
    stroke();
    // Past the right edge it goes on from the left: 29, 30, 31, then 0, 1, 2.
    expect(painted(e)).toBe(6);
    expect(layer(e)[5 * 32 + 2]).toBe(RED);
    expect(layer(e)[5 * 32 + 3]).toBe(0);
  });

  it('paints with a custom brush made from a selection', () => {
    const e = new Editor();
    const BLUE = pack(0, 0, 255);
    e.setColor('primary', RED);
    drag(e, [[2, 2]]);
    e.setColor('primary', BLUE);
    drag(e, [[3, 2]]); // a red-blue pair at (2, 2)
    e.setTool('select');
    drag(e, [
      [0, 0],
      [6, 6],
    ]);
    expect(e.brushFromSelection()).toBe(true);
    // Trimmed to what's drawn: 2×1. The Pencil now paints with it.
    expect(e.getState().brushes[0]).toMatchObject({ width: 2, height: 1 });
    expect(e.getState().tool).toBe('pencil');
    e.deselect();
    drag(e, [[20, 20]]);
    expect(layer(e)[20 * 32 + 20]).toBe(RED);
    expect(layer(e)[20 * 32 + 21]).toBe(BLUE);
    // As a stencil, in the current color.
    e.setOption('brushOwnColors', false);
    e.setColor('primary', pack(0, 255, 0));
    drag(e, [[20, 25]]);
    expect(layer(e)[25 * 32 + 21]).toBe(pack(0, 255, 0));
    // Saved with the preferences.
    const f = new Editor();
    f.setPreferences(e.getPreferences());
    expect(f.getState().brushes).toHaveLength(1);
    // Deleting it goes back to the normal tip.
    e.deleteBrush(e.getState().brushes[0].id);
    expect(e.getState().options.customBrush).toBeNull();
  });

  it('moves a selection', () => {
    const e = new Editor();
    drag(e, [[0, 0]]);
    e.setTool('select');
    drag(e, [
      [0, 0],
      [1, 1],
    ]);
    e.nudge(2, 0);
    expect(layer(e)[0]).toBe(0);
    expect(layer(e)[2]).not.toBe(0);
    expect(e.getState().selection).toEqual({ x: 2, y: 0, w: 2, h: 2 });
  });

  it('dates each file by its last change', () => {
    const e = new Editor();
    const first = e.getState().activeId;
    const old = { ...e.getDocuments()[0], id: 'old', updatedAt: 1000 };
    e.loadDocuments([e.getDocuments()[0], old], first);
    expect(e.getState().files[1].updatedAt).toBe(1000);
    e.switchFile('old');
    expect(e.getState().files[1].updatedAt).toBe(1000);
    e.setColor('primary', RED);
    drag(e, [[1, 1]]);
    expect(e.getState().files[1].updatedAt).toBeGreaterThan(1000);
  });

  it('keeps separate histories per file', () => {
    const e = new Editor();
    drag(e, [[0, 0]]);
    const first = e.getState().activeId;
    e.newFile(16, 16);
    expect(e.getState().canUndo).toBe(false);
    e.switchFile(first);
    expect(e.getState().canUndo).toBe(true);
  });

  it('merges layers down', () => {
    const e = new Editor();
    drag(e, [[0, 0]]);
    e.addLayer();
    drag(e, [[1, 0]]);
    e.mergeDown();
    expect(e.getState().doc.layers).toHaveLength(1);
    expect(painted(e)).toBe(2);
  });

  it('rotates the selection by 90° clockwise, and back after four turns', () => {
    const e = new Editor();
    const px = layer(e);
    const W = e.getState().doc.width;
    // A 3×1 bar with a marked left end, selected.
    px[4 * W + 4] = RED;
    px[4 * W + 5] = 1;
    px[4 * W + 6] = 1;
    e.setTool('select');
    drag(e, [
      [4, 4],
      [6, 4],
    ]);
    const before = [...layer(e)];
    e.rotate();
    // The bar becomes vertical around the same center, the left end on top.
    expect(e.getState().selection).toEqual({ x: 5, y: 3, w: 1, h: 3 });
    const after = layer(e);
    expect(after[3 * W + 5]).toBe(RED);
    expect(after[4 * W + 5]).toBe(1);
    expect(after[5 * W + 5]).toBe(1);
    expect(after[4 * W + 4]).toBe(0);
    for (let i = 0; i < 3; i++) e.rotate();
    expect([...layer(e)]).toEqual(before);
    e.undo();
    expect(layer(e)[4 * W + 4]).toBe(0);
  });

  it('draws the new shapes, outlined and filled', () => {
    for (const tool of ['roundRect', 'triangle', 'star'] as const) {
      const e = new Editor();
      e.setTool(tool);
      drag(e, [
        [2, 2],
        [14, 14],
      ]);
      const outline = painted(e);
      expect(outline).toBeGreaterThan(10);
      e.undo();
      e.setOption('filled', true);
      drag(e, [
        [2, 2],
        [14, 14],
      ]);
      expect(painted(e)).toBeGreaterThan(outline);
    }
  });

  it('shades darker and lightens lighter with palette colors', () => {
    const GREEN = pack(0x38, 0xb7, 0x64);
    const brightness = (c: number) => (c & 0xff) + ((c >> 8) & 0xff) + ((c >> 16) & 0xff);
    for (const [tool, darker] of [
      ['shade', true],
      ['lighten', false],
    ] as const) {
      const e = new Editor();
      e.setColor('primary', GREEN);
      drag(e, [[5, 5]]);
      const before = layer(e)[5 * 32 + 5];
      e.setTool(tool);
      drag(e, [[5, 5]]);
      const after = layer(e)[5 * 32 + 5];
      expect(after).not.toBe(before);
      expect(brightness(after) < brightness(before)).toBe(darker);
    }
  });

  it('adjusts colors with a live preview, then as one undo step', () => {
    const e = new Editor();
    const RED_HUE = { hue: 120, saturation: 100, brightness: 100 };
    e.setColor('primary', RED);
    drag(e, [
      [0, 0],
      [3, 0],
    ]);
    const before = [...layer(e)];
    e.beginAdjust(false);
    e.previewAdjust(RED_HUE);
    expect(layer(e)[0]).toBe(pack(0, 255, 0));
    e.cancelAdjust();
    expect([...layer(e)]).toEqual(before);

    // Limited to the selection, and one undo step.
    e.setTool('select');
    drag(e, [
      [0, 0],
      [1, 0],
    ]);
    e.beginAdjust(false);
    e.previewAdjust(RED_HUE);
    e.applyAdjust(RED_HUE, true);
    expect(layer(e)[1]).toBe(pack(0, 255, 0));
    expect(layer(e)[2]).toBe(RED);
    const adapted = e.getState().palette.colors;
    expect(adapted).not.toContain(pack(0x1a, 0x1c, 0x2c));
    // Undo puts back the pixels and the palette together, redo both again.
    e.undo();
    expect(layer(e)[1]).toBe(RED);
    expect(e.getState().palette.colors).toContain(pack(0x1a, 0x1c, 0x2c));
    e.redo();
    expect(e.getState().palette.colors).toEqual(adapted);
  });

  it('previews the adjustment on the palette, and cancelling gives it back', () => {
    const e = new Editor();
    const before = e.getState().palette.colors;
    e.beginAdjust(true);
    e.previewAdjust({ hue: 90, saturation: 100, brightness: 100 }, true);
    expect(e.getState().palette.colors).not.toEqual(before);
    e.previewAdjust({ hue: 90, saturation: 100, brightness: 100 }, false);
    expect(e.getState().palette.colors).toEqual(before);
    e.previewAdjust({ hue: 90, saturation: 100, brightness: 100 }, true);
    e.cancelAdjust();
    expect(e.getState().palette.colors).toEqual(before);
  });

  it('reorders layers to any position, as one undo step', () => {
    const e = new Editor();
    e.addLayer();
    e.addLayer();
    const names = () => e.getState().doc.layers.map((l) => l.name);
    const before = names();
    e.reorderLayer(0, 2);
    expect(names()).toEqual([before[1], before[2], before[0]]);
    expect(e.getState().doc.activeLayer).toBe(2);
    e.undo();
    expect(names()).toEqual(before);
  });

  it('brings a deleted layer back where it was', () => {
    const e = new Editor();
    e.addLayer();
    e.addLayer();
    e.setActiveLayer(1);
    const names = () => e.getState().doc.layers.map((l) => l.name);
    const before = names();
    expect(e.deleteLayer()).toBe(true);
    drag(e, [[0, 0]]);
    expect(e.restoreDeleted()).toBe(true);
    expect(names()).toEqual(before);
    expect(e.getState().doc.activeLayer).toBe(1);
    expect(e.restoreDeleted()).toBe(false);
  });

  it("doesn't restore a layer that undo already brought back", () => {
    const e = new Editor();
    e.addLayer();
    e.deleteLayer();
    e.undo();
    expect(e.restoreDeleted()).toBe(false);
    expect(e.getState().doc.layers).toHaveLength(2);
  });

  it("doesn't restore a layer after the canvas was resized", () => {
    const e = new Editor();
    e.addLayer();
    e.deleteLayer();
    e.resize(16, 16);
    expect(e.restoreDeleted()).toBe(false);
    expect(e.getState().doc.layers).toHaveLength(1);
  });

  it('brings a deleted file back with its history', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [[0, 0]]);
    const id = e.getState().activeId;
    e.newFile(16, 16);
    e.switchFile(id);
    expect(e.deleteFile(id)).toBe(true);
    expect(e.getState().files).toHaveLength(1);
    expect(e.restoreDeleted()).toBe(true);
    expect(e.getState().files.map((f) => f.id)[0]).toBe(id);
    expect(e.getState().activeId).toBe(id);
    expect(painted(e)).toBe(1);
    e.undo();
    expect(painted(e)).toBe(0);
  });

  it('leaves a blank file when the last one is deleted, and can bring it back', () => {
    const e = new Editor();
    const id = e.getState().activeId;
    expect(e.deleteFile(id)).toBe(true);
    expect(e.getState().files).toHaveLength(1);
    expect(e.getState().activeId).not.toBe(id);
    expect(e.restoreDeleted()).toBe(true);
    expect(e.getState().activeId).toBe(id);
    e.discardFile(e.getState().files.find((f) => f.id !== id)!.id);
    expect(e.getState().files.map((f) => f.id)).toEqual([id]);
  });

  it("doesn't paint on a locked layer", () => {
    const e = new Editor();
    const notices: string[] = [];
    e.onNotice((n) => notices.push(n.type));
    e.setColor('primary', RED);
    e.setLayerLocked(0, true);
    drag(e, [[0, 0]]);
    e.fill();
    e.flip(true);
    expect(painted(e)).toBe(0);
    expect(notices).toEqual(['layerLocked', 'layerLocked', 'layerLocked']);
    e.setLayerLocked(0, false);
    drag(e, [[0, 0]]);
    expect(painted(e)).toBe(1);
  });

  it("doesn't merge into a locked layer or adjust it", () => {
    const e = new Editor();
    e.setLayerLocked(0, true);
    e.addLayer();
    e.mergeDown();
    expect(e.getState().doc.layers).toHaveLength(2);
    e.beginAdjust(false);
    expect(e.isAdjusting).toBe(true);
    e.cancelAdjust();
    e.setActiveLayer(0);
    e.beginAdjust(false);
    expect(e.isAdjusting).toBe(false);
  });

  it('solos a layer, then shows every layer again', () => {
    const e = new Editor();
    e.addLayer();
    e.addLayer();
    const visible = () => e.getState().doc.layers.map((l) => l.visible);
    e.setLayerVisible(0, false);
    e.soloLayer(1);
    expect(visible()).toEqual([false, true, false]);
    e.soloLayer(1);
    expect(visible()).toEqual([true, true, true]);
    e.undo();
    expect(visible()).toEqual([false, true, false]);
  });

  it('merges the visible layers into the lowest visible one', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [[0, 0]]);
    e.addLayer();
    drag(e, [[1, 0]]);
    e.addLayer();
    drag(e, [[2, 0]]);
    e.setLayerVisible(2, false);
    e.mergeVisible();
    const { layers, activeLayer } = e.getState().doc;
    expect(layers).toHaveLength(2);
    expect(activeLayer).toBe(0);
    expect([...layers[0].pixels.slice(0, 3)].map(Boolean)).toEqual([true, true, false]);
    e.undo();
    expect(e.getState().doc.layers).toHaveLength(3);
  });

  it('remembers the last colors painted with', () => {
    const e = new Editor();
    const colors = Array.from({ length: 10 }, (_, i) => pack(i * 20, 0, 0));
    for (const c of colors) {
      e.setColor('primary', c);
      drag(e, [[0, 0]]);
      e.undo();
    }
    e.setColor('primary', colors[5]);
    drag(e, [[1, 1]]);
    const recent = e.getState().recent;
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe(colors[5] >>> 0);
    expect(recent.filter((c) => c === colors[5] >>> 0)).toHaveLength(1);
    expect(e.getPreferences().recent).toEqual(recent);
  });

  it("doesn't count colors that were only picked, or the eraser", () => {
    const e = new Editor();
    e.setColor('primary', RED);
    e.setTool('eraser');
    drag(e, [[0, 0]]);
    expect(e.getState().recent).toEqual([]);
  });

  it('moves a palette color to another position', () => {
    const e = new Editor();
    const before = e.getState().palette.colors;
    e.movePaletteColor(0, 3);
    const after = e.getState().palette;
    expect(after.key).toBe('custom');
    expect(after.colors[3]).toBe(before[0]);
    expect(after.colors.slice(0, 3)).toEqual(before.slice(1, 4));
    expect([...after.colors].sort()).toEqual([...before].sort());
    e.movePaletteColor(3, 0);
    expect(e.getState().palette.colors).toEqual(before);
  });

  it('deletes the custom palette only when it is not in use', () => {
    const e = new Editor();
    e.setPaletteColors([RED]);
    e.deleteCustomPalette();
    expect(e.getState().palette.custom).toEqual([RED]);
    e.setPalettePreset('pico8');
    e.deleteCustomPalette();
    expect(e.getState().palette.custom).toBeNull();
    expect(e.getState().palette.key).toBe('pico8');
  });

  describe('several layers', () => {
    // Four layers named 0..3 (bottom to top), with a pixel each at x = its index.
    const four = () => {
      const e = new Editor();
      e.setColor('primary', RED);
      drag(e, [[0, 0]]);
      for (let i = 1; i < 4; i++) {
        e.addLayer();
        drag(e, [[i, 0]]);
      }
      e.getState().doc.layers.forEach((_, i) => e.renameLayer(i, String(i)));
      return e;
    };
    const names = (e: Editor) =>
      e
        .getState()
        .doc.layers.map((l) => l.name)
        .join('');
    const picked = (e: Editor) =>
      e
        .getState()
        .doc.layers.filter((l) => e.getState().selectedLayers.includes(l.id))
        .map((l) => l.name)
        .join('');

    it('selects with a click, Cmd/Ctrl+click and Shift+click', () => {
      const e = four();
      e.selectLayer(0, 'single');
      e.selectLayer(2, 'range');
      expect(picked(e)).toBe('012');
      expect(e.getState().doc.activeLayer).toBe(2);
      e.selectLayer(1, 'toggle');
      expect(picked(e)).toBe('02');
      e.selectLayer(3, 'toggle');
      expect(picked(e)).toBe('023');
      e.selectLayer(1, 'single');
      expect(picked(e)).toBe('1');
    });

    it('deletes the selected layers, and brings them back', () => {
      const e = four();
      e.selectLayer(1, 'single');
      e.selectLayer(3, 'toggle');
      expect(e.deleteLayers()).toBe(2);
      expect(names(e)).toBe('02');
      expect(e.restoreDeleted()).toBe(true);
      expect(names(e)).toBe('0123');
      expect(picked(e)).toBe('13');
    });

    it("doesn't delete every layer", () => {
      const e = four();
      e.selectLayer(0, 'single');
      e.selectLayer(3, 'range');
      expect(e.deleteLayers()).toBe(0);
      expect(names(e)).toBe('0123');
    });

    it('merges the selected layers into the lowest one', () => {
      const e = four();
      e.selectLayer(1, 'single');
      e.selectLayer(3, 'toggle');
      e.mergeLayers();
      expect(names(e)).toBe('012');
      expect([...e.getState().doc.layers[1].pixels.slice(0, 4)].map(Boolean)).toEqual([
        false,
        true,
        false,
        true,
      ]);
      e.undo();
      expect(names(e)).toBe('0123');
    });

    it('moves the selected layers together', () => {
      const e = four();
      e.selectLayer(0, 'single');
      e.selectLayer(1, 'range');
      e.moveLayersTo(4);
      expect(names(e)).toBe('2301');
      e.moveLayersTo(0);
      expect(names(e)).toBe('0123');
    });

    it('flattens the image, dropping hidden layers', () => {
      const e = four();
      e.setLayerVisible(2, false);
      e.flattenImage();
      const { layers } = e.getState().doc;
      expect(layers).toHaveLength(1);
      expect([...layers[0].pixels.slice(0, 4)].map(Boolean)).toEqual([true, true, false, true]);
      e.undo();
      expect(names(e)).toBe('0123');
    });
  });

  describe('symmetry axes', () => {
    const at = (e: Editor, x: number, y = 0) =>
      e.getState().doc.layers[0].pixels[y * e.getState().doc.width + x];

    it('mirrors around a moved axis, between pixels or through one', () => {
      const e = new Editor();
      e.setColor('primary', RED);
      e.setView('mirrorX', true);
      e.setMirrorAxis('x', 10); // between pixels 9 and 10
      drag(e, [[7, 0]]);
      expect(at(e, 12)).toBe(RED);
      e.setMirrorAxis('x', 20.5); // through the middle of pixel 20
      drag(e, [[18, 1]]);
      expect(at(e, 22, 1)).toBe(RED);
    });

    it('snaps to half pixels, stays on the canvas, and goes back to the center', () => {
      const e = new Editor();
      e.setMirrorAxis('x', 7.3);
      expect(e.getState().doc.axisX).toBe(7.5);
      e.setMirrorAxis('y', -4);
      expect(e.getState().doc.axisY).toBe(0);
      e.setMirrorAxis('x', null);
      expect(e.getState().doc.axisX).toBeUndefined();
      e.setMirrorAxis('y', 16); // the center of a 32 px canvas
      expect(e.getState().doc.axisY).toBeUndefined();
    });

    it('keeps moved axes in files and when resizing', () => {
      const e = new Editor();
      e.setMirrorAxis('x', 10);
      const back = documentFromJson(documentToJson(e.getState().doc));
      expect(back.axisX).toBe(10);
      expect(back.axisY).toBeUndefined();
      e.resize(40, 32);
      expect(e.getState().doc.axisX).toBe(14);
    });
  });
});

describe('Eraser', () => {
  it('erases even with the Blend option on', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [
      [0, 0],
      [3, 0],
    ]);
    e.setOption('blend', true);
    e.setTool('eraser');
    drag(e, [
      [0, 0],
      [3, 0],
    ]);
    expect(painted(e)).toBe(0);
  });
});

describe('replaceColor', () => {
  it('replaces a color in the drawing and the palette, as one undo step', () => {
    const e = new Editor();
    const BLUE = pack(0, 0, 255);
    e.setPaletteColors([RED, pack(0, 255, 0)]);
    e.setColor('primary', RED);
    drag(e, [
      [0, 0],
      [2, 0],
    ]);
    expect(e.replaceColor(RED, BLUE)).toBe(3);
    expect([...layer(e)].filter((c) => c === BLUE)).toHaveLength(3);
    expect(e.getState().palette.colors).toEqual([BLUE, pack(0, 255, 0)]);
    e.undo();
    expect([...layer(e)].filter((c) => c === RED)).toHaveLength(3);
    expect(e.getState().palette.colors).toEqual([RED, pack(0, 255, 0)]);
    e.redo();
    expect(e.getState().palette.colors).toEqual([BLUE, pack(0, 255, 0)]);
  });

  it('leaves locked layers alone', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    drag(e, [[0, 0]]);
    e.setLayerLocked(0, true);
    expect(e.replaceColor(RED, pack(0, 0, 255))).toBe(0);
    expect(layer(e)[0]).toBe(RED);
  });
});

describe('Fresh files', () => {
  const ids = (e: Editor) => e.getState().files.map((f) => f.id);

  it('drops a new file left untouched once you leave it', () => {
    const e = new Editor();
    const first = e.getState().activeId;
    e.newFile(16, 16);
    const fresh = e.getState().activeId;
    expect(e.isFresh(fresh)).toBe(true);
    e.switchFile(first);
    expect(ids(e)).toEqual([first]);
  });

  it('keeps it once drawn in or renamed', () => {
    const e = new Editor();
    const first = e.getState().activeId;
    e.newFile(16, 16);
    const drawn = e.getState().activeId;
    e.setColor('primary', RED);
    drag(e, [[1, 1]]);
    e.newFile(8, 8);
    const renamed = e.getState().activeId;
    e.renameFile(renamed, 'Kept');
    e.newFile(8, 8);
    e.switchFile(first);
    expect(ids(e)).toEqual([first, drawn, renamed]);
  });

  it('drops the previous fresh file when another one is created', () => {
    const e = new Editor();
    e.newFile(16, 16);
    const a = e.getState().activeId;
    e.newFile(32, 32);
    expect(ids(e)).not.toContain(a);
  });
});
