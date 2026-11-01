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

/** Makes every non-transparent pixel opaque and clears transparent RGB values. */
function opaquePixelsOf(rgba: Uint8ClampedArray): Uint8Array {
  const pixels = new Uint8Array(rgba.length);

  for (let i = 0; i < rgba.length; i += 4) {
    const transparent = rgba[i + 3] === 0;

    pixels[i] = transparent ? 0 : rgba[i];
    pixels[i + 1] = transparent ? 0 : rgba[i + 1];
    pixels[i + 2] = transparent ? 0 : rgba[i + 2];
    pixels[i + 3] = 255;
  }

  return pixels;
}

/** Maps an RGBA frame to GIF palette indexes, reserving index 0 for transparency. */
export function indexGifFrame(rgba: Uint8ClampedArray): { pixels: Uint8Array; palette: number[][] } {
  const opaquePixels = opaquePixelsOf(rgba);
  const opaquePalette = quantize(opaquePixels, MAX_OPAQUE_COLORS);
  const pixels = applyPalette(opaquePixels, opaquePalette);

  for (let i = 0; i < pixels.length; i++) {
    if (rgba[i * 4 + 3] === 0) {
      pixels[i] = TRANSPARENT_INDEX;
    } else {
      pixels[i]++;
    }
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
