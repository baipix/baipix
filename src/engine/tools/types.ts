import type { Selection } from '../selection';
import type { Color } from '../color';
import type { Layer, PixelDoc } from '../document';
import type { Outside } from '../outside';
import type { PixelBlock } from '../region';
import type { DitherPattern } from '../dither';
import type { GradientDither, GradientShape, GradientStop } from '../gradient';
import type { LiquifyMode } from './liquify';
import type { Point } from '../math';
import type { PaletteIndex, ShadeMode } from '../palette';

export type ToolId =
  | 'move'
  | 'select'
  | 'lassoSelect'
  | 'wand'
  | 'hand'
  | 'pencil'
  | 'eraser'
  | 'bucket'
  | 'gradient'
  | 'line'
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'heart'
  | 'shade'
  | 'lighten'
  | 'blur'
  | 'spray'
  | 'jumble'
  | 'lassoFill'
  | 'liquify'
  | 'picker';

export interface ToolOptions {
  size: number;
  /** Round brush tip instead of a square one (sizes 3 and up). */
  roundTip: boolean;
  /** Semi-transparent colors mix with what's underneath instead of replacing it. */
  blend: boolean;
  /** Freehand strokes follow the pointer on a string this many pixels long (0: off), to smooth wobbles. */
  stabilizer: number;
  /** Pencil: when the stroke ends, close it and fill the shape it draws (lasso fill). */
  lassoFill: boolean;
  /** Pencil: id of the custom brush to paint with, or null for the normal tip. */
  customBrush: string | null;
  /** Custom brush: paint with its own colors (true) or as a stencil in the current color. */
  brushOwnColors: boolean;
  /** Liquify: push pixels along, or expand or shrink them around the brush's center. */
  liquifyMode: LiquifyMode;
  /** Liquify: diameter of the brush, in pixels. */
  liquifySize: number;
  /** Liquify: how much each dab warps, 1 to 100. */
  liquifyStrength: number;
  pixelPerfect: boolean;
  dither: boolean;
  /** Which dithering pattern `dither` uses. */
  ditherPattern: DitherPattern;
  filled: boolean;
  /** Corner radius of the rounded rectangle, in pixels. */
  radius: number;
  contiguous: boolean;
  blurStrength: number;
  blurSnap: boolean;
  /** How lighten and shade pick the next color. */
  shadeMode: ShadeMode;
  /** Steps per stroke in the free mode, 1 to 3. */
  shadeStrength: number;
  /** Free mode: highlights toward yellow, shadows toward blue-violet. */
  shadeHueShift: boolean;
  /** Spray: diameter of the circle, in pixels. */
  spraySize: number;
  /** Spray: how many pixels each dab drops, 1 to 100. */
  sprayDensity: number;
  /** Spray: give each pixel a random opacity. */
  sprayOpacity: boolean;
  /** Jumble: side of the square whose pixels get shuffled. */
  jumbleSize: number;
  /** Jumble: how many swaps per step, 1 to 3. */
  jumbleStrength: number;
  /** Gradient: linear, radial, angular or diamond. */
  gradientShape: GradientShape;
  /** Gradient: how one stop fades into the next. */
  gradientDither: GradientDither;
  /** Gradient: its stops, or null for the primary color to the secondary. */
  gradientStops: GradientStop[] | null;
  /** Gradient: fill the whole layer, not only the area of the same color under the first click. */
  gradientLayer: boolean;
  /** Magic wand: the area of the color clicked (true), or that color everywhere. */
  wandContiguous: boolean;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  size: 1,
  roundTip: false,
  blend: false,
  stabilizer: 0,
  lassoFill: false,
  customBrush: null,
  brushOwnColors: true,
  liquifyMode: 'push',
  liquifySize: 12,
  liquifyStrength: 50,
  pixelPerfect: true,
  dither: false,
  ditherPattern: 'checker',
  filled: false,
  radius: 2,
  contiguous: true,
  blurStrength: 1,
  blurSnap: true,
  shadeMode: 'ramp',
  shadeStrength: 1,
  shadeHueShift: true,
  spraySize: 8,
  sprayDensity: 30,
  sprayOpacity: false,
  jumbleSize: 6,
  jumbleStrength: 1,
  gradientShape: 'linear',
  gradientDither: 'bayer',
  gradientStops: null,
  gradientLayer: false,
  wandContiguous: true,
};

export interface Modifiers {
  shift: boolean;
  /** Move tool: Cmd/Ctrl held, move the active layer instead of the one under the pointer. */
  keepLayer?: boolean;
  /** Move tool: Alt held, the layers taken are copied and the copies move. */
  duplicate?: boolean;
  /** Move tool: Shift held, what's clicked joins the selected layers, or leaves them. */
  add?: boolean;
}

/** Everything a tool needs during one pointer gesture. Created by the editor on pointer down. */
export interface Stroke {
  doc: PixelDoc;
  layer: Layer;
  /** Layer pixels as they were when the stroke started. */
  base: Uint32Array;
  /** The layer's part outside the canvas when the stroke started. */
  baseOutside: Outside | undefined;
  start: Point;
  last: Point;
  /** Right button / secondary color. */
  secondary: boolean;
  options: ToolOptions;
  primaryColor: Color;
  secondaryColor: Color;
  palette: PaletteIndex;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Tile preview is on: painting wraps around the canvas edges. */
  wrap: boolean;
  /** The custom brush the Pencil paints with, if any. */
  customBrush: PixelBlock | null;
  selection: Selection | null;
  /** Per-pixel marks, for tools that must affect each pixel once per stroke. */
  visited: Uint8Array;
  /** Points painted so far (pixel-perfect bookkeeping). */
  trail: Point[];
  /** Free scratch space for a tool. */
  scratch: Record<string, unknown>;
  /** Color of the flattened image at a point (for the picker). */
  sample(p: Point): Color;
  setColor(slot: 'primary' | 'secondary', color: Color): void;
  setSelection(selection: Selection | null): void;
}

export interface Tool {
  id: ToolId;
  /** Whether the tool writes to the active layer (and therefore needs an undo step). */
  editsPixels: boolean;
  /** Paints with the stroke colors, which then go to the recent colors. */
  paintsColor?: boolean;
  onDown(stroke: Stroke, p: Point, mods: Modifiers): void;
  onMove(stroke: Stroke, p: Point, mods: Modifiers): void;
  onUp?(stroke: Stroke): void;
}
