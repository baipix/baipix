import { flattenFrame } from '../composite';
import type { Layer, PixelDoc } from '../document';
import { celOf, DEFAULT_DURATION, frameCount } from '../frames';
import { spriteSheetGrid } from './spriteSheet';

interface Size {
  width: number;
  height: number;
}

export interface FrameSpriteSheetOptions {
  /** Include the board's background in every frame. */
  includeBackground?: boolean;
  /** Export only this layer, across all animation frames. */
  onlyLayer?: Layer;
}

export interface FrameSpriteSheet {
  pixels: Uint32Array;
  width: number;
  height: number;
  columns: number;
  rows: number;
  durations: number[];
}

/**
 * Places frame pixel buffers on a grid, left to right and top to bottom.
 * Cells left after the last frame remain transparent.
 */
export function composeFrameSpriteSheet(
  frames: readonly Uint32Array[],
  width: number,
  height: number,
  columns: number | null = null,
) {
  const grid = spriteSheetGrid(frames.length, columns, width, height);
  const frameSize = width * height;

  if (frames.some((pixels) => pixels.length !== frameSize)) {
    throw new RangeError('Frame pixel buffer does not match document dimensions.');
  }

  const pixels = new Uint32Array(grid.width * grid.height);

  frames.forEach((frame, index) => {
    const left = (index % grid.columns) * width;
    const top = Math.floor(index / grid.columns) * height;

    for (let y = 0; y < height; y++) {
      pixels.set(frame.subarray(y * width, (y + 1) * width), (top + y) * grid.width + left);
    }
  });

  return {
    pixels,
    ...grid,
  };
}

/**
 * Builds a sprite sheet from the board's animation frames.
 * Frame order and individual durations are preserved.
 */
export function frameSpriteSheet(
  doc: PixelDoc,
  columns: number | null = null,
  options: FrameSpriteSheetOptions = {},
): FrameSpriteSheet {
  const count = frameCount(doc);

  // Render every frame independently without changing the active frame.
  const frames = Array.from({ length: count }, (_, index) => {
    const layer = options.onlyLayer
      ? {
          ...options.onlyLayer,
          pixels: celOf(doc, options.onlyLayer, index).pixels,
        }
      : undefined;

    return flattenFrame(doc, index, {
      includeBackground: options.includeBackground ?? false,
      ...(layer && { onlyLayer: layer }),
    });
  });

  const sheet = composeFrameSpriteSheet(frames, doc.width, doc.height, columns);

  return {
    ...sheet,
    durations: Array.from({ length: count }, (_, index) => doc.frames?.[index].duration ?? DEFAULT_DURATION),
  };
}

/**
 * Generates Aseprite / TexturePacker JSON Hash metadata.
 * Frame coordinates and dimensions are expressed in exported pixels.
 */
export function frameSpriteSheetJson(
  image: string,
  names: string[],
  durations: number[],
  columns: number,
  cell: Size,
  gap: number,
  sheet: Size,
  version: string,
): string {
  if (names.length !== durations.length) {
    throw new RangeError('Every frame must have a corresponding duration.');
  }

  if (!Number.isInteger(columns) || columns < 1 || columns > names.length) {
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

      return [
        name,
        {
          frame,
          rotated: false,
          trimmed: false,
          spriteSourceSize: {
            x: 0,
            y: 0,
            w: cell.width,
            h: cell.height,
          },
          sourceSize: {
            w: cell.width,
            h: cell.height,
          },
          duration: durations[index],
        },
      ];
    }),
  );

  const meta = {
    app: 'https://baipix.app',
    version,
    image,
    format: 'RGBA8888',
    size: {
      w: sheet.width,
      h: sheet.height,
    },
    scale: '1',
  };

  return JSON.stringify({ frames, meta }, null, 2);
}
