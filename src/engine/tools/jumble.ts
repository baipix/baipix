import { inSelection } from '../selection';
import type { Point } from '../math';
import { followPointer, inBounds, mirrorsOf } from './paint';
import type { Stroke, Tool } from './types';

/**
 * Shuffles the pixels already under the brush (a square of `jumbleSize`) by swapping random pairs:
 * texture for foliage, rock or noise, without adding any color. Each step of the pointer jumbles once,
 * and holding still keeps going (the canvas repeats the last position). Mirrored copies get the
 * matching swaps, so symmetry is kept.
 */
function jumble(s: Stroke, p: Point, random: () => number = Math.random): void {
  const size = s.options.jumbleSize;
  const o = Math.floor((size - 1) / 2);
  const swaps = Math.max(1, Math.round(size * size * 0.1 * s.options.jumbleStrength));
  const { width } = s.doc;
  const usable = (x: number, y: number) => inBounds(s, x, y) && inSelection(s.selection, x, y);
  for (let k = 0; k < swaps; k++) {
    const ax = p.x - o + Math.floor(random() * size);
    const ay = p.y - o + Math.floor(random() * size);
    const bx = p.x - o + Math.floor(random() * size);
    const by = p.y - o + Math.floor(random() * size);
    const as = mirrorsOf(s, ax, ay);
    const bs = mirrorsOf(s, bx, by);
    for (let m = 0; m < as.length; m++) {
      const a = as[m];
      const b = bs[m];
      if (!usable(a.x, a.y) || !usable(b.x, b.y)) continue;
      const i = a.y * width + a.x;
      const j = b.y * width + b.x;
      const c = s.layer.pixels[i];
      s.layer.pixels[i] = s.layer.pixels[j];
      s.layer.pixels[j] = c;
    }
  }
}

export const jumbleTool: Tool = {
  id: 'jumble',
  editsPixels: true,
  onDown: (s, p) => jumble(s, p),
  onMove: (s, p) => {
    if (p.x === s.last.x && p.y === s.last.y) jumble(s, p);
    else followPointer(s, p, (q) => jumble(s, q));
  },
};
