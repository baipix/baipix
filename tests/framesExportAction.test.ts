import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pack } from '../src/engine/color';
import { createDocument } from '../src/engine/document';
import { addFrame } from '../src/engine/frames';
import type { Editor } from '../src/engine/editor';
import { renderToCanvas } from '../src/io/png';
import { createActions } from '../src/ui/actions';
import { toast } from '../src/ui/uiStore';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

const mocks = vi.hoisted(() => ({
  zipFiles: [] as Array<{ name: string; data: Uint8Array }>,

  savedFiles: [] as Array<{
    filename: string;
    data: Blob | string;
    mime: string;
  }>,

  ui: {
    exportSheetColumns: null as number | null,
    exportBackground: false,
  },
}));

vi.mock('../src/io/png', () => ({
  renderToCanvas: vi.fn(
    (
      pixels: Uint32Array,
      docWidth: number,
      docHeight: number,
      geometry: {
        pixelSize: number;
        gap: number;
        width: number;
        height: number;
      },
      background = 0,
    ) =>
      ({
        pixels: Array.from(pixels),
        docWidth,
        docHeight,
        geometry,
        background,
      }) as unknown as HTMLCanvasElement,
  ),

  canvasToBlob: vi.fn(async (canvas: HTMLCanvasElement) => {
    return new Blob([JSON.stringify(canvas)]);
  }),
}));

vi.mock('../src/io/zip', () => ({
  zip: vi.fn((files: Array<{ name: string; data: Uint8Array }>) => {
    mocks.zipFiles = files.map(({ name, data }) => ({
      name,
      data: data.slice(),
    }));

    return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  }),
}));

vi.mock('../src/io/download', () => ({
  safeFileName: (name: string) =>
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .slice(0, 80) || 'pixel-art',

  saveFile: vi.fn(async (filename: string, data: Blob | string, mime = 'application/octet-stream') => {
    mocks.savedFiles.push({ filename, data, mime });
    return 'saved';
  }),
}));

vi.mock('../src/ui/uiStore', () => ({
  openDialog: vi.fn(),
  toast: vi.fn(),
  uiStore: {
    get: () => mocks.ui,
  },
}));

interface MockCanvas {
  pixels: number[];
  docWidth: number;
  docHeight: number;
  geometry: {
    pixelSize: number;
    gap: number;
    width: number;
    height: number;
  };
  background: number;
}

function animatedDocument(name = 'Test Board') {
  const doc = createDocument(name, 2, 1, 'base');

  doc.render.pixelSize = 1;
  doc.render.gap = 0;

  doc.layers[0].pixels.set([RED, 0]);

  addFrame(doc, 0);

  doc.layers[0].pixels.set([0, BLUE]);

  doc.frames![0].duration = 75;
  doc.frames![1].duration = 150;

  return doc;
}

function setup(doc: ReturnType<typeof createDocument>, boards = [doc]) {
  const editor = {
    getState: () => ({ doc }),
    fileBoards: () => boards,
  } as unknown as Editor;

  return {
    actions: createActions(editor),
    doc,
  };
}

function decodeCanvas(data: Uint8Array): MockCanvas {
  return JSON.parse(new TextDecoder().decode(data)) as MockCanvas;
}

function decodeJson(data: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(data));
}

beforeEach(() => {
  mocks.zipFiles = [];
  mocks.savedFiles = [];

  mocks.ui.exportSheetColumns = null;
  mocks.ui.exportBackground = false;

  vi.clearAllMocks();
});

describe('exportFrames', () => {
  it('exports all animation frames as a sprite sheet and JSON in a ZIP', async () => {
    const { actions } = setup(animatedDocument());
    mocks.ui.exportSheetColumns = 2;
    await actions.exportFrames();

    expect(mocks.zipFiles.map(({ name }) => name)).toEqual([
      'Test Board-sprite-sheet.png',
      'Test Board-sprite-sheet.json',
    ]);

    const sheet = decodeCanvas(mocks.zipFiles[0].data);

    expect(sheet.docWidth).toBe(4);
    expect(sheet.docHeight).toBe(1);
    expect(sheet.pixels).toEqual([RED, 0, 0, BLUE]);

    const json = decodeJson(mocks.zipFiles[1].data);

    expect(json.frames['frame-0001.png']).toMatchObject({
      frame: { x: 0, y: 0, w: 2, h: 1 },
      duration: 75,
    });

    expect(json.frames['frame-0002.png']).toMatchObject({
      frame: { x: 2, y: 0, w: 2, h: 1 },
      duration: 150,
    });

    expect(json.meta).toMatchObject({
      image: 'Test Board-sprite-sheet.png',
      size: { w: 4, h: 1 },
    });

    expect(mocks.savedFiles).toHaveLength(1);

    expect(mocks.savedFiles[0]).toMatchObject({
      filename: 'Test Board.zip',
      mime: 'application/zip',
    });
  });

  it('exports every board separately when All boards is selected', async () => {
    const first = animatedDocument('First');
    const second = animatedDocument('Second');

    const { actions } = setup(first, [first, second]);
    await actions.exportAllBoards('frames');

    expect(mocks.zipFiles.map(({ name }) => name)).toEqual([
      'First-sprite-sheet.png',
      'First-sprite-sheet.json',
      'Second-sprite-sheet.png',
      'Second-sprite-sheet.json',
    ]);

    const firstJson = decodeJson(mocks.zipFiles[1].data);
    const secondJson = decodeJson(mocks.zipFiles[3].data);

    expect(firstJson.meta.image).toBe('First-sprite-sheet.png');
    expect(secondJson.meta.image).toBe('Second-sprite-sheet.png');

    expect(mocks.savedFiles).toHaveLength(1);
    expect(mocks.savedFiles[0].mime).toBe('application/zip');
  });

  it('generates unique filenames for boards with duplicate names', async () => {
    const first = animatedDocument('Same');
    const second = animatedDocument('Same');

    const { actions } = setup(first, [first, second]);
    await actions.exportAllBoards('frames');

    expect(mocks.zipFiles.map(({ name }) => name)).toEqual([
      'Same-sprite-sheet.png',
      'Same-sprite-sheet.json',
      'Same-sprite-sheet 2.png',
      'Same-sprite-sheet 2.json',
    ]);
  });

  it('stops before rendering a sprite sheet that exceeds the export limit', async () => {
    const doc = createDocument('Large Board', 512, 512, 'base');
    doc.render.pixelSize = 1;

    // The size check should stop the export before accessing individual cels.
    doc.frames = Array.from({ length: 999 }, (_, index) => ({
      id: `frame-${index}`,
      duration: 100,
    }));

    doc.activeFrame = 0;

    const { actions } = setup(doc);
    await actions.exportFrames();

    expect(toast).toHaveBeenCalledOnce();
    expect(renderToCanvas).not.toHaveBeenCalled();

    expect(mocks.zipFiles).toHaveLength(0);
    expect(mocks.savedFiles).toHaveLength(0);
  });
});
