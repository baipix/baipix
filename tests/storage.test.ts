import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { createDocument } from '../src/engine/document';
import {
  decodePixels,
  documentFromJson,
  documentToJson,
  encodePixels,
  FileFormatError,
} from '../src/storage/fileFormat';
import { IndexedDbStorage } from '../src/storage/indexedDb';
import { toStored } from '../src/storage/workspace';

describe('.baipix format', () => {
  it('run-length encodes pixels losslessly', () => {
    const px = Uint32Array.from([0, 0, 0, 5, 5, 0, 7]);
    const { colors, runs } = encodePixels(px);
    expect(runs).toEqual([0, 3, 1, 2, 0, 1, 2, 1]);
    expect([...decodePixels(colors, runs, px.length)]).toEqual([...px]);
  });

  it('keeps the last modified date, and reads files without one', () => {
    const doc = createDocument('Hero', 4, 4);
    doc.updatedAt = 1_700_000_000_000;
    expect(documentFromJson(documentToJson(doc)).updatedAt).toBe(1_700_000_000_000);
    delete doc.updatedAt;
    expect(documentFromJson(documentToJson(doc)).updatedAt).toBeUndefined();
  });

  it('round-trips a document', () => {
    const doc = createDocument('Hero', 8, 4);
    doc.layers[0].pixels[3] = pack(1, 2, 3);
    doc.background = pack(9, 9, 9);
    doc.render = { pixelSize: 16, gap: 2 };
    const back = documentFromJson(documentToJson(doc));
    expect(back.name).toBe('Hero');
    expect(back.render).toEqual({ pixelSize: 16, gap: 2 });
    expect([...back.layers[0].pixels]).toEqual([...doc.layers[0].pixels]);
  });

  it('keeps locked layers locked, and older files unlocked', () => {
    const doc = createDocument('Hero', 2, 2);
    doc.layers[0].locked = true;
    const json = documentToJson(doc);
    expect(documentFromJson(json).layers[0].locked).toBe(true);
    expect(documentFromJson(json.replace('"locked":true,', '')).layers[0].locked).toBe(false);
  });

  it('rejects other files', () => {
    expect(() => documentFromJson('{"hello":1}')).toThrow(FileFormatError);
    expect(() => documentFromJson('not json')).toThrow(FileFormatError);
  });
});

/** A browser of its own for each test: its storage starts empty. */
const browser = () => new IDBFactory();

describe('IndexedDbStorage', () => {
  it('saves and loads a workspace', async () => {
    const storage = new IndexedDbStorage(browser());
    const doc = createDocument('A', 4, 4);
    doc.layers[0].pixels[0] = pack(255, 0, 0);
    await storage.save({ documents: [doc], activeId: doc.id, preferences: {}, ui: { lang: 'fr' } });
    const loaded = await storage.load();
    expect(loaded?.documents[0].name).toBe('A');
    expect(loaded?.documents[0].layers[0].pixels[0]).toBe(pack(255, 0, 0));
    expect(loaded?.ui).toEqual({ lang: 'fr' });
  });

  it('keeps pixels outside the canvas in the workspace, not in .baipix files', async () => {
    const storage = new IndexedDbStorage(browser());
    const doc = createDocument('A', 4, 4);
    doc.layers[0].outside = { x: 5, y: -2, w: 2, h: 1, pixels: Uint32Array.from([pack(1, 2, 3), 0]) };
    await storage.save({ documents: [doc], activeId: doc.id, preferences: {}, ui: {} });
    const back = (await storage.load())?.documents[0].layers[0].outside;
    expect(back).toMatchObject({ x: 5, y: -2, w: 2, h: 1 });
    expect([...back!.pixels]).toEqual([pack(1, 2, 3), 0]);
    expect(documentFromJson(documentToJson(doc)).layers[0].outside).toBeUndefined();
  });

  it('keeps the reference image in the workspace, never in .baipix files', async () => {
    const storage = new IndexedDbStorage(browser());
    const doc = createDocument('A', 4, 4);
    const reference = {
      src: 'data:image/webp;base64,AAAA',
      width: 8,
      height: 4,
      x: 0,
      y: 1,
      w: 4,
      h: 2,
      opacity: 0.5,
      visible: false,
      locked: true,
    };
    doc.reference = reference;
    await storage.save({ documents: [doc], activeId: doc.id, preferences: {}, ui: {} });
    expect((await storage.load())?.documents[0].reference).toEqual(reference);
    expect(documentToJson(doc)).not.toContain('reference');
    expect(documentFromJson(documentToJson(doc)).reference).toBeUndefined();
  });

  const workspace = (docs: ReturnType<typeof createDocument>[]) => ({
    documents: docs,
    activeId: docs[0].id,
    preferences: {},
    ui: {},
  });
  const names = async (s: IndexedDbStorage) => (await s.load())?.documents.map((d) => d.name).sort();

  it('never lets one tab wipe what another drew: each only writes its own boards', async () => {
    const chrome = browser();
    const tabA = new IndexedDbStorage(chrome);
    const castle = createDocument('Castle', 4, 4);
    castle.updatedAt = 1;
    await tabA.save(workspace([castle]));
    // A second tab, opened later, draws Pokemon.
    const tabB = new IndexedDbStorage(chrome);
    const loaded = (await tabB.load())!;
    const pokemon = createDocument('Pokemon', 4, 4);
    pokemon.updatedAt = 2;
    await tabB.save(workspace([...loaded.documents, pokemon]));
    // The first tab saves again (closed, say), knowing nothing of Pokemon: it stays.
    await tabA.save(workspace([castle]));
    expect(await names(new IndexedDbStorage(chrome))).toEqual(['Castle', 'Pokemon']);
    // Back on the first tab, Pokemon is there to take in; Castle, unchanged, isn't.
    expect((await tabA.changedElsewhere()).map((d) => d.name)).toEqual(['Pokemon']);
    expect(await tabA.changedElsewhere()).toEqual([]);
  });

  it('removes a board only when the tab that had it drops it', async () => {
    const chrome = browser();
    const tab = new IndexedDbStorage(chrome);
    const a = createDocument('A', 4, 4);
    const b = createDocument('B', 4, 4);
    await tab.save(workspace([a, b]));
    await tab.save(workspace([a]));
    expect(await names(new IndexedDbStorage(chrome))).toEqual(['A']);
  });

  it('writes only the boards that changed', async () => {
    const chrome = browser();
    const tab = new IndexedDbStorage(chrome);
    const a = createDocument('A', 4, 4);
    a.updatedAt = 1;
    await tab.save(workspace([a]));
    // Changed elsewhere (a newer date), and not here: a save here leaves the stored one.
    const other = new IndexedDbStorage(chrome);
    const theirs = (await other.load())!.documents[0];
    theirs.name = 'A renamed';
    theirs.updatedAt = 2;
    await other.save(workspace([theirs]));
    await tab.save(workspace([a]));
    expect(await names(new IndexedDbStorage(chrome))).toEqual(['A renamed']);
  });

  it('brings a version 1 workspace (one record for all) into records per board', async () => {
    const chrome = browser();
    const doc = createDocument('Old', 4, 4);
    await new Promise<void>((resolve, reject) => {
      const req = chrome.open('baipix', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('workspace');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put(toStored(workspace([doc])), 'current');
        tx.oncomplete = () => (db.close(), resolve());
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const storage = new IndexedDbStorage(chrome);
    expect(await names(storage)).toEqual(['Old']);
    // Saved again as records per board: a fresh adapter reads them, not the old record.
    const fresh = createDocument('New', 4, 4);
    await storage.save(workspace([doc, fresh]));
    expect(await names(new IndexedDbStorage(chrome))).toEqual(['New', 'Old']);
  });
});
