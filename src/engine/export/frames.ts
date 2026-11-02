import { flattenFrame } from '../composite';
import type { Layer, PixelDoc } from '../document';
import { celOf, DEFAULT_DURATION, frameCount } from '../frames';
import { composeSpriteSheet } from './spriteSheet';

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

  const sheet = composeSpriteSheet(frames, doc.width, doc.height, columns);

  return {
    ...sheet,
    durations: Array.from({ length: count }, (_, index) => doc.frames?.[index].duration ?? DEFAULT_DURATION),
  };
}
