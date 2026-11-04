import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pack } from '../src/engine/color';
import { createDocument, type PixelDoc } from '../src/engine/document';
import type { Editor } from '../src/engine/editor';
import { addFrame } from '../src/engine/frames';
import { createActions } from '../src/ui/actions';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);
const GREEN = pack(0, 255, 0);

const mocks = vi.hoisted(() => ({
  zipFiles: [] as Array<{ name: string; data: Uint8Array }>,
  savedFiles: [] as Array<{ filename: string; mime: string }>,
  ui: { exportBackground: false },
}));

// A "PNG" is the pixels it was rendered from, to check what each frame holds.
vi.mock('../src/io/png', () => ({
  renderToCanvas: vi.fn(
    (pixels: Uint32Array, _w: number, _h: number, geometry: { width: number }, background: number) =>
      ({ pixels: Array.from(pixels), width: geometry.width, background }) as unknown as HTMLCanvasElement,
  ),
  canvasToBlob: vi.fn(async (canvas: HTMLCanvasElement) => new Blob([JSON.stringify(canvas)])),
}));

vi.mock('../src/io/zip', () => ({
  zip: vi.fn((files: Array<{ name: string; data: Uint8Array }>) => {
    mocks.zipFiles = files.map(({ name, data }) => ({ name, data: data.slice() }));
    return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  }),
}));

vi.mock('../src/io/download', () => ({
  safeFileName: (name: string) => name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'pixel-art',
  saveFile: vi.fn(async (filename: string, _data: Blob | string, mime = 'application/octet-stream') => {
    mocks.savedFiles.push({ filename, mime });
    return 'saved';
  }),
}));

vi.mock('../src/ui/uiStore', () => ({
  openDialog: vi.fn(),
  toast: vi.fn(),
  uiStore: { get: () => mocks.ui },
}));

/** A 2×1 board on three frames: red, then blue, then green, on the left pixel. */
function slime(name = 'slime'): PixelDoc {
  const doc = createDocument(name, 2, 1);
  doc.layers[0].pixels.set([RED, 0]);
  addFrame(doc);
  doc.layers[0].pixels.set([BLUE, 0]);
  addFrame(doc);
  doc.layers[0].pixels.set([GREEN, 0]);
  return doc;
}

function setup(boards: PixelDoc[]) {
  const editor = {
    getState: () => ({ doc: boards[0] }),
    fileBoards: () => boards,
  } as unknown as Editor;
  return createActions(editor);
}

const pixelsOf = (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)).pixels as number[];

beforeEach(() => {
  mocks.zipFiles = [];
  mocks.savedFiles = [];
  mocks.ui.exportBackground = false;
});

describe('PNG sequence export', () => {
  it('puts a PNG per frame in a .zip, named in order', async () => {
    await setup([slime()]).exportImage('sequence');

    expect(mocks.zipFiles.map((f) => f.name)).toEqual(['slime-01.png', 'slime-02.png', 'slime-03.png']);
    expect(mocks.zipFiles.map((f) => pixelsOf(f.data)[0])).toEqual([RED, BLUE, GREEN]);
    expect(mocks.savedFiles).toEqual([{ filename: 'slime.zip', mime: 'application/zip' }]);
  });

  it('numbers with as many digits as the last frame needs', async () => {
    const doc = slime();
    for (let i = 0; i < 97; i++) addFrame(doc);

    await setup([doc]).exportImage('sequence');

    expect(mocks.zipFiles).toHaveLength(100);
    expect(mocks.zipFiles[0].name).toBe('slime-001.png');
    expect(mocks.zipFiles[99].name).toBe('slime-100.png');
  });

  it('includes the background when asked', async () => {
    const doc = slime();
    doc.background = BLUE;
    mocks.ui.exportBackground = true;

    await setup([doc]).exportImage('sequence');

    expect(pixelsOf(mocks.zipFiles[0].data)).toEqual([RED, BLUE]);
  });

  it('puts each board in a folder of its own with All boards', async () => {
    await setup([slime('slime'), slime('ball')]).exportAllBoards('sequence');

    expect(mocks.zipFiles.map((f) => f.name)).toEqual([
      'slime/slime-01.png',
      'slime/slime-02.png',
      'slime/slime-03.png',
      'ball/ball-01.png',
      'ball/ball-02.png',
      'ball/ball-03.png',
    ]);
  });

  it('leaves out the layers outside the boards', async () => {
    const loose = createDocument('slime', 2, 1);
    loose.board = { file: 'f', fileName: 'slime', x: 10, y: 0, free: true };
    await setup([slime('slime'), loose]).exportAllBoards('sequence');

    expect(mocks.zipFiles.map((f) => f.name)).toEqual([
      'slime/slime-01.png',
      'slime/slime-02.png',
      'slime/slime-03.png',
    ]);
  });
});
