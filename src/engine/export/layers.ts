import { flatten } from '../composite';
import type { Layer, PixelDoc } from '../document';
import { isShown } from '../groups';
import { composeSpriteSheet } from './spriteSheet';

/** Layers eligible for export, in the document's bottom-to-top order. */
export function exportableLayers(doc: PixelDoc): Layer[] {
  return doc.layers.filter((layer) => isShown(doc, layer));
}

/** Builds a sprite sheet from the visible layers, in bottom-to-top document order. */
export function layerSpriteSheet(
  doc: PixelDoc,
  layers = exportableLayers(doc),
  columns: number | null = null,
) {
  const sheet = composeSpriteSheet(
    layers.map((layer) => flatten(doc, { onlyLayer: layer })),
    doc.width,
    doc.height,
    columns,
  );

  return {
    layers,
    pixels: sheet.pixels,
    width: sheet.width,
    height: sheet.height,
  };
}

interface Size {
  width: number;
  height: number;
}

/**
 * The sheet's data file for game engines, in the TexturePacker / Aseprite "hash" format that
 * Phaser, Godot importers and Unity read: each item's frame on the sheet, in exported pixels.
 * `cell` is one item's exported size and `gap` the space between pixels, which also separates
 * the cells, as it does on the sheet.
 */
export function spriteSheetJson(
  image: string,
  names: string[],
  columns: number,
  cell: Size,
  gap: number,
  sheet: Size,
  version: string,
  durations?: number[],
): string {
  if (durations !== undefined && names.length !== durations.length) {
    throw new RangeError('Every item must have a corresponding duration.');
  }

  if (durations !== undefined && (!Number.isInteger(columns) || columns < 1 || columns > names.length)) {
    throw new RangeError('Columns must be between 1 and the number of frames.');
  }

  const frames = Object.fromEntries(
    names.map((name, index) => {
      const frame = {
        x: (index % columns) * (cell.width + gap),
        y: Math.floor(index / columns) * (cell.height + gap),
        w: cell.width,
        h: cell.height,
      };

      const metadata = {
        frame,
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell.width, h: cell.height },
        sourceSize: { w: cell.width, h: cell.height },
      };

      return [name, durations === undefined ? metadata : { ...metadata, duration: durations[index] }];
    }),
  );

  const meta = {
    app: 'https://baipix.app',
    version,
    image,
    format: 'RGBA8888',
    size: { w: sheet.width, h: sheet.height },
    scale: '1',
  };

  return JSON.stringify({ frames, meta }, null, 2);
}
