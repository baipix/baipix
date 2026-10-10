import type { ToolId } from '../engine/tools';
import type { MessageKey } from '../i18n';
import type { IconName } from './icons';

export interface ToolMeta {
  id: ToolId;
  icon: IconName;
  label: MessageKey;
  /** Single-key shortcut, or '' for tools reached from a menu only. */
  shortcut: string;
}

/** Shape tools share one toolbar button with a menu. */
export const SHAPES: ToolMeta[] = [
  { id: 'line', icon: 'line', label: 'tool.line', shortcut: 'L' },
  { id: 'rect', icon: 'rect', label: 'tool.rect', shortcut: 'R' },
  { id: 'roundRect', icon: 'roundRect', label: 'tool.roundRect', shortcut: '' },
  { id: 'ellipse', icon: 'ellipse', label: 'tool.ellipse', shortcut: 'C' },
  { id: 'triangle', icon: 'triangle', label: 'tool.triangle', shortcut: '' },
  { id: 'star', icon: 'star', label: 'tool.star', shortcut: '' },
  { id: 'heart', icon: 'heart', label: 'tool.heart', shortcut: '' },
];
export const SHAPE_IDS: ToolId[] = SHAPES.map((s) => s.id);

/** Toolbar layout: groups are separated by a divider; `SHAPES` renders as a single menu button. */
export const TOOL_GROUPS: ToolMeta[][] = [
  [
    { id: 'move', icon: 'move', label: 'tool.move', shortcut: 'V' },
    { id: 'select', icon: 'select', label: 'tool.select', shortcut: 'M' },
    { id: 'hand', icon: 'hand', label: 'tool.hand', shortcut: 'H' },
  ],
  [
    { id: 'pencil', icon: 'pencil', label: 'tool.pencil', shortcut: 'B' },
    { id: 'lassoFill', icon: 'lassoFill', label: 'tool.lassoFill', shortcut: 'K' },
    { id: 'eraser', icon: 'eraser', label: 'tool.eraser', shortcut: 'E' },
    { id: 'bucket', icon: 'bucket', label: 'tool.bucket', shortcut: 'G' },
    { id: 'gradient', icon: 'gradient', label: 'tool.gradient', shortcut: 'D' },
  ],
  SHAPES,
  [
    { id: 'shade', icon: 'shade', label: 'tool.shade', shortcut: 'S' },
    { id: 'lighten', icon: 'lighten', label: 'tool.lighten', shortcut: 'O' },
    { id: 'blur', icon: 'blur', label: 'tool.blur', shortcut: 'F' },
    { id: 'spray', icon: 'spray', label: 'tool.spray', shortcut: 'A' },
    { id: 'jumble', icon: 'jumble', label: 'tool.jumble', shortcut: 'J' },
    { id: 'liquify', icon: 'liquify', label: 'tool.liquify', shortcut: 'W' },
    { id: 'picker', icon: 'picker', label: 'tool.picker', shortcut: 'I' },
  ],
];

export const TOOL_LIST: ToolMeta[] = TOOL_GROUPS.flat();
export const toolMeta = (id: ToolId): ToolMeta => TOOL_LIST.find((t) => t.id === id)!;

/** Tools that show a brush footprint under the cursor. */
export const BRUSH_TOOLS: ToolId[] = [
  'pencil',
  'lassoFill',
  'eraser',
  ...SHAPE_IDS,
  'shade',
  'lighten',
  'blur',
  'spray',
  'jumble',
  'liquify',
];
