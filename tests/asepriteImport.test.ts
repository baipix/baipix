import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { pack } from '../src/engine/color';
import { AsepriteError, fromAseprite } from '../src/engine/import/aseprite';

const RED = pack(255, 0, 0);
const GREEN = pack(0, 255, 0);
const encoder = new TextEncoder();

type FrameSpec = { chunks: Uint8Array[]; duration?: number };

interface FileOptions {
  width?: number;
  height?: number;
  depth?: 8 | 16 | 32;
  flags?: number;
  transparentIndex?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  declaredFrames?: number;
  gridX?: number;
  gridY?: number;
  gridWidth?: number;
  gridHeight?: number;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function chunk(type: number, payload: Uint8Array): Uint8Array {
  const result = new Uint8Array(6 + payload.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, result.length, true);
  view.setUint16(4, type, true);
  result.set(payload, 6);
  return result;
}

function layerChunk({
  name = 'Layer 1',
  flags = 3,
  type = 0,
  level = 0,
  blend = 0,
  opacity = 255,
}: {
  name?: string;
  flags?: number;
  type?: number;
  level?: number;
  blend?: number;
  opacity?: number;
} = {}): Uint8Array {
  const nameBytes = encoder.encode(name);
  const payload = new Uint8Array(18 + nameBytes.length + (type === 2 ? 4 : 0));
  const view = new DataView(payload.buffer);

  view.setUint16(0, flags, true);
  view.setUint16(2, type, true);
  view.setUint16(4, level, true);
  view.setUint16(10, blend, true);
  view.setUint8(12, opacity);
  view.setUint16(16, nameBytes.length, true);
  payload.set(nameBytes, 18);

  return chunk(0x2004, payload);
}

function celChunk({
  layer = 0,
  x = 0,
  y = 0,
  opacity = 255,
  type = 0,
  width = 1,
  height = 1,
  data = new Uint8Array([255, 0, 0, 255]),
  linkedFrame = 0,
  zIndex = 0,
}: {
  layer?: number;
  x?: number;
  y?: number;
  opacity?: number;
  type?: number;
  width?: number;
  height?: number;
  data?: Uint8Array;
  linkedFrame?: number;
  zIndex?: number;
} = {}): Uint8Array {
  const payloadSize = type === 1 ? 18 : type === 0 || type === 2 ? 20 + data.length : 16;
  const payload = new Uint8Array(payloadSize);
  const view = new DataView(payload.buffer);

  view.setUint16(0, layer, true);
  view.setInt16(2, x, true);
  view.setInt16(4, y, true);
  view.setUint8(6, opacity);
  view.setUint16(7, type, true);
  view.setInt16(9, zIndex, true);

  if (type === 1) {
    view.setUint16(16, linkedFrame, true);
  } else if (type === 0 || type === 2) {
    view.setUint16(16, width, true);
    view.setUint16(18, height, true);
    payload.set(data, 20);
  }

  return chunk(0x2005, payload);
}

function legacyPaletteUpdateChunk(color: [number, number, number]): Uint8Array {
  const payload = new Uint8Array([1, 0, 0, 1, ...color]);
  return chunk(0x0004, payload);
}

function legacyPaletteChunk(sixBit = false): Uint8Array {
  const payload = new Uint8Array(2 + 2 + 6);
  const view = new DataView(payload.buffer);

  view.setUint16(0, 1, true); // one packet
  view.setUint8(2, 0); // no skipped palette entries
  view.setUint8(3, 2); // two colors
  payload.set([sixBit ? 63 : 255, 0, 0, 0, sixBit ? 63 : 255, 0], 4);

  return chunk(sixBit ? 0x0011 : 0x0004, payload);
}

function paletteChunk(colors: number[][]): Uint8Array {
  const payload = new Uint8Array(20 + colors.length * 6);
  const view = new DataView(payload.buffer);

  view.setUint32(0, colors.length, true);
  view.setUint32(4, 0, true);
  view.setUint32(8, colors.length - 1, true);

  colors.forEach(([r, g, b, a], index) => {
    const at = 20 + index * 6;
    view.setUint16(at, 0, true);
    payload.set([r, g, b, a], at + 2);
  });

  return chunk(0x2019, payload);
}

function tagsChunk(name = 'Walk'): Uint8Array {
  const nameBytes = encoder.encode(name);
  const payload = new Uint8Array(10 + 17 + 2 + nameBytes.length);
  const view = new DataView(payload.buffer);

  view.setUint16(0, 1, true);
  view.setUint16(10, 0, true); // first frame
  view.setUint16(12, 0, true); // last frame
  view.setUint8(14, 0); // forward
  view.setUint16(27, nameBytes.length, true);
  payload.set(nameBytes, 29);

  return chunk(0x2018, payload);
}

function userDataChunk(text = 'metadata'): Uint8Array {
  const textBytes = encoder.encode(text);
  const payload = new Uint8Array(6 + textBytes.length);
  const view = new DataView(payload.buffer);

  view.setUint32(0, 1, true); // text is present
  view.setUint16(4, textBytes.length, true);
  payload.set(textBytes, 6);

  return chunk(0x2020, payload);
}

function word(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function dword(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function aseString(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  return concatenate([word(bytes.length), bytes]);
}

function externalFilesChunk(): Uint8Array {
  return chunk(
    0x2008,
    concatenate([dword(1), new Uint8Array(8), dword(1), new Uint8Array(8), aseString('palette.gpl')]),
  );
}

function tilesetChunk(): Uint8Array {
  const compressed = new Uint8Array(deflateSync(new Uint8Array([255, 0, 0, 255])));

  return chunk(
    0x2023,
    concatenate([
      dword(1),
      dword(2),
      dword(1),
      word(1),
      word(1),
      word(1),
      new Uint8Array(14),
      aseString('Tileset'),
      dword(compressed.length),
      compressed,
    ]),
  );
}

function propertyEntry(name: string, type: number, value: Uint8Array): Uint8Array {
  return concatenate([aseString(name), word(type), value]);
}

function propertyMap(properties: Uint8Array[]): Uint8Array {
  return concatenate([dword(properties.length), ...properties]);
}

function userDataPropertiesChunk(properties: Uint8Array[]): Uint8Array {
  const map = concatenate([dword(0), propertyMap(properties)]);
  const maps = concatenate([dword(1), map]);
  // Size includes its own DWORD, the map count and all map data.
  const propertyData = concatenate([dword(4 + maps.length), maps]);

  return chunk(0x2020, concatenate([dword(4), propertyData]));
}

function sliceChunk(name = 'Hitbox'): Uint8Array {
  const nameBytes = encoder.encode(name);
  const payload = new Uint8Array(12 + 2 + nameBytes.length + 20);
  const view = new DataView(payload.buffer);

  view.setUint32(0, 1, true); // one key
  view.setUint32(4, 0, true); // no optional key fields
  view.setUint16(12, nameBytes.length, true);
  payload.set(nameBytes, 14);
  view.setUint32(14 + nameBytes.length, 0, true); // frame 0

  return chunk(0x2022, payload);
}

function customColorProfileChunk(): Uint8Array {
  const payload = new Uint8Array(16);
  const view = new DataView(payload.buffer);
  view.setUint16(0, 1, true);
  view.setUint16(2, 1, true);
  return chunk(0x2007, payload);
}

function celExtraChunk(flags = 3): Uint8Array {
  const payload = new Uint8Array(36);
  new DataView(payload.buffer).setUint32(0, flags, true);
  return chunk(0x2006, payload);
}

function iccProfileChunk(): Uint8Array {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint16(0, 2, true); // embedded ICC profile
  view.setUint32(16, 0, true); // empty profile payload
  return chunk(0x2007, payload);
}

function makeFrame({ chunks, duration = 100 }: FrameSpec): Uint8Array {
  const content = concatenate(chunks);
  const result = new Uint8Array(16 + content.length);
  const view = new DataView(result.buffer);

  view.setUint32(0, result.length, true);
  view.setUint16(4, 0xf1fa, true);
  view.setUint16(6, chunks.length, true);
  view.setUint16(8, duration, true);
  result.set(content, 16);

  return result;
}

function makeFile(frames: FrameSpec[], options: FileOptions = {}): Uint8Array {
  const frameBytes = frames.map(makeFrame);
  const result = new Uint8Array(128 + frameBytes.reduce((size, frame) => size + frame.length, 0));
  const view = new DataView(result.buffer);

  view.setUint32(0, result.length, true);
  view.setUint16(4, 0xa5e0, true);
  view.setUint16(6, options.declaredFrames ?? frames.length, true);
  view.setUint16(8, options.width ?? 2, true);
  view.setUint16(10, options.height ?? 2, true);
  view.setUint16(12, options.depth ?? 32, true);
  view.setUint32(14, options.flags ?? 0, true);
  view.setUint8(28, options.transparentIndex ?? 0);
  view.setUint8(34, options.pixelWidth ?? 0);
  view.setUint8(35, options.pixelHeight ?? 0);
  view.setInt16(36, options.gridX ?? 0, true);
  view.setInt16(38, options.gridY ?? 0, true);
  view.setUint16(40, options.gridWidth ?? 0, true);
  view.setUint16(42, options.gridHeight ?? 0, true);

  let offset = 128;

  for (const frame of frameBytes) {
    result.set(frame, offset);
    offset += frame.length;
  }

  return result;
}

async function expectImportError(bytes: Uint8Array, code: AsepriteError['code']): Promise<void> {
  try {
    await fromAseprite(bytes);
    throw new Error('Expected the Aseprite import to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(AsepriteError);
    expect(error).toMatchObject({ code });
  }
}

describe('import from Aseprite', () => {
  it('imports raw RGBA pixels into a new document', async () => {
    const bytes = makeFile([
      {
        chunks: [
          layerChunk({ name: 'Artwork' }),
          celChunk({ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) }),
        ],
      },
    ]);

    const { document, warnings } = await fromAseprite(bytes);

    expect(document.name).toBe('Untitled');
    expect([document.width, document.height]).toEqual([2, 2]);
    expect(document.layers).toHaveLength(1);
    expect(document.layers[0].name).toBe('Artwork');
    expect([...document.layers[0].pixels]).toEqual([RED, GREEN, 0, 0]);
    expect(warnings).toEqual([]);
  });

  it('decompresses compressed cels and applies cel opacity', async () => {
    const compressed = new Uint8Array(deflateSync(new Uint8Array([0, 255, 0, 255])));
    const bytes = makeFile([
      {
        chunks: [layerChunk(), celChunk({ type: 2, opacity: 128, data: compressed })],
      },
    ]);

    const { document } = await fromAseprite(bytes);

    expect(document.layers[0].pixels[0]).toBe(pack(0, 255, 0, 128));
  });

  it('imports indexed colors and treats the transparent palette index as transparent', async () => {
    const bytes = makeFile(
      [
        {
          chunks: [
            layerChunk(),
            paletteChunk([
              [0, 0, 0, 255],
              [255, 0, 0, 255],
            ]),
            celChunk({ width: 2, height: 1, data: new Uint8Array([0, 1]) }),
          ],
        },
      ],
      { depth: 8, width: 2, height: 1, transparentIndex: 0 },
    );

    const { document } = await fromAseprite(bytes);

    expect([...document.layers[0].pixels]).toEqual([0, RED]);
    expect(document.palette?.colors).toEqual([pack(0, 0, 0), RED]);
  });

  it('imports legacy 6-bit palettes', async () => {
    const bytes = makeFile(
      [
        {
          chunks: [
            layerChunk(),
            legacyPaletteChunk(true),
            celChunk({ width: 2, data: new Uint8Array([0, 1]) }),
          ],
        },
      ],
      { depth: 8, width: 2, height: 1, transparentIndex: 255 },
    );

    const { document } = await fromAseprite(bytes);
    expect([...document.layers[0].pixels]).toEqual([RED, pack(0, 255, 0)]);
  });

  it('applies legacy palette updates to the corresponding animation frames', async () => {
    const bytes = makeFile(
      [
        {
          chunks: [layerChunk(), legacyPaletteChunk(), celChunk({ data: new Uint8Array([0]) })],
        },
        {
          chunks: [legacyPaletteUpdateChunk([0, 0, 255]), celChunk({ data: new Uint8Array([0]) })],
        },
      ],
      { depth: 8, width: 1, height: 1, transparentIndex: 255 },
    );

    const { document } = await fromAseprite(bytes);

    expect(document.layers[0].pixels[0]).toBe(RED);
    expect(document.layers[0].cels?.[1]?.pixels[0]).toBe(pack(0, 0, 255));
  });

  it('decodes 16-bit grayscale pixels with alpha', async () => {
    const bytes = makeFile([{ chunks: [layerChunk(), celChunk({ data: new Uint8Array([123, 200]) })] }], {
      depth: 16,
      width: 1,
      height: 1,
    });

    const { document } = await fromAseprite(bytes);

    expect(document.layers[0].pixels[0]).toBe(pack(123, 123, 123, 200));
  });

  it('preserves layer opacity as layer metadata', async () => {
    const bytes = makeFile([{ chunks: [layerChunk({ opacity: 128 })] }], { flags: 1 });
    const { document } = await fromAseprite(bytes);
    expect(document.layers[0].opacity).toBeCloseTo(128 / 255);
  });

  it('preserves cel pixels outside the canvas', async () => {
    const bytes = makeFile([{ chunks: [layerChunk(), celChunk({ x: -1, width: 1, height: 1 })] }], {
      width: 2,
      height: 2,
    });

    const { document } = await fromAseprite(bytes);
    const outside = document.layers[0].outside;

    expect([...document.layers[0].pixels]).toEqual([0, 0, 0, 0]);
    expect(outside).toMatchObject({ x: -1, y: 0, w: 1, h: 1 });
    expect([...outside!.pixels]).toEqual([RED]);
  });

  it('imports linked cels and clamps frame durations', async () => {
    const bytes = makeFile([
      {
        chunks: [layerChunk(), celChunk()],
        duration: 5,
      },
      {
        chunks: [celChunk({ type: 1, linkedFrame: 0, x: 1 })],
        duration: 20_000,
      },
    ]);

    const { document, warnings } = await fromAseprite(bytes);

    expect(document.frames?.map((frame) => frame.duration)).toEqual([10, 10_000]);
    expect(document.layers[0].pixels[0]).toBe(RED);
    expect(document.layers[0].cels?.[1]?.pixels[1]).toBe(RED);
    expect(warnings).toContainEqual({ code: 'frameDurations' });
  });

  it('preserves supported nested groups and their layer membership', async () => {
    const bytes = makeFile([
      {
        chunks: [
          layerChunk({ name: 'Outer', type: 1, level: 0 }),
          layerChunk({ name: 'Inner', type: 1, level: 1 }),
          layerChunk({ name: 'Paint', level: 2 }),
          celChunk({ layer: 2 }),
        ],
      },
    ]);

    const { document } = await fromAseprite(bytes);

    expect(document.groups?.map((group) => group.name)).toEqual(['Outer', 'Inner']);
    expect(document.groups?.[1].parent).toBe(document.groups?.[0].id);
    expect(document.layers[0].name).toBe('Paint');
    expect(document.layers[0].group).toBe(document.groups?.[1].id);
  });

  it('rasterizes an isolated group beyond the supported nesting depth', async () => {
    const chunks = [
      ...Array.from({ length: 5 }, (_, level) =>
        layerChunk({
          name: `Group ${level + 1}`,
          type: 1,
          level,
          blend: level === 4 ? 1 : 0,
          opacity: level === 4 ? 128 : 255,
        }),
      ),
      layerChunk({ name: 'Paint', level: 5 }),
      celChunk({ layer: 5 }),
    ];
    const bytes = makeFile([{ chunks }], { width: 1, height: 1, flags: 2 });

    const { document, warnings } = await fromAseprite(bytes);

    expect(document.groups).toHaveLength(4);
    expect(document.layers).toHaveLength(1);
    expect(document.layers[0].name).toBe('Group 5');
    expect(document.layers[0].group).toBe(document.groups?.[3].id);
    expect(document.layers[0].opacity).toBeCloseTo(128 / 255);
    expect(document.layers[0].blendMode).toBe('multiply');
    expect(document.layers[0].pixels[0]).toBe(RED);
    expect(warnings).toContainEqual({ code: 'deepGroupsFlattened' });
    expect(warnings).toContainEqual({ code: 'deepGroupBlendModes' });
  });

  it('keeps child layers editable when deep groups are pass-through', async () => {
    const chunks = [
      ...Array.from({ length: 5 }, (_, level) => layerChunk({ name: `Group ${level + 1}`, type: 1, level })),
      layerChunk({ name: 'Paint', level: 5 }),
      celChunk({ layer: 5 }),
    ];
    const bytes = makeFile([{ chunks }], { width: 1, height: 1 });

    const { document } = await fromAseprite(bytes);

    expect(document.groups).toHaveLength(4);
    expect(document.layers).toHaveLength(1);
    expect(document.layers[0].name).toBe('Paint');
    expect(document.layers[0].group).toBe(document.groups?.[3].id);
  });

  it('opens files containing only unsupported tilemap layers with a warning', async () => {
    const bytes = makeFile([{ chunks: [layerChunk({ name: 'Tilemap', type: 2 })] }]);

    const { document, warnings } = await fromAseprite(bytes);

    expect(document.layers).toHaveLength(1);
    expect(document.layers[0].name).toBe('Layer 1');
    expect(warnings).toContainEqual({ code: 'tilemapsSkipped' });
  });

  it('reports unsupported metadata, blend modes, cel flags and pixel aspect ratio', async () => {
    const bytes = makeFile(
      [
        {
          chunks: [
            layerChunk({ blend: 12 }),
            celChunk({ zIndex: 1 }),
            celExtraChunk(3),
            celChunk({ type: 4 }),
            celChunk({ type: 4 }),
            tagsChunk(),
            userDataChunk(),
            sliceChunk(),
            iccProfileChunk(),
          ],
          duration: 5,
        },
      ],
      { width: 1, height: 1, pixelWidth: 2, pixelHeight: 1 },
    );

    const { document, warnings } = await fromAseprite(bytes);
    const codes = warnings.map((warning) => warning.code);

    expect(document.layers[0].blendMode).toBe('normal');
    expect(codes).toEqual(
      expect.arrayContaining([
        'pixelAspectRatio',
        'unsupportedBlendModes',
        'celOrdering',
        'preciseCelBounds',
        'unsupportedCelExtraFlags',
        'unsupportedCelTypes',
        'animationTags',
        'userData',
        'slices',
        'embeddedIccProfile',
        'frameDurations',
      ]),
    );
    expect(codes.filter((code) => code === 'unsupportedCelTypes')).toHaveLength(1);
  });

  it('reports unsupported layer flags and custom color profiles', async () => {
    const bytes = makeFile([
      {
        chunks: [
          layerChunk({ name: 'Unsupported', type: 3, flags: 3 | 4 | 8 | 64 }),
          celChunk({ type: 3 }),
          customColorProfileChunk(),
        ],
      },
    ]);

    const { warnings } = await fromAseprite(bytes);
    const codes = warnings.map((warning) => warning.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'layerMovementLocks',
        'backgroundLayers',
        'referenceLayers',
        'unsupportedLayerTypes',
        'tilemapsSkipped',
        'customColorProfile',
      ]),
    );
  });

  it('warns about external files, tilesets and custom grid metadata', async () => {
    const bytes = makeFile(
      [
        {
          chunks: [layerChunk(), externalFilesChunk(), tilesetChunk()],
        },
      ],
      {
        width: 1,
        height: 1,
        gridX: 2,
        gridY: 3,
        gridWidth: 8,
        gridHeight: 12,
      },
    );

    const { warnings } = await fromAseprite(bytes);

    expect(warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['externalFiles', 'tilesetsSkipped', 'gridMetadata']),
    );
  });

  it('rejects files with an invalid or truncated header', async () => {
    await expectImportError(new Uint8Array(64), 'unreadable');

    const bytes = makeFile([{ chunks: [] }]);
    new DataView(bytes.buffer).setUint16(4, 0, true);
    await expectImportError(bytes, 'unreadable');
  });

  it('rejects canvas and frame counts above the supported limits', async () => {
    await expectImportError(makeFile([{ chunks: [] }], { width: 513 }), 'canvasTooLarge');
    await expectImportError(makeFile([{ chunks: [] }], { declaredFrames: 1000 }), 'tooManyFrames');
  });

  it('rejects indexed files without a palette', async () => {
    const bytes = makeFile([{ chunks: [layerChunk(), celChunk({ data: new Uint8Array([1]) })] }], {
      depth: 8,
      width: 1,
      height: 1,
    });

    await expectImportError(bytes, 'unreadable');
  });

  it('rejects cels whose declared pixel area exceeds the import limit', async () => {
    const bytes = makeFile(
      [{ chunks: [layerChunk(), celChunk({ width: 2049, height: 2049, data: new Uint8Array() })] }],
      { width: 1, height: 1 },
    );

    await expectImportError(bytes, 'celTooLarge');
  });

  it('rejects files whose total pixel budget exceeds the import limit', async () => {
    const frames: FrameSpec[] = Array.from({ length: 64 }, (_, index) => ({
      chunks: index === 0 ? [layerChunk(), celChunk()] : [celChunk()],
    }));

    const bytes = makeFile(frames, {
      width: 512,
      height: 512,
    });

    await expectImportError(bytes, 'importTooLarge');
  });

  it('rejects cels that reference a missing layer', async () => {
    const bytes = makeFile([{ chunks: [layerChunk(), celChunk({ layer: 1 })] }]);

    await expectImportError(bytes, 'unreadable');
  });

  it('rejects linked cels that reference a missing source cel', async () => {
    const bytes = makeFile([{ chunks: [layerChunk()] }, { chunks: [celChunk({ type: 1, linkedFrame: 0 })] }]);

    await expectImportError(bytes, 'unreadable');
  });

  it('rejects compressed cels that expand beyond their declared dimensions', async () => {
    const compressed = new Uint8Array(deflateSync(new Uint8Array([1, 2, 3, 4, 5])));
    const bytes = makeFile([
      { chunks: [layerChunk(), celChunk({ type: 2, width: 1, height: 1, data: compressed })] },
    ]);

    await expectImportError(bytes, 'unreadable');
  });

  it('rejects chunks with invalid sizes', async () => {
    const bytes = makeFile([{ chunks: [layerChunk()] }]);
    new DataView(bytes.buffer).setUint32(144, 5, true); // first chunk starts after file + frame headers
    await expectImportError(bytes, 'unreadable');
  });

  it('uses the extended frame chunk count when it is non-zero', async () => {
    const bytes = makeFile([{ chunks: [layerChunk(), celChunk()] }], {
      width: 1,
      height: 1,
    });

    const view = new DataView(bytes.buffer);

    // The new field overrides the legacy count.
    view.setUint16(128 + 6, 1, true);
    view.setUint32(128 + 12, 2, true);

    const { document } = await fromAseprite(bytes);
    expect(document.layers[0].pixels[0]).toBe(RED);
  });

  it('rejects Cel Extra chunks without a preceding cel', async () => {
    const bytes = makeFile([{ chunks: [layerChunk(), celExtraChunk()] }]);
    await expectImportError(bytes, 'unreadable');
  });

  it('validates nested property maps and mixed-type vectors', async () => {
    const nestedMap = propertyMap([
      propertyEntry('enabled', 0x0001, new Uint8Array([1])),
      propertyEntry('title', 0x000d, aseString('nested')),
    ]);

    const vector = concatenate([
      dword(2),
      word(0), // mixed element types
      word(0x0003),
      new Uint8Array([7]),
      word(0x0012),
      nestedMap,
    ]);

    const bytes = makeFile([
      {
        chunks: [
          layerChunk(),
          userDataPropertiesChunk([
            propertyEntry('settings', 0x0012, nestedMap),
            propertyEntry('items', 0x0011, vector),
          ]),
        ],
      },
    ]);

    const { warnings } = await fromAseprite(bytes);

    expect(warnings).toContainEqual({ code: 'userData' });
  });

  it('rejects unsupported and truncated nested user data properties', async () => {
    const unsupportedType = makeFile([
      {
        chunks: [layerChunk(), userDataPropertiesChunk([propertyEntry('unknown', 0x7777, new Uint8Array())])],
      },
    ]);

    const truncatedValue = makeFile([
      {
        chunks: [
          layerChunk(),
          userDataPropertiesChunk([
            propertyEntry(
              'settings',
              0x0012,
              propertyMap([propertyEntry('enabled', 0x0001, new Uint8Array())]),
            ),
          ]),
        ],
      },
    ]);

    await expectImportError(unsupportedType, 'unreadable');
    await expectImportError(truncatedValue, 'unreadable');
  });

  it('rejects user data properties nested beyond 128 levels', async () => {
    let nested = propertyMap([propertyEntry('value', 0x0001, new Uint8Array([1]))]);

    for (let i = 0; i < 129; i++) {
      nested = propertyMap([propertyEntry('nested', 0x0012, nested)]);
    }

    const bytes = makeFile([
      {
        chunks: [layerChunk(), userDataPropertiesChunk([propertyEntry('root', 0x0012, nested)])],
      },
    ]);

    await expectImportError(bytes, 'unreadable');
  });
});
