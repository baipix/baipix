import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { flattenFrame } from '../src/engine/composite';
import {
  addFrame,
  celOf,
  deleteFrames,
  isStill,
  normalizeFrames,
  onionFrames,
  showFrame,
  stillUnder,
} from '../src/engine/frames';
import { createDocument } from '../src/engine/document';
import { documentFromJson, documentToJson, deserializeDocument } from '../src/storage/fileFormat';
import { packHistories, unpackHistories } from '../src/storage/history';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

function editor() {
  const e = new Editor();
  e.newFile(8, 8, 'Walk');
  e.setColor('primary', RED);
  e.setTool('pencil');
  return e;
}

function dot(e: Editor, x: number, y: number) {
  e.beginStroke({ x, y }, false, { shift: false });
  e.endStroke();
}

const doc = (e: Editor) => e.getState().doc;
const at = (e: Editor, x: number, y: number, layer = doc(e).activeLayer) =>
  doc(e).layers[layer].pixels[y * doc(e).width + x];

describe('animation frames', () => {
  it('a board starts as a single frame, with nothing to say about it', () => {
    const e = editor();
    expect(doc(e).frames).toBeUndefined();
    expect(doc(e).layers[0].cels).toBeUndefined();
  });

  it('a new frame copies the shown one, and drawing on it leaves the first as it was', () => {
    const e = editor();
    dot(e, 1, 1);
    e.addFrame();
    expect(doc(e).frames).toHaveLength(2);
    expect(doc(e).activeFrame).toBe(1);
    expect(at(e, 1, 1)).toBe(RED);
    dot(e, 5, 5);
    e.setFrame(0);
    expect(at(e, 1, 1)).toBe(RED);
    expect(at(e, 5, 5)).toBe(0);
    e.setFrame(1);
    expect(at(e, 5, 5)).toBe(RED);
  });

  it('undo takes a frame back, and never sees what was drawn later', () => {
    const e = editor();
    dot(e, 1, 1);
    e.addFrame();
    dot(e, 2, 2);
    e.setFrame(0);
    dot(e, 3, 3);
    e.undo();
    expect(at(e, 3, 3)).toBe(0);
    e.setFrame(1);
    expect(at(e, 2, 2)).toBe(RED);
    e.undo();
    e.undo();
    expect(doc(e).frames).toBeUndefined();
    expect(at(e, 1, 1)).toBe(RED);
    expect(at(e, 2, 2)).toBe(0);
  });

  it('frames can be deleted, moved and timed', () => {
    const e = editor();
    e.addFrame();
    dot(e, 1, 1);
    e.addFrame();
    dot(e, 2, 2);
    e.moveFrame(2, 0);
    expect(doc(e).activeFrame).toBe(0);
    expect(at(e, 2, 2)).toBe(RED);
    e.setFrameDuration(250, [1]);
    expect(doc(e).frames!.map((f) => f.duration)).toEqual([100, 250, 100]);
    e.setFrameDuration(80);
    expect(doc(e).frames!.map((f) => f.duration)).toEqual([80, 80, 80]);
    expect(e.deleteFrame(0)).toBe(true);
    expect(doc(e).frames).toHaveLength(2);
    e.deleteFrame();
    expect(doc(e).frames).toBeUndefined();
    expect(e.deleteFrame()).toBe(false);
  });

  it('a layer added on an animated board is on every frame', () => {
    const e = editor();
    e.addFrame();
    e.addFrame();
    e.addLayer();
    const layer = doc(e).layers[1];
    expect(layer.cels).toHaveLength(3);
    dot(e, 4, 4);
    e.setFrame(0);
    expect(at(e, 4, 4, 1)).toBe(0);
  });

  it('merging works frame by frame', () => {
    const e = editor();
    dot(e, 1, 1);
    e.addLayer();
    e.setColor('primary', BLUE);
    dot(e, 2, 2);
    e.addFrame();
    dot(e, 3, 3);
    e.mergeDown();
    expect(doc(e).layers).toHaveLength(1);
    expect([at(e, 1, 1), at(e, 2, 2), at(e, 3, 3)]).toEqual([RED, BLUE, BLUE]);
    e.setFrame(0);
    expect([at(e, 1, 1), at(e, 2, 2), at(e, 3, 3)]).toEqual([RED, BLUE, 0]);
  });

  it('resizing the canvas resizes every frame', () => {
    const e = editor();
    e.addFrame();
    dot(e, 7, 7);
    e.resize(4, 4, { x: 0, y: 0 });
    e.resize(8, 8, { x: 0, y: 0 });
    expect(at(e, 7, 7)).toBe(RED);
    e.setFrame(0);
    expect(doc(e).layers[0].pixels).toHaveLength(64);
  });

  it('a .baipix file keeps the frames, and older versions still read the shown one', () => {
    const e = editor();
    dot(e, 1, 1);
    e.addFrame();
    dot(e, 2, 2);
    e.setFrameDuration(40, [1]);
    e.setFrame(0);
    const json = documentToJson(doc(e));
    const back = documentFromJson(json);
    expect(back.frames!.map((f) => f.duration)).toEqual([100, 40]);
    expect(back.activeFrame).toBe(0);
    expect(back.layers[0].pixels[2 * 8 + 2]).toBe(0);
    expect(celOf(back, back.layers[0], 1).pixels[2 * 8 + 2]).toBe(RED);
    // Without frames, the file is the shown frame.
    const raw = JSON.parse(json);
    delete raw.frames;
    const old = deserializeDocument(raw);
    expect(old.frames).toBeUndefined();
    expect(old.layers[0].pixels[1 * 8 + 1]).toBe(RED);
    expect(old.layers[0].cels).toBeUndefined();
  });

  it('the saved undo history keeps the frames', () => {
    const e = editor();
    e.addFrame();
    dot(e, 2, 2);
    dot(e, 3, 3);
    const h = unpackHistories(structuredClone(packHistories(e.histories()))).find((x) => x.id === doc(e).id)!;
    const step = h.undo[h.undo.length - 1].doc;
    expect(step.frames).toHaveLength(2);
    expect(step.layers[0].cels).toHaveLength(2);
  });

  it('a layer from a board with other frames fits this one', () => {
    const d = createDocument('A', 4, 4);
    addFrame(d);
    addFrame(d);
    const layer = d.layers[0];
    layer.pixels[0] = RED;
    // Pasted onto a board of two frames showing its second.
    const other = createDocument('B', 4, 4);
    addFrame(other);
    showFrame(other, 1);
    other.layers.push(layer);
    normalizeFrames(other);
    expect(layer.cels).toHaveLength(2);
    expect(layer.cels![1]).toBeNull();
    expect(layer.pixels[0]).toBe(0);
    expect(layer.cels![0]!.pixels).toHaveLength(16);
  });
});

describe('animation frames in the browser', () => {
  it('keep what each frame moved off the canvas', async () => {
    const { storeFile, readStoredFile } = await import('../src/storage/workspace');
    const e = editor();
    dot(e, 7, 7);
    e.addFrame();
    e.resize(4, 4, { x: 0, y: 0 });
    e.setFrame(0);
    const back = readStoredFile(structuredClone(storeFile(doc(e))))!;
    expect(back.layers[0].outside).toBeDefined();
    expect(back.layers[0].cels![1]!.outside).toBeDefined();
  });
});

describe('several frames at once', () => {
  it('deletes the picked frames in one step, and undoes them in one', () => {
    const e = editor();
    for (let i = 1; i < 5; i++) e.addFrame();
    const ids = doc(e).frames!.map((f) => f.id);
    e.deleteFrames([1, 3]);
    expect(doc(e).frames!.map((f) => f.id)).toEqual([ids[0], ids[2], ids[4]]);
    e.undo();
    expect(doc(e).frames!.map((f) => f.id)).toEqual(ids);
  });

  it('keeps one frame when all are picked', () => {
    const e = editor();
    e.addFrame();
    e.addFrame();
    deleteFrames(doc(e), [0, 1, 2]);
    expect(doc(e).frames).toBeUndefined();
  });

  it('sets the duration of the picked frames only', () => {
    const e = editor();
    e.addFrame();
    e.addFrame();
    e.setFrameDuration(250, [0, 2]);
    expect(doc(e).frames!.map((f) => f.duration)).toEqual([250, 100, 250]);
  });
});

describe('empty frames', () => {
  it('keeps the scenery and empties what moves', () => {
    const e = editor();
    dot(e, 0, 0); // The sky, on the bottom layer.
    e.addLayer();
    e.addFrame();
    dot(e, 3, 3); // The character moves on the second frame.
    e.addFrame(true);
    const d = doc(e);
    expect(d.activeFrame).toBe(2);
    expect(at(e, 0, 0, 0)).toBe(RED);
    expect(d.layers[1].pixels.every((c) => c === 0)).toBe(true);
  });

  it('on a single frame, empties only the active layer', () => {
    const e = editor();
    dot(e, 0, 0);
    e.addLayer();
    dot(e, 1, 1);
    e.addFrame(true);
    expect(at(e, 0, 0, 0)).toBe(RED);
    expect(at(e, 1, 1, 1)).toBe(0);
    e.setFrame(0);
    expect(at(e, 1, 1, 1)).toBe(RED);
  });
});

describe('onion skin', () => {
  const walk = (frames: number, shown: number) => {
    const e = editor();
    for (let i = 1; i < frames; i++) e.addFrame();
    e.setFrame(shown);
    return doc(e);
  };

  it('shows the frames around the shown one, the nearest on top and the most opaque', () => {
    expect(onionFrames(walk(6, 3), { before: 2, after: 1, opacity: 0.4 })).toEqual([
      { frame: 1, side: 'before', opacity: 0.2 },
      { frame: 2, side: 'before', opacity: 0.4 },
      { frame: 4, side: 'after', opacity: 0.4 },
    ]);
  });

  it("doesn't loop around the ends", () => {
    const frames = onionFrames(walk(3, 0), { before: 2, after: 5, opacity: 0.5 }).map((o) => o.frame);
    expect(frames).toEqual([2, 1]);
  });

  it('goes over the still layers at the bottom, under the first one that moves', () => {
    const e = editor();
    dot(e, 0, 0); // A sky on the bottom layer, the same on every frame.
    e.addLayer();
    e.addLayer();
    e.addFrame();
    dot(e, 2, 2); // On the top layer, on the new frame only: it moves.
    const d = doc(e);
    expect(d.layers.map((l) => isStill(d, l))).toEqual([true, true, false]);
    expect(stillUnder(d)).toBe(2);
  });

  it('stops at a layer that moves, even with still ones above', () => {
    const e = editor();
    e.addLayer();
    e.setActiveLayer(0);
    e.addFrame();
    dot(e, 1, 1);
    const d = doc(e);
    expect(isStill(d, d.layers[0])).toBe(false);
    expect(isStill(d, d.layers[1])).toBe(true);
    expect(stillUnder(d)).toBe(0);
  });

  it('merges another frame without showing it', () => {
    const e = editor();
    e.addFrame();
    dot(e, 1, 1);
    e.setFrame(0);
    expect(flattenFrame(doc(e), 1)[1 * 8 + 1]).toBe(RED);
    expect(flattenFrame(doc(e), 0)[1 * 8 + 1]).not.toBe(RED);
    expect(doc(e).activeFrame).toBe(0);
  });
});
