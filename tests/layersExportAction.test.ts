import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pack } from '../src/engine/color';
import { createDocument, createLayer } from '../src/engine/document';
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
    ) =>
      ({
        pixels: Array.from(pixels),
        docWidth,
        docHeight,
        geometry,
      }) as unknown as HTMLCanvasElement,
  ),

  canvasToBlob: vi.fn(async (canvas: HTMLCanvasElement) => new Blob([JSON.stringify(canvas)])),
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
  uiStore: { get: () => ({}) },
}));

interface MockPng {
  pixels: number[];
  docWidth: number;
  docHeight: number;
  geometry: {
    pixelSize: number;
    gap: number;
    width: number;
    height: number;
  };
}

function setup() {
  const doc = createDocument('Test Board', 2, 1, 'base');

  doc.layers[0].pixels.set([RED, 0]);

  const details = createLayer('details', 2, 1);
  details.pixels.set([0, BLUE]);
  doc.layers.push(details);

  const editor = {
    getState: () => ({ doc }),
  } as unknown as Editor;

  return {
    doc,
    actions: createActions(editor),
  };
}

function decodePng(data: Uint8Array): MockPng {
  return JSON.parse(new TextDecoder().decode(data)) as MockPng;
}

beforeEach(() => {
  mocks.zipFiles = [];
  mocks.savedFiles = [];
  vi.clearAllMocks();
});

describe('exportLayers', () => {
  it('exports visible layers and a horizontal sprite sheet into one ZIP', async () => {
    const { actions } = setup();

    await actions.exportLayers();

    expect(mocks.zipFiles.map(({ name }) => name)).toEqual([
      'base.png',
      'details.png',
      'Test Board-sprite-sheet.png',
    ]);

    const sheet = decodePng(mocks.zipFiles[2].data);

    expect(sheet.docWidth).toBe(4);
    expect(sheet.docHeight).toBe(1);
    expect(sheet.pixels).toEqual([RED, 0, 0, BLUE]);

    expect(mocks.savedFiles).toHaveLength(1);
    expect(mocks.savedFiles[0]).toMatchObject({
      filename: 'Test Board.zip',
      mime: 'application/zip',
    });
  });

  it('does not export hidden layers', async () => {
    const { doc, actions } = setup();
    doc.layers[1].visible = false;

    await actions.exportLayers();

    expect(mocks.zipFiles.map(({ name }) => name)).toEqual(['base.png', 'Test Board-sprite-sheet.png']);

    const sheet = decodePng(mocks.zipFiles[1].data);

    expect(sheet.docWidth).toBe(2);
    expect(sheet.pixels).toEqual([RED, 0]);
  });

  it('generates unique filenames for layers with duplicate names', async () => {
    const { doc, actions } = setup();
    doc.layers[1].name = 'base';

    await actions.exportLayers();

    expect(mocks.zipFiles.map(({ name }) => name)).toEqual([
      'base.png',
      'base 2.png',
      'Test Board-sprite-sheet.png',
    ]);
  });

  it('avoids collisions with the sprite sheet filename', async () => {
    const { doc, actions } = setup();

    doc.layers[0].name = 'Test Board-sprite-sheet';
    doc.layers[1].name = 'Test Board-sprite-sheet';

    await actions.exportLayers();

    expect(mocks.zipFiles.map(({ name }) => name)).toEqual([
      'Test Board-sprite-sheet 2.png',
      'Test Board-sprite-sheet 3.png',
      'Test Board-sprite-sheet.png',
    ]);
  });

  it('stops before rendering the sprite sheet when its dimensions exceed the export limit', async () => {
    const doc = createDocument('Large Board', 512, 1, 'base');
    doc.render.pixelSize = 1;
    doc.render.gap = 0;

    for (let index = 1; index < 17; index++) {
      doc.layers.push(createLayer(`Layer ${index}`, doc.width, doc.height));
    }

    const editor = { getState: () => ({ doc }) } as unknown as Editor;
    const actions = createActions(editor);

    await actions.exportLayers();

    expect(toast).toHaveBeenCalledOnce();
    expect(renderToCanvas).not.toHaveBeenCalled();
    expect(mocks.zipFiles).toHaveLength(0);
    expect(mocks.savedFiles).toHaveLength(0);
  });

  it('does not create a ZIP when all layers are hidden', async () => {
    const { doc, actions } = setup();

    doc.layers.forEach((layer) => {
      layer.visible = false;
    });

    await actions.exportLayers();

    expect(mocks.zipFiles).toHaveLength(0);
    expect(mocks.savedFiles).toHaveLength(0);
  });
});
