import { afterEach, describe, expect, it, vi } from 'vitest';

import { pack } from '../src/engine/color';
import { createDocument } from '../src/engine/document';
import type { Editor } from '../src/engine/editor';
import { createActions } from '../src/ui/actions';

const mocks = vi.hoisted(() => ({
  savedFiles: [] as Array<{ filename: string; data: unknown; mime: string }>,
  fills: [] as Array<{ style: string; x: number; y: number; w: number; h: number }>,
  canvases: [] as Array<{ width: number; height: number }>,
}));

vi.mock('../src/io/png', () => ({
  renderToCanvas: vi.fn(),
  canvasToBlob: vi.fn(async (canvas: unknown) => canvas),
}));

vi.mock('../src/io/download', () => ({
  safeFileName: (name: string) => name,
  saveFile: vi.fn(async (filename: string, data: unknown, mime: string) => {
    mocks.savedFiles.push({ filename, data, mime });
    return 'saved';
  }),
}));

vi.mock('../src/ui/uiStore', () => ({
  openDialog: vi.fn(),
  toast: vi.fn(),
  uiStore: { get: () => ({}) },
}));

/** A stand-in for a 2D canvas that records the squares drawn on it. */
function stubCanvas() {
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctx };
      mocks.canvases.push(canvas);
      let style = '';
      const ctx = {
        set fillStyle(value: string) {
          style = value;
        },
        get fillStyle() {
          return style;
        },
        fillRect: (x: number, y: number, w: number, h: number) => {
          mocks.fills.push({ style, x, y, w, h });
        },
      };
      return canvas;
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.savedFiles.length = 0;
  mocks.fills.length = 0;
  mocks.canvases.length = 0;
});

describe('palette as a picture', () => {
  it('saves one 32 × 32 square per color, 8 a row, in the palette order', async () => {
    stubCanvas();
    const doc = createDocument('Test Board', 1, 1, 'base');
    const colors = Array.from({ length: 9 }, (_, i) => pack(i * 10, 0, 0));
    const editor = {
      getState: () => ({ doc, palette: { colors } }),
    } as unknown as Editor;

    await createActions(editor).exportPalette('png');

    expect(mocks.savedFiles).toHaveLength(1);
    expect(mocks.savedFiles[0].filename).toBe('Test Board-palette.png');
    expect(mocks.savedFiles[0].mime).toBe('image/png');

    // Nine colors: a row of eight, then one square on the second row.
    expect(mocks.canvases[0]).toMatchObject({ width: 256, height: 64 });
    expect(mocks.fills).toHaveLength(9);
    expect(mocks.fills[0]).toEqual({ style: '#000000', x: 0, y: 0, w: 32, h: 32 });
    expect(mocks.fills[7]).toEqual({ style: '#460000', x: 224, y: 0, w: 32, h: 32 });
    expect(mocks.fills[8]).toEqual({ style: '#500000', x: 0, y: 32, w: 32, h: 32 });
  });
});
