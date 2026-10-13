import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { fileFromJson, fileToJson } from '../src/storage/fileFormat';

const RED = pack(255, 0, 0);

/** A file of one 16 × 16 board, with a 2 × 2 square at (14, 4) on its only layer. */
function board() {
  const e = new Editor();
  const starter = e.getState().activeId;
  e.newFile(16, 16, 'Icons');
  e.discardFile(starter);
  const layer = e.getState().doc.layers[0];
  for (const [x, y] of [
    [14, 4],
    [15, 4],
    [14, 5],
    [15, 5],
  ])
    layer.pixels[y * 16 + x] = RED;
  return e;
}

/** Drags the active layer by (dx, dy) with the Move tool, from one of its pixels. */
function drag(e: Editor, from: { x: number; y: number }, dx: number, dy: number) {
  e.setTool('move');
  e.beginStroke(from, false, { shift: false });
  e.moveStroke({ x: from.x + dx, y: from.y + dy }, { shift: false });
  e.endStroke();
}

const place = (e: Editor) => {
  const free = e.freeZone()!;
  return { x: free.board!.x, y: free.board!.y, w: free.width, h: free.height };
};

describe('layers outside the boards', () => {
  it('leaves a layer dragged out of its board where it is, outside every board', () => {
    const e = board();
    const icons = e.getState().doc.id;
    drag(e, { x: 14, y: 4 }, 10, 0);
    const layer = e.getState().doc.layers[0];
    expect(e.moveLayerOut(layer.id)).toBe(true);
    const s = e.getState();
    // Not a board: the file still has one.
    expect(s.boards.map((b) => b.id)).toEqual([icons]);
    expect(s.files[0]).toMatchObject({ name: 'Icons', boards: 1 });
    // The free layers, active, fit the square where it was dropped: (24, 4) in the file.
    expect(s.doc.board?.free).toBe(true);
    expect(place(e)).toEqual({ x: 24, y: 4, w: 2, h: 2 });
    expect(s.doc.layers.map((l) => l.id)).toEqual([layer.id]);
    expect(s.doc.layers[0].pixels.every((c) => c === RED)).toBe(true);
    // The board keeps an empty layer.
    e.switchBoard(icons);
    expect(e.getState().doc.layers[0].pixels.some(Boolean)).toBe(false);
  });

  it('only moves them: the tools draw on a board', () => {
    const e = board();
    drag(e, { x: 14, y: 4 }, 10, 0);
    e.moveLayerOut(e.getState().doc.layers[0].id);
    e.setTool('pencil');
    expect(e.beginStroke({ x: 0, y: 0 }, false, { shift: false })).toBe(false);
    // Moved, they fit their drawing again, nothing moving on screen but the layer.
    drag(e, { x: 0, y: 0 }, -3, 5);
    expect(place(e)).toEqual({ x: 21, y: 9, w: 2, h: 2 });
    e.undo();
    expect(place(e)).toEqual({ x: 24, y: 4, w: 2, h: 2 });
  });

  it('undoes the move out in one step, from either side, and redoes it', () => {
    const e = board();
    const icons = e.getState().doc.id;
    drag(e, { x: 14, y: 4 }, 10, 0);
    const id = e.getState().doc.layers[0].id;
    e.moveLayerOut(id);
    e.undo();
    // The free layers made for it go, and it's back on its board, where it was dropped.
    expect(e.freeZone()).toBeNull();
    expect(e.getState().doc.id).toBe(icons);
    expect(e.getState().doc.layers[0].id).toBe(id);
    expect(e.getState().doc.layers[0].outside).toMatchObject({ x: 24, y: 4 });
    e.redo();
    expect(e.getState().doc.board?.free).toBe(true);
    expect(e.getState().doc.layers[0].id).toBe(id);
    // From the board's side too.
    e.switchBoard(icons);
    e.undo();
    expect(e.freeZone()).toBeNull();
    expect(e.getState().doc.layers[0].id).toBe(id);
  });

  it('goes back onto a board, the free layers going with their last one; undo brings them back', () => {
    const e = board();
    const icons = e.getState().doc.id;
    drag(e, { x: 14, y: 4 }, 10, 0);
    const id = e.getState().doc.layers[0].id;
    e.moveLayerOut(id);
    expect(e.moveLayerToBoard(id, icons)).toBe(true);
    expect(e.freeZone()).toBeNull();
    expect(e.getState().doc.layers.at(-1)!.id).toBe(id);
    e.undo();
    expect(e.getState().doc.board?.free).toBe(true);
    expect(e.getState().doc.layers.map((l) => l.id)).toEqual([id]);
    e.redo();
    expect(e.freeZone()).toBeNull();
    expect(e.getState().doc.layers.at(-1)!.id).toBe(id);
  });

  it('undoes a layer moved to another board on both boards', () => {
    const e = board();
    const icons = e.getState().doc.id;
    e.addBoard(24, 0, 8, 8, 'Small');
    const small = e.getState().doc.id;
    e.switchBoard(icons);
    e.addLayer();
    const id = e.getState().doc.layers[1].id;
    e.moveLayerToBoard(id, small);
    e.undo();
    expect(e.getState().doc.id).toBe(icons);
    expect(e.getState().doc.layers.map((l) => l.id)).toContain(id);
    e.switchBoard(small);
    expect(e.getState().doc.layers.map((l) => l.id)).not.toContain(id);
  });

  it('go when they are all deleted, and come back with the toast’s Undo', () => {
    const e = board();
    drag(e, { x: 14, y: 4 }, 10, 0);
    e.moveLayerOut(e.getState().doc.layers[0].id);
    expect(e.deleteLayers()).toBe(1);
    expect(e.freeZone()).toBeNull();
    expect(e.getState().boards).toHaveLength(1);
    e.restoreDeleted();
    expect(e.getState().doc.board?.free).toBe(true);
  });

  it('keep a file with no board, and are saved with it', () => {
    const e = board();
    const icons = e.getState().doc.id;
    drag(e, { x: 14, y: 4 }, 10, 0);
    e.moveLayerOut(e.getState().doc.layers[0].id);
    e.deleteBoards([icons]);
    const s = e.getState();
    expect(s.boards).toEqual([]);
    expect(s.doc.board?.free).toBe(true);
    expect(e.fileBoards()).toHaveLength(1);
    const again = fileFromJson(fileToJson(e.fileBoards()));
    expect(again[0].board).toMatchObject({ free: true, x: 24, y: 4 });
    // Their last layer gone: the file has nothing, its blank board says so.
    e.deleteLayers();
    expect(e.getState().doc.board?.empty).toBe(true);
  });
});
