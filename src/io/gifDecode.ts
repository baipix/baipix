import { pack } from '../engine/color';
import { clampDuration, DEFAULT_DURATION, MAX_FRAMES } from '../engine/frames';

export interface DecodedGifFrame {
  pixels: Uint32Array;
  duration: number;
}

export interface DecodedGif {
  width: number;
  height: number;
  frames: DecodedGifFrame[];
  truncated: boolean;
}

const MAX_GIF_SIDE = 4096;
const INTERLACE_STARTS = [0, 4, 2, 1];
const INTERLACE_STEPS = [8, 8, 4, 2];

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readColorTable(
  bytes: Uint8Array,
  offset: number,
  count: number,
): { table: Uint32Array; next: number } | null {
  const end = offset + count * 3;
  if (end > bytes.length) return null;
  const table = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const p = offset + i * 3;
    table[i] = pack(bytes[p], bytes[p + 1], bytes[p + 2], 255);
  }
  return { table, next: end };
}

function readSubBlocks(bytes: Uint8Array, start: number): { data: Uint8Array; next: number } {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let pos = start;
  while (pos < bytes.length) {
    const size = bytes[pos++];
    if (size === 0) break;
    const end = Math.min(pos + size, bytes.length);
    const slice = bytes.subarray(pos, end);
    chunks.push(slice);
    total += slice.length;
    pos = end;
  }
  const data = new Uint8Array(total);
  let out = 0;
  for (const chunk of chunks) {
    data.set(chunk, out);
    out += chunk.length;
  }
  return { data, next: pos };
}

function skipSubBlocks(bytes: Uint8Array, start: number): number {
  let pos = start;
  while (pos < bytes.length) {
    const size = bytes[pos++];
    if (size === 0) break;
    pos = Math.min(pos + size, bytes.length);
  }
  return pos;
}

function decodeLzw(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array | null {
  if (minCodeSize < 1 || minCodeSize > 8) return null;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4096);
  const output = new Uint8Array(pixelCount);

  let codeSize = minCodeSize + 1;
  let codeMask = (1 << codeSize) - 1;
  let nextCode = eoiCode + 1;
  let oldCode = -1;
  let firstChar = 0;

  let bitPos = 0;
  let bits = 0;
  let bitCount = 0;
  let outIndex = 0;

  const resetTable = () => {
    codeSize = minCodeSize + 1;
    codeMask = (1 << codeSize) - 1;
    nextCode = eoiCode + 1;
    oldCode = -1;
  };

  while (outIndex < pixelCount) {
    while (bitCount < codeSize) {
      if (bitPos >= data.length) return output;
      bits |= data[bitPos++] << bitCount;
      bitCount += 8;
    }
    const code = bits & codeMask;
    bits >>>= codeSize;
    bitCount -= codeSize;

    if (code === clearCode) {
      resetTable();
      continue;
    }
    if (code === eoiCode) break;

    if (oldCode === -1) {
      if (code < clearCode) {
        output[outIndex++] = code;
        firstChar = code;
        oldCode = code;
      }
      continue;
    }

    let inCode = code;
    let stackLen = 0;
    if (code >= nextCode) {
      if (code > nextCode) break;
      stack[stackLen++] = firstChar;
      inCode = oldCode;
    }

    while (inCode >= clearCode && stackLen < 4096) {
      stack[stackLen++] = suffix[inCode];
      inCode = prefix[inCode];
    }
    firstChar = inCode & 0xff;
    stack[stackLen++] = firstChar;

    for (let i = stackLen - 1; i >= 0 && outIndex < pixelCount; i--) {
      output[outIndex++] = stack[i];
    }

    if (nextCode < 4096) {
      prefix[nextCode] = oldCode;
      suffix[nextCode] = firstChar;
      nextCode++;
      if (nextCode > codeMask && codeSize < 12) {
        codeSize++;
        codeMask = (1 << codeSize) - 1;
      }
    }
    oldCode = code;
  }

  return output;
}

/** Decodes GIF87a/GIF89a bytes into composited RGBA frames and clamped millisecond durations. */
export function decodeGif(bytes: Uint8Array): DecodedGif | null {
  if (bytes.length < 13) return null;
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;

  const width = readU16(bytes, 6);
  const height = readU16(bytes, 8);
  if (width < 1 || height < 1 || width > MAX_GIF_SIDE || height > MAX_GIF_SIDE) return null;

  const packed = bytes[10];
  let pos = 13;
  let globalTable: Uint32Array | null = null;
  if ((packed & 0x80) !== 0) {
    const read = readColorTable(bytes, pos, 1 << ((packed & 0x07) + 1));
    if (!read) return null;
    globalTable = read.table;
    pos = read.next;
  }

  const canvas = new Uint32Array(width * height);
  const frames: DecodedGifFrame[] = [];
  let truncated = false;

  let disposal = 0;
  let hasTransparent = false;
  let transparentIndex = 0;
  let delayCs = 0;

  while (pos < bytes.length) {
    const marker = bytes[pos++];
    if (marker === 0x3b) break;

    if (marker === 0x21) {
      if (pos >= bytes.length) break;
      const label = bytes[pos++];
      if (label === 0xf9 && pos < bytes.length) {
        const size = bytes[pos++];
        if (size >= 4 && pos + 4 <= bytes.length) {
          const gcePacked = bytes[pos];
          disposal = (gcePacked >> 2) & 0x07;
          hasTransparent = (gcePacked & 0x01) !== 0;
          delayCs = readU16(bytes, pos + 1);
          transparentIndex = bytes[pos + 3];
        }
        pos = skipSubBlocks(bytes, Math.min(pos + size, bytes.length));
      } else {
        pos = skipSubBlocks(bytes, pos);
      }
      continue;
    }

    if (marker !== 0x2c) break;
    if (pos + 9 > bytes.length) break;

    const left = readU16(bytes, pos);
    const top = readU16(bytes, pos + 2);
    const frameW = readU16(bytes, pos + 4);
    const frameH = readU16(bytes, pos + 6);
    const imgPacked = bytes[pos + 8];
    pos += 9;

    const interlaced = (imgPacked & 0x40) !== 0;
    let colorTable = globalTable;
    if ((imgPacked & 0x80) !== 0) {
      const read = readColorTable(bytes, pos, 1 << ((imgPacked & 0x07) + 1));
      if (!read) break;
      colorTable = read.table;
      pos = read.next;
    }

    if (pos >= bytes.length) break;
    const minCodeSize = bytes[pos++];
    const { data, next } = readSubBlocks(bytes, pos);
    pos = next;

    if (!colorTable) return null;
    if (frameW > MAX_GIF_SIDE || frameH > MAX_GIF_SIDE) return null;

    if (frames.length >= MAX_FRAMES) {
      truncated = true;
      break;
    }

    const prevCanvas = disposal === 3 ? canvas.slice() : null;
    const indices =
      frameW > 0 && frameH > 0 ? decodeLzw(data, minCodeSize, frameW * frameH) : new Uint8Array(0);
    if (!indices) return null;

    let srcRow = 0;
    const drawRow = (iy: number) => {
      const y = top + iy;
      if (y >= height) {
        srcRow++;
        return;
      }
      const rowOffset = srcRow * frameW;
      const dstOffset = y * width;
      const maxX = Math.min(frameW, width - left);
      for (let ix = 0; ix < maxX; ix++) {
        const index = indices[rowOffset + ix];
        if (hasTransparent && index === transparentIndex) continue;
        canvas[dstOffset + left + ix] = index < colorTable.length ? colorTable[index] : 0;
      }
      srcRow++;
    };

    if (interlaced) {
      for (let pass = 0; pass < 4; pass++) {
        for (let iy = INTERLACE_STARTS[pass]; iy < frameH; iy += INTERLACE_STEPS[pass]) {
          drawRow(iy);
        }
      }
    } else {
      for (let iy = 0; iy < frameH; iy++) {
        drawRow(iy);
      }
    }

    frames.push({
      pixels: canvas.slice(),
      duration: delayCs === 0 ? DEFAULT_DURATION : clampDuration(delayCs * 10),
    });

    if (disposal === 2) {
      const xEnd = Math.min(width, left + frameW);
      const yEnd = Math.min(height, top + frameH);
      for (let y = Math.max(0, top); y < yEnd; y++) {
        canvas.fill(0, y * width + Math.max(0, left), y * width + xEnd);
      }
    } else if (disposal === 3 && prevCanvas) {
      canvas.set(prevCanvas);
    }

    disposal = 0;
    hasTransparent = false;
    transparentIndex = 0;
    delayCs = 0;
  }

  return frames.length ? { width, height, frames, truncated } : null;
}
