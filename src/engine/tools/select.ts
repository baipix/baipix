import { clamp, rectFromPoints, type Point } from '../math';
import { colorMask, combine, polygonMask, type SelectMode, type Selection } from '../selection';
import type { Modifiers, Stroke, Tool } from './types';

const clampToCanvas = (s: Stroke, p: Point): Point => ({
  x: clamp(p.x, 0, s.doc.width - 1),
  y: clamp(p.y, 0, s.doc.height - 1),
});

/** Shift adds to the selection there is, Alt takes from it; otherwise a new one replaces it. */
const modeOf = (mods: Modifiers): SelectMode =>
  mods.shift ? 'add' : mods.duplicate ? 'subtract' : 'replace';

/** Sets the selection to `mask` combined with the one the gesture started from. */
function apply(s: Stroke, mask: Uint8Array) {
  const { width, height } = s.doc;
  s.setSelection(
    combine(s.scratch.before as Selection | null, mask, s.scratch.mode as SelectMode, width, height),
  );
}

const begin = (s: Stroke, mods: Modifiers) => {
  s.scratch.before = s.selection;
  s.scratch.mode = modeOf(mods);
  s.scratch.moved = false;
};

/** A click without a drag lets go of the selection, unless it was adding or taking away. */
const endClick = (s: Stroke) => {
  if (!s.scratch.moved && s.scratch.mode === 'replace') s.setSelection(null);
};

export const select: Tool = {
  id: 'select',
  editsPixels: false,
  onDown(s, p, mods) {
    begin(s, mods);
    s.scratch.origin = clampToCanvas(s, p);
  },
  onMove(s, p) {
    const origin = s.scratch.origin as Point;
    const q = clampToCanvas(s, p);
    if (q.x !== origin.x || q.y !== origin.y) s.scratch.moved = true;
    if (!s.scratch.moved) return;
    const rect = rectFromPoints(origin, q);
    if (s.scratch.mode === 'replace') return s.setSelection(rect);
    const { width, height } = s.doc;
    const mask = new Uint8Array(width * height);
    for (let y = rect.y; y < rect.y + rect.h; y++)
      mask.fill(1, y * width + rect.x, y * width + rect.x + rect.w);
    apply(s, mask);
  },
  onUp: endClick,
};

/** Draw around what to select; the path closes itself on release. */
export const lassoSelect: Tool = {
  id: 'lassoSelect',
  editsPixels: false,
  onDown(s, p, mods) {
    begin(s, mods);
    s.scratch.path = [clampToCanvas(s, p)];
  },
  onMove(s, p) {
    const path = s.scratch.path as Point[];
    const q = clampToCanvas(s, p);
    const last = path[path.length - 1];
    if (q.x === last.x && q.y === last.y) return;
    path.push(q);
    s.scratch.moved = true;
    apply(s, polygonMask(path, s.doc.width, s.doc.height));
  },
  onUp: endClick,
};

/** Click a color: its area (or every pixel of that color) gets selected. */
export const wand: Tool = {
  id: 'wand',
  editsPixels: false,
  onDown(s, p, mods) {
    begin(s, mods);
    if (p.x < 0 || p.y < 0 || p.x >= s.doc.width || p.y >= s.doc.height) {
      if (s.scratch.mode === 'replace') s.setSelection(null);
      return;
    }
    const { width, height } = s.doc;
    apply(s, colorMask(s.base, width, height, p.x, p.y, s.options.wandContiguous));
  },
  onMove() {},
};
