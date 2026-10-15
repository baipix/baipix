import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { packHistories, unpackHistories } from '../src/storage/history';
import { IndexedDbStorage } from '../src/storage/indexedDb';

const RED = pack(255, 0, 0);

/** A board of two layers, three strokes on the second one. */
function drawn() {
  const e = new Editor();
  e.newFile(16, 16, 'Kept');
  e.getState().doc.layers[0].pixels.fill(pack(0, 0, 200));
  e.addLayer();
  e.setColor('primary', RED);
  e.setTool('pencil');
  for (const x of [2, 5, 8]) {
    e.beginStroke({ x, y: 3 }, false, { shift: false });
    e.endStroke();
  }
  return e;
}

/** Another editor opening the same documents, as after a reload. */
function reopened(e: Editor) {
  const again = new Editor();
  again.loadDocuments(
    e.getDocuments().map((d) => structuredClone(d)),
    e.getState().doc.id,
  );
  return again;
}

const top = (e: Editor) => e.getState().doc.layers[1].pixels;

describe('the undo history after a reload', () => {
  it('comes back with the documents, and undoes as before', () => {
    const e = drawn();
    const stored = structuredClone(packHistories(e.histories()));
    const again = reopened(e);
    expect(again.getState().canUndo).toBe(false);
    again.restoreHistories(unpackHistories(stored));
    expect(again.getState().canUndo).toBe(true);
    again.undo();
    expect(top(again)[3 * 16 + 8]).toBe(0);
    expect(top(again)[3 * 16 + 5]).toBe(RED);
    again.undo();
    again.undo();
    expect(top(again).some(Boolean)).toBe(false);
    // Redo too.
    again.redo();
    expect(top(again)[3 * 16 + 2]).toBe(RED);
  });

  it('keeps each unchanged layer once, not once per step', () => {
    const e = drawn();
    const stored = packHistories(e.histories());
    const board = stored.boards.find((b) => b.id === e.getState().doc.id)!;
    // Four steps (the new layer, three strokes): the blue layer, never touched, is stored once.
    expect(board.undo).toHaveLength(4);
    expect(stored.pool.length).toBeLessThan(4 * 2);
    expect(stored.pool.filter((px) => px[0] === pack(0, 0, 200))).toHaveLength(1);
  });

  it('keeps only the most recent steps', () => {
    const e = drawn();
    const stored = packHistories(e.histories(), 2);
    expect(stored.boards.find((b) => b.id === e.getState().doc.id)!.undo).toHaveLength(2);
  });

  it('is saved and read back from the browser’s storage', async () => {
    const e = drawn();
    const storage = new IndexedDbStorage();
    await storage.saveHistory(packHistories(e.histories()));
    const again = reopened(e);
    again.restoreHistories(unpackHistories(await storage.loadHistory()));
    again.undo();
    expect(top(again)[3 * 16 + 8]).toBe(0);
  });

  it('leaves out steps that no longer fit', () => {
    const e = drawn();
    const stored = packHistories(e.histories());
    // A step whose pixels went missing: it, and the steps before it, can't be undone to.
    const board = stored.boards.find((b) => b.id === e.getState().doc.id)!;
    (board.undo[2] as { doc: { layers: { pixels: unknown }[] } }).doc.layers[0].pixels = 999;
    const again = reopened(e);
    again.restoreHistories(unpackHistories(stored));
    again.undo();
    expect(again.getState().canUndo).toBe(false);
  });
});
