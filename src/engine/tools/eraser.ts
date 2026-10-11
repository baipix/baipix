import { followPointer, stamp, straightLine } from './paint';
import type { Tool } from './types';

export const eraser: Tool = {
  id: 'eraser',
  editsPixels: true,
  onDown: (s, p, mods) => {
    if (!straightLine(s, p, !!mods.snap, (q) => stamp(s, q.x, q.y, 0))) stamp(s, p.x, p.y, 0);
  },
  onMove: (s, p) => followPointer(s, p, (q) => stamp(s, q.x, q.y, 0)),
};
