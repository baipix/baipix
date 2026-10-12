import type { Tool } from './types';

/**
 * The board tool: drawing a rectangle beside the boards adds one, dragging a board's name moves it.
 * It works on the file's layout, not on pixels: the canvas view handles it (see CanvasView).
 */
export const board: Tool = {
  id: 'board',
  editsPixels: false,
  onDown: () => {},
  onMove: () => {},
};
