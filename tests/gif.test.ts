import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { DEFAULT_DURATION } from '../src/engine/frames';
import { detectPixelGrid, downscaleToGrid, gridSize } from '../src/engine/upscale';
import { encodeGif, gifDelay, indexGifFrame, type GifFrame } from '../src/io/gif';
import { decodeGif } from '../src/io/gifDecode';

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

  it('preserves exact colors when a frame has up to 255 opaque colors', () => {
    const colors = Array.from({ length: 255 }, (_, index) => [
      (index >> 16) & 255,
      (index >> 8) & 255,
      index & 255,
    ]);

    const rgba = new Uint8ClampedArray((colors.length + 1) * 4);

    rgba.set([0, 0, 0, 0]);

    colors.forEach(([red, green, blue], index) => {
      rgba.set([red, green, blue, 255], (index + 1) * 4);
    });

    const result = indexGifFrame(rgba);

    expect(result.palette.slice(1)).toEqual(colors);
    expect(Array.from(result.pixels)).toEqual([0, ...colors.map((_, index) => index + 1)]);
  });

  it('quantizes frames with more than 255 opaque colors', () => {
    const colors = Array.from({ length: 256 }, (_, index) => [
      (index >> 16) & 255,
      (index >> 8) & 255,
      index & 255,
    ]);

    const rgba = new Uint8ClampedArray(colors.length * 4);

    colors.forEach(([red, green, blue], index) => {
      rgba.set([red, green, blue, 255], index * 4);
    });

    const result = indexGifFrame(rgba);

    expect(result.palette.length).toBeLessThanOrEqual(256);
    expect(new Set(result.pixels).size).toBeLessThanOrEqual(255);
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

describe('decodeGif', () => {
  it('round-trips animated frames, transparency, and durations encoded by encodeGif', async () => {
    const f1 = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const f2 = new Uint8ClampedArray([0, 0, 0, 0, 0, 255, 0, 255]);
    const f3 = new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 0, 255]);
    const bytes = await encodeGif(
      [
        { rgba: f1, duration: 80 },
        { rgba: f2, duration: 150 },
        { rgba: f3, duration: 220 },
      ],
      2,
      1,
    );

    const decoded = decodeGif(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBe(2);
    expect(decoded!.height).toBe(1);
    expect(decoded!.truncated).toBe(false);
    expect(decoded!.frames.map((f) => f.duration)).toEqual([80, 150, 220]);
    expect(Array.from(decoded!.frames[0].pixels)).toEqual([pack(255, 0, 0), 0]);
    expect(Array.from(decoded!.frames[1].pixels)).toEqual([0, pack(0, 255, 0)]);
    expect(Array.from(decoded!.frames[2].pixels)).toEqual([pack(0, 0, 255), pack(255, 255, 0)]);
  });

  it('recovers pixels across all frames from an 8x upscaled animated GIF', async () => {
    const scale = 8;
    const baseW = 4;
    const baseH = 4;
    const upW = baseW * scale;
    const upH = baseH * scale;
    const makeUpscaled = (c1: [number, number, number], c2: [number, number, number]) => {
      const rgba = new Uint8ClampedArray(upW * upH * 4);
      for (let y = 0; y < upH; y++) {
        for (let x = 0; x < upW; x++) {
          const checker = (Math.floor(x / scale) + Math.floor(y / scale)) % 2 === 0;
          const [r, g, b] = checker ? c1 : c2;
          const i = (y * upW + x) * 4;
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = 255;
        }
      }
      return rgba;
    };

    const bytes = await encodeGif(
      [
        { rgba: makeUpscaled([255, 0, 0], [0, 0, 255]), duration: 120 },
        { rgba: makeUpscaled([0, 255, 0], [255, 255, 0]), duration: 240 },
      ],
      upW,
      upH,
    );

    const decoded = decodeGif(bytes)!;
    const grid = detectPixelGrid(decoded.frames[0].pixels, decoded.width, decoded.height)!;
    expect(grid.scale).toBe(8);
    expect(gridSize(decoded.width, decoded.height, grid)).toEqual({ width: baseW, height: baseH });

    const recovered0 = downscaleToGrid(decoded.frames[0].pixels, decoded.width, decoded.height, grid);
    const recovered1 = downscaleToGrid(decoded.frames[1].pixels, decoded.width, decoded.height, grid);
    expect(recovered0.width).toBe(baseW);
    expect(recovered0.pixels[0]).toBe(pack(255, 0, 0));
    expect(recovered0.pixels[1]).toBe(pack(0, 0, 255));
    expect(recovered1.pixels[0]).toBe(pack(0, 255, 0));
    expect(recovered1.pixels[1]).toBe(pack(255, 255, 0));
    expect(decoded.frames.map((f) => f.duration)).toEqual([120, 240]);
  });

  it('handles 2-color disposal=1 overlays, transparent subframes, and 0-delay fallback', () => {
    // Minimal handcrafted GIF89a 2x1:
    // GCT = [red, green], frame 0 = idx 0 at (0,0) 2x1 disposal=1 (keep), delay=0 (default 100ms)
    // frame 1 = idx 1 over idx 0 (transparent=0) at (1,0) 1x1, delay=5cs (50ms)
    const bytes = new Uint8Array([
      // Header GIF89a
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
      // LSD: 2x1, GCT flag + 1 bit color depth (2 colors), bg=0, aspect=0
      0x02, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
      // GCT: color 0 = red, color 1 = green
      255, 0, 0, 0, 255, 0,
      // GCE 0: disposal 1 (0x04), no transparent, delay=0
      0x21, 0xf9, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00,
      // Image 0: (0,0) 2x1, no LCT
      0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00,
      // LZW minCodeSize=2: clear(4), idx 0, idx 0, EOI(5)
      // bits LSB-first (3-bit codes): 100(4), 000(0), 000(0), 101(5) -> 0b00_101_000_000_100 = 0x00, 0x28?
      // Let's pack: [4]=100 (bits 0..2), [0]=000 (3..5), [0]=000 (6..8 -> bit0 in byte1), [5]=101 (bits 1..3 in byte1)
      // byte0 = 0b00_000_100 = 0x04, byte1 = 0b0000_101_0 = 0x0a
      0x02, 0x02, 0x04, 0x0a, 0x00,
      // GCE 1: disposal 3, transparent=1 index 0, delay=5cs (50ms)
      0x21, 0xf9, 0x04, 0x0d, 0x05, 0x00, 0x00, 0x00,
      // Image 1: (1,0) 1x1, no LCT
      0x2c, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      // LZW minCodeSize=2: clear(4), idx 1, EOI(5)
      // byte0 = 0b00_001_100 = 0x0c, byte1 = 0b0000_0101 = 0x05? Wait: bit8 is LSB of 5(1), then 0, 1:
      // 3 bits clear(4)=100 (0..2), idx(1)=001 (3..5), eoi(5)=101 (6..8 -> bits 6,7=01, bit0 byte1=1)
      // byte0 = (1<<6) | (1<<3) | 4 = 0x40 | 0x08 | 0x04 = 0x4c, byte1 = 0x01
      0x02, 0x02, 0x4c, 0x01, 0x00,
      // Trailer
      0x3b,
    ]);

    const decoded = decodeGif(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.frames).toHaveLength(2);
    expect(decoded!.frames[0].duration).toBe(DEFAULT_DURATION);
    expect(Array.from(decoded!.frames[0].pixels)).toEqual([pack(255, 0, 0), pack(255, 0, 0)]);
    expect(decoded!.frames[1].duration).toBe(50);
    expect(Array.from(decoded!.frames[1].pixels)).toEqual([pack(255, 0, 0), pack(0, 255, 0)]);
  });

  it('returns null for non-GIF input', () => {
    expect(decodeGif(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it('truncates frames when the pixel budget is exceeded', async () => {
    const f1 = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const f2 = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 0, 0]);
    const f3 = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 0, 0]);
    const bytes = await encodeGif(
      [
        { rgba: f1, duration: 100 },
        { rgba: f2, duration: 100 },
        { rgba: f3, duration: 100 },
      ],
      2,
      1,
    );

    const decoded = decodeGif(bytes, { maxTotalPixels: 4 })!;
    expect(decoded.frames).toHaveLength(2);
    expect(decoded.truncated).toBe(true);
  });

  it('shrinks frames as decoded when dimensions exceed maxSide', async () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba.fill(255);
    const bytes = await encodeGif([{ rgba, duration: 100 }], 4, 4);

    const decoded = decodeGif(bytes, { maxSide: 2 })!;
    expect(decoded.shrunk).toBe(true);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.originalWidth).toBe(4);
    expect(decoded.originalHeight).toBe(4);
    expect(decoded.frames[0].pixels.length).toBe(4);
  });
});
