import { blur } from './blur';
import { bucket } from './bucket';
import { eraser } from './eraser';
import { gradientTool } from './gradient';
import { hand } from './hand';
import { move } from './move';
import { lassoFillTool, pencil } from './pencil';
import { picker } from './picker';
import { select } from './select';
import { lighten, shade } from './shade';
import { jumbleTool } from './jumble';
import { liquifyTool } from './liquify';
import { sprayTool } from './spray';
import { ellipseTool, heartTool, lineTool, rectTool, roundRectTool, starTool, triangleTool } from './shapes';
import type { Tool, ToolId } from './types';

/** To add a tool: create a file exporting a `Tool`, register it here, then add its UI metadata in `ui/tools.ts`. */
export const TOOLS: Record<ToolId, Tool> = {
  move,
  select,
  hand,
  pencil,
  lassoFill: lassoFillTool,
  eraser,
  bucket,
  gradient: gradientTool,
  line: lineTool,
  rect: rectTool,
  roundRect: roundRectTool,
  ellipse: ellipseTool,
  triangle: triangleTool,
  star: starTool,
  heart: heartTool,
  shade,
  lighten,
  blur,
  spray: sprayTool,
  jumble: jumbleTool,
  liquify: liquifyTool,
  picker,
};

export type { Tool, ToolId, ToolOptions, Stroke, Modifiers } from './types';
export { DEFAULT_TOOL_OPTIONS } from './types';
