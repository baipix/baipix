import { describe, expect, it } from 'vitest';
import { encodeGif, gifDelay, indexGifFrame, type GifFrame } from '../src/io/gif';

interface FrameControl {
  delay: number;
  disposal: number;
  transparent: boolean;
  transparentIndex: number;
}

interface GifMetadata {
  loopCount: number | null;
  controls: FrameControl[];
}

function readSubBlocks(bytes: Uint8Array, offset: number): { data: Uint8Array; offset: number } {
  const blocks: number[] = [];

  while (true) {
    const size = bytes[offset++];

    if (size === 0) break;

    for (let i = 0; i < size; i++) {
      blocks.push(bytes[offset++]);
    }
  }

  return {
    data: Uint8Array.from(blocks),
    offset,
  };
}

/** Reads GIF loop and graphic control extensions without decoding image pixels. */
function readGifMetadata(bytes: Uint8Array): GifMetadata {
  let offset = 13;
  let loopCount: number | null = null;

  const controls: FrameControl[] = [];
  const screenPacked = bytes[10];

  if (screenPacked & 0x80) {
    offset += 3 * (1 << ((screenPacked & 0x07) + 1));
  }

  while (offset < bytes.length) {
    const marker = bytes[offset++];

    if (marker === 0x3b) break;

    if (marker === 0x21) {
      const label = bytes[offset++];

      if (label === 0xf9) {
        const blockSize = bytes[offset++];

        if (blockSize !== 4) {
          throw new Error('Invalid GIF graphic control extension.');
        }

        const packed = bytes[offset++];
        const delay = bytes[offset] | (bytes[offset + 1] << 8);
        offset += 2;

        const transparentIndex = bytes[offset++];

        offset++; // Block terminator.

        controls.push({
          delay,
          disposal: (packed >> 2) & 0x07,
          transparent: (packed & 0x01) !== 0,
          transparentIndex,
        });

        continue;
      }

      if (label === 0xff) {
        const blockSize = bytes[offset++];

        const application = String.fromCharCode(...bytes.subarray(offset, offset + blockSize));

        offset += blockSize;

        const result = readSubBlocks(bytes, offset);
        offset = result.offset;

        if (application === 'NETSCAPE2.0' && result.data[0] === 1) {
          loopCount = result.data[1] | (result.data[2] << 8);
        }

        continue;
      }

      offset = readSubBlocks(bytes, offset).offset;
      continue;
    }

    if (marker === 0x2c) {
      offset += 8;
      const packed = bytes[offset++];

      if (packed & 0x80) {
        offset += 3 * (1 << ((packed & 0x07) + 1));
      }

      offset++; // LZW minimum code size.
      offset = readSubBlocks(bytes, offset).offset;

      continue;
    }

    throw new Error(`Unexpected GIF block marker: ${marker}`);
  }

  return { loopCount, controls };
}

const pixel = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a]);

const frame = (rgba: Uint8ClampedArray, duration: number): GifFrame => ({
  rgba,
  duration,
});

describe('gifDelay', () => {
  it('rounds durations to hundredths of a second', () => {
    expect(gifDelay(105)).toBe(110);
    expect(gifDelay(104)).toBe(100);
    expect(gifDelay(100)).toBe(100);
  });

  it('keeps the minimum GIF frame delay', () => {
    expect(gifDelay(0)).toBe(10);
    expect(gifDelay(5)).toBe(10);
  });
});

describe('indexGifFrame', () => {
  it('reserves palette index 0 for transparent pixels', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255]);

    const result = indexGifFrame(rgba);

    expect(result.palette[0]).toEqual([0, 0, 0]);
    expect(result.pixels[0]).toBe(0);
    expect(result.pixels[1]).toBeGreaterThan(0);
  });

  it('makes semi-transparent pixels opaque', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 1, 0, 255, 0, 128, 0, 0, 255, 255]);

    const result = indexGifFrame(rgba);

    expect(result.pixels.every((index) => index > 0)).toBe(true);
  });
});

describe('encodeGif', () => {
  it('encodes a valid GIF with infinite looping', async () => {
    const bytes = await encodeGif([frame(pixel(255, 0, 0), 100)], 1, 1);

    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a');

    const metadata = readGifMetadata(bytes);

    expect(metadata.loopCount).toBe(0);
    expect(metadata.controls).toHaveLength(1);
  });

  it('preserves each frame duration', async () => {
    const frames = [frame(pixel(255, 0, 0), 105), frame(pixel(0, 255, 0), 104), frame(pixel(0, 0, 255), 250)];

    const bytes = await encodeGif(frames, 1, 1);
    const metadata = readGifMetadata(bytes);

    expect(metadata.controls.map((control) => control.delay)).toEqual([11, 10, 25]);
  });

  it('enables transparency and clears the previous frame', async () => {
    const frames = [frame(pixel(255, 0, 0), 100), frame(pixel(0, 0, 0, 0), 100)];

    const bytes = await encodeGif(frames, 1, 1);
    const metadata = readGifMetadata(bytes);

    expect(metadata.controls).toHaveLength(2);

    for (const control of metadata.controls) {
      expect(control.transparent).toBe(true);
      expect(control.transparentIndex).toBe(0);
      expect(control.disposal).toBe(2);
    }
  });

  it('rejects an empty animation', async () => {
    await expect(encodeGif([], 1, 1)).rejects.toThrow('Cannot encode a GIF without frames.');
  });

  it('rejects frames with incorrect dimensions', async () => {
    await expect(encodeGif([frame(pixel(255, 0, 0), 100)], 2, 2)).rejects.toThrow(
      'GIF frame dimensions do not match the image dimensions.',
    );
  });

  it('rejects invalid image dimensions', async () => {
    await expect(encodeGif([], 0, 1)).rejects.toThrow('GIF dimensions must be positive integers.');
  });
});
