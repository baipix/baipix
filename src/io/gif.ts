import { applyPalette, GIFEncoder, quantize } from 'gifenc';

const MAX_GIF_COLORS = 256;
const MAX_OPAQUE_COLORS = MAX_GIF_COLORS - 1;
const TRANSPARENT_INDEX = 0;
const GIF_DELAY_MS = 10;

const TRANSPARENT_COLOR = [0, 0, 0];

export interface GifFrame {
  rgba: Uint8ClampedArray;
  duration: number;
}

/** GIF stores frame durations in hundredths of a second. */
export function gifDelay(duration: number): number {
  if (!Number.isFinite(duration)) {
    throw new RangeError('GIF frame duration must be a finite number.');
  }

  return Math.max(GIF_DELAY_MS, Math.round(duration / GIF_DELAY_MS) * GIF_DELAY_MS);
}

/** Collects opaque pixels and keeps their positions in the original frame. */
function opaquePixelsOf(rgba: Uint8ClampedArray): {
  pixels: Uint8Array;
  positions: Uint32Array;
} {
  let count = 0;

  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 0) count++;
  }

  const pixels = new Uint8Array(count * 4);
  const positions = new Uint32Array(count);

  let pixelIndex = 0;

  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;

    const offset = pixelIndex * 4;

    pixels[offset] = rgba[i];
    pixels[offset + 1] = rgba[i + 1];
    pixels[offset + 2] = rgba[i + 2];
    pixels[offset + 3] = 255;

    positions[pixelIndex] = i / 4;
    pixelIndex++;
  }

  return { pixels, positions };
}

/** Maps an RGBA frame to GIF palette indexes, reserving index 0 for transparency. */
export function indexGifFrame(rgba: Uint8ClampedArray): {
  pixels: Uint8Array;
  palette: number[][];
} {
  const { pixels: opaquePixels, positions } = opaquePixelsOf(rgba);

  const exactPalette: number[][] = [];
  const colorIndexes = new Map<number, number>();
  const exactIndexes = new Uint8Array(positions.length);

  let needsQuantization = false;

  for (let i = 0; i < opaquePixels.length; i += 4) {
    const red = opaquePixels[i];
    const green = opaquePixels[i + 1];
    const blue = opaquePixels[i + 2];

    const color = (red << 16) | (green << 8) | blue;

    let index = colorIndexes.get(color);

    if (index === undefined) {
      if (exactPalette.length === MAX_OPAQUE_COLORS) {
        needsQuantization = true;
        break;
      }

      index = exactPalette.length;
      colorIndexes.set(color, index);
      exactPalette.push([red, green, blue]);
    }

    exactIndexes[i / 4] = index;
  }

  let opaquePalette: number[][];

  if (needsQuantization) {
    opaquePalette = quantize(opaquePixels, MAX_OPAQUE_COLORS);
  } else if (exactPalette.length > 0) {
    opaquePalette = exactPalette;
  } else {
    opaquePalette = [TRANSPARENT_COLOR];
  }

  const opaqueIndexes = needsQuantization ? applyPalette(opaquePixels, opaquePalette) : exactIndexes;

  const pixels = new Uint8Array(rgba.length / 4);

  for (let i = 0; i < positions.length; i++) {
    pixels[positions[i]] = opaqueIndexes[i] + 1;
  }

  return {
    pixels,
    palette: [TRANSPARENT_COLOR, ...opaquePalette],
  };
}

const yieldToBrowser = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Encodes complete RGBA frames into an infinitely looping animated GIF. */
export async function encodeGif(
  frames: Iterable<GifFrame>,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('GIF dimensions must be positive integers.');
  }

  const expectedLength = width * height * 4;
  const encoder = GIFEncoder();

  let frameIndex = 0;

  for (const frame of frames) {
    if (frame.rgba.length !== expectedLength) {
      throw new RangeError('GIF frame dimensions do not match the image dimensions.');
    }

    const { pixels, palette } = indexGifFrame(frame.rgba);

    encoder.writeFrame(pixels, width, height, {
      palette,
      transparent: true,
      transparentIndex: TRANSPARENT_INDEX,
      delay: gifDelay(frame.duration),
      dispose: 2,
      ...(frameIndex === 0 && { repeat: 0 }),
    });

    frameIndex++;

    await yieldToBrowser();
  }

  if (frameIndex === 0) {
    throw new Error('Cannot encode a GIF without frames.');
  }

  encoder.finish();

  return encoder.bytes();
}
