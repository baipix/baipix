import { inSelection } from '../selection';
import { ditherSecond } from '../dither';
import { floodFill } from '../raster';
import { inBounds, mirrorsOf, strokeColors } from './paint';
import type { Tool } from './types';

export const bucket: Tool = {
  id: 'bucket',
  editsPixels: true,
  paintsColor: true,
  onDown(s, p) {
    const { width, height } = s.doc;
    const [c1, c2] = strokeColors(s);
    const dither = s.options.dither;
    const paint = (i: number) => {
      const x = i % width;
      const y = (i / width) | 0;
      s.layer.pixels[i] = dither && ditherSecond(s.options.ditherPattern, x, y) ? c2 : c1;
    };
    // Clicked in a selection: the whole selection fills, whatever its colors (a magic wand's, say).
    if (s.selection && inSelection(s.selection, p.x, p.y)) {
      for (let i = 0; i < s.base.length; i++)
        if (inSelection(s.selection, i % width, (i / width) | 0)) paint(i);
      return;
    }
    for (const m of mirrorsOf(s, p.x, p.y)) {
      if (!inBounds(s, m.x, m.y) || !inSelection(s.selection, m.x, m.y)) continue;
      if (s.options.contiguous) {
        floodFill(
          s.base,
          width,
          height,
          m.x,
          m.y,
          paint,
          (x, y) => inSelection(s.selection, x, y),
          s.visited,
        );
      } else {
        const target = s.base[m.y * width + m.x];
        for (let i = 0; i < s.base.length; i++) {
          if (s.base[i] === target && inSelection(s.selection, i % width, (i / width) | 0)) paint(i);
        }
      }
    }
  },
  onMove() {},
};
