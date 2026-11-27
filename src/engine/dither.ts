/**
 * Dithering patterns: where a dithered stroke or fill uses its second color instead of the first.
 * Decided from the canvas position, so strokes, fills and mirrored copies line up.
 */
export type DitherPattern = 'checker' | 'dots' | 'dense' | 'linesH' | 'linesV' | 'diagonal';

export const DITHER_PATTERNS: DitherPattern[] = ['checker', 'dots', 'dense', 'linesH', 'linesV', 'diagonal'];

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The 4×4 Bayer matrix: the order in which a block's 16 pixels fill in, evenly spread at every step. */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Whether (x, y) is among the first `level` of the 16 pixels of its 4×4 block to fill in. */
export const bayerOn = (level: number, x: number, y: number): boolean => BAYER[(y & 3) * 4 + (x & 3)] < level;

export function ditherSecond(pattern: DitherPattern, x: number, y: number): boolean {
  switch (pattern) {
    case 'dots': // 1 in 4
      return (x & 1) === 1 && (y & 1) === 1;
    case 'dense': // 3 in 4
      return ((x | y) & 1) === 1;
    case 'linesH':
      return (y & 1) === 1;
    case 'linesV':
      return (x & 1) === 1;
    case 'diagonal': // 1 in 3, along a diagonal
      return mod(x - y, 3) === 0;
    default: // checkerboard, 1 in 2
      return ((x + y) & 1) === 1;
  }
}
