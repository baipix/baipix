import { syncInstances } from '../components';
import type { Rect } from '../math';
import { reframe } from '../outside';
import { extractBlock, fillRect, stampBlock, type PixelBlock } from '../region';
import type { Stroke, Tool } from './types';

interface MoveState {
  block?: PixelBlock;
  cleared?: Uint32Array;
  origin?: Rect;
  /** An instance moves by its position, its pixels coming from the master. */
  instance?: { x: number; y: number };
  /** A master's frame, which moves with its pixels. */
  frame?: Rect;
}

/**
 * Lifts the selection (or the whole layer) on pointer down, then re-stamps it at the new offset. A
 * selection is clipped to the canvas; a whole layer keeps its pixels outside it.
 */
export function beginMove(s: Stroke): void {
  const state: MoveState = {};
  if (s.layer.instance) state.instance = { x: s.layer.instance.x, y: s.layer.instance.y };
  else if (s.selection) {
    const { width, height } = s.doc;
    state.origin = { ...s.selection };
    state.block = extractBlock(s.base, width, height, s.selection);
    state.cleared = s.base.slice();
    fillRect(state.cleared, width, height, s.selection, 0);
    // extractBlock clips to the canvas: keep the origin aligned with the clipped block.
    state.origin.x = Math.max(0, state.origin.x);
    state.origin.y = Math.max(0, state.origin.y);
  }
  if (s.layer.component && !s.selection) state.frame = { ...s.layer.component };
  s.scratch.move = state;
}

export function applyMove(s: Stroke, dx: number, dy: number): void {
  const { width, height } = s.doc;
  const state = s.scratch.move as MoveState;
  if (state.instance && s.layer.instance) {
    s.layer.instance = { ...s.layer.instance, x: state.instance.x + dx, y: state.instance.y + dy };
    syncInstances(s.doc, s.layer.instance.of);
    return;
  }
  if (!state.block || !state.cleared || !state.origin) {
    // The whole layer: what goes off the canvas is kept, and comes back when moved back.
    const r = reframe(s.base, width, height, s.baseOutside, dx, dy, width, height);
    s.layer.pixels.set(r.pixels);
    s.layer.outside = r.outside;
    // A master's frame goes with its drawing, so its instances stay the same.
    if (state.frame) s.layer.component = { ...state.frame, x: state.frame.x + dx, y: state.frame.y + dy };
    return;
  }
  s.layer.pixels.set(state.cleared);
  const x = state.origin.x + dx;
  const y = state.origin.y + dy;
  stampBlock(s.layer.pixels, width, height, state.block, x, y);
  s.setSelection({ x, y, w: state.block.width, h: state.block.height });
}

export const move: Tool = {
  id: 'move',
  editsPixels: true,
  onDown: (s) => beginMove(s),
  onMove: (s, p) => applyMove(s, p.x - s.start.x, p.y - s.start.y),
};
