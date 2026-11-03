import { alpha, pack, red, green, blue, type Color } from '../engine/color';
import type { Editor, Notice } from '../engine/editor';
import { activeFrame, frameCount } from '../engine/frames';
import { TOOLS, type Modifiers, type ToolId, type ToolOptions } from '../engine/tools';
import { fileFromJson, fileToJson } from '../storage/fileFormat';

/**
 * A thin layer over the `Editor` for AI agents: the same tools a person uses, driven with plain
 * values (`#rrggbb` colors, pixel coordinates, layer names) instead of pointer events. Every call
 * goes through the editor's own commands, so the interface updates, undo works and autosave keeps
 * the result, exactly as if someone had drawn it.
 *
 * Pure: no DOM. The browser-only parts (leaving the home screen, rendering a PNG) come in as `hooks`.
 */

/** A color: `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export type HexColor = string;

/** A point as `[x, y]` or `{ x, y }`, in art pixels from the top left corner. */
export type PointInput = [number, number] | { x: number; y: number };

export interface GestureOptions {
  /** Paint with the secondary color, like the right mouse button. */
  secondary?: boolean;
  /** Shift held: straight lines from the last stroke, square shapes, snapped angles. */
  shift?: boolean;
}

export interface StrokeOptions extends GestureOptions {
  /** The tool to draw with; it stays selected afterwards, as it would for a person. */
  tool?: ToolId;
  /** The color to draw with; it stays the primary (or secondary) color afterwards. */
  color?: HexColor;
  /**
   * Tool options for this stroke (size, filled, dither…); they stay set afterwards. Unlike
   * `setOptions` on its own, they never redraw the box or gradient drawn before.
   */
  options?: AgentToolOptions;
}

/** A color as the API takes it: hex text, or a packed color as the editor stores it. */
type ColorInput = HexColor | Color;

/** The tool options, with their colors as hex text (packed colors work too). */
export type AgentToolOptions = Omit<Partial<ToolOptions>, 'boxFaces' | 'gradientStops'> & {
  boxFaces?: { top: ColorInput; left: ColorInput; right: ColorInput } | null;
  gradientStops?: { at: number; color: ColorInput }[] | null;
};

export interface LayerInfo {
  index: number;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  active: boolean;
}

export interface AgentState {
  file: string;
  width: number;
  height: number;
  tool: ToolId;
  primary: HexColor;
  secondary: HexColor;
  palette: HexColor[];
  layers: LayerInfo[];
  frame: number;
  frames: number;
  selection: { x: number; y: number; w: number; h: number } | null;
  canUndo: boolean;
  canRedo: boolean;
}

/** What only the browser can do; tests and Node pass nothing. */
export interface AgentHooks {
  /** A file was created or opened: show the editor rather than the home screen. */
  onOpen?: () => void;
  /** The drawing as a PNG data URL, each art pixel `scale` screen pixels wide. */
  png?: (pixels: Uint32Array, width: number, height: number, scale: number) => string;
}

export const AGENT_API_VERSION = 1;

/** Characters for `ascii()`, one per color, in order of first appearance. */
const ASCII_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#@$%&*+=?';
const ASCII_EMPTY = '.';
const DEFAULT_PNG_SCALE = 8;

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** `#rrggbb` when opaque, `#rrggbbaa` otherwise, null when fully transparent. */
export function colorToHex(c: Color): HexColor | null {
  const a = alpha(c);
  if (!a) return null;
  const rgb = `#${hex2(red(c))}${hex2(green(c))}${hex2(blue(c))}`;
  return a === 255 ? rgb : rgb + hex2(a);
}

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa` (the `#` is optional); throws on anything else. */
export function parseColor(input: HexColor): Color {
  let h = String(input).trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join('');
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) throw new Error(`Invalid color "${input}": use #rrggbb`);
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6), 16) : 255;
  return pack((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}

const toPoint = (p: PointInput): { x: number; y: number } => {
  const [x, y] = Array.isArray(p) ? p : [p.x, p.y];
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Invalid point ${JSON.stringify(p)}`);
  return { x: Math.round(x), y: Math.round(y) };
};

const toColor = (c: ColorInput): Color => (typeof c === 'number' ? c : parseColor(c));

/** An option's value as the editor stores it: the colors in it packed. */
function optionValue(key: string, value: unknown): unknown {
  if (key === 'boxFaces' && value) {
    const { top, left, right } = value as { top: ColorInput; left: ColorInput; right: ColorInput };
    return { top: toColor(top), left: toColor(left), right: toColor(right) };
  }
  if (key === 'gradientStops' && value)
    return (value as { at: number; color: ColorInput }[]).map((s) => ({ at: s.at, color: toColor(s.color) }));
  return value;
}

const TOOL_IDS = Object.keys(TOOLS) as ToolId[];

/** A tool whose options never redraw anything, selected while a stroke's options are set. */
const NEUTRAL_TOOL: ToolId = 'hand';

const HELP = `Baipix agent API (window.baipix), v${AGENT_API_VERSION}
Coordinates are art pixels from the top left (x right, y down). Colors are "#rrggbb" or "#rrggbbaa".
Everything goes through the editor's own tools: the interface updates and every change can be undone.

Look:    state()  layers()  pixel(x, y)  pixels()  ascii()  png(scale?)
Files:   newFile(w, h, name?)  open(baipixJson)  save()
Setup:   tools()  setTool(id)  setOptions({ size, filled, dither, ... })  options()
         setColor(hex, 'primary'|'secondary')  setPalette([hex, ...])
Draw:    stroke(points, { tool, color, options, secondary, shift })   one gesture, one undo step
         click(x, y, opts)  line(x0, y0, x1, y1, opts)  rect(x, y, w, h, opts)  ellipse(x, y, w, h, opts)
         fill(x, y, opts)   erase(points)   plot([[x, y, hex], ...])   (plot: one undo step, active layer)
Gesture: down(x, y, opts)  move(x, y)  up()  cancel()        (the raw pointer, for any tool)
Layers:  addLayer(name?)  selectLayer(indexOrName)  renameLayer(name)  deleteLayer()
         setLayerVisible(indexOrName, bool)  setLayerOpacity(0..1)
Select:  select(x, y, w, h)  selectAll()  deselect()
Frames:  addFrame(empty?)  setFrame(i)  setFrameDuration(ms)
History: undo()  redo()
Raw:     editor   (the Editor itself, for anything else)
Tools:   ${TOOL_IDS.join(', ')}
Guide:   https://baipix.app/agent.md (steps, conventions, isometric volumes)`;

export type AgentApi = ReturnType<typeof createAgentApi>;

export function createAgentApi(editor: Editor, hooks: AgentHooks = {}) {
  // The last thing the editor told the person (a hidden or locked layer…), to explain a refusal.
  let lastNotice: Notice | null = null;
  editor.onNotice((n) => (lastNotice = n));

  const doc = () => editor.getState().doc;

  const refused = (what: string): Error =>
    new Error(lastNotice ? `${what}: ${lastNotice.type}` : `${what}: nothing happened`);

  const layerIndex = (ref: number | string): number => {
    const { layers } = doc();
    const i = typeof ref === 'number' ? ref : layers.findIndex((l) => l.name === ref);
    if (i < 0 || i >= layers.length || !Number.isInteger(i))
      throw new Error(`No layer ${JSON.stringify(ref)}`);
    return i;
  };

  const checkTool = (id: string): ToolId => {
    if (!TOOL_IDS.includes(id as ToolId))
      throw new Error(`Unknown tool "${id}". Tools: ${TOOL_IDS.join(', ')}`);
    return id as ToolId;
  };

  const mods = (o: GestureOptions = {}): Modifiers => ({ shift: !!o.shift });

  /** The stroke's tool, color and options, set as a person would before drawing. */
  const prepare = (o: StrokeOptions = {}) => {
    const tool = o.tool ? checkTool(o.tool) : editor.getState().tool;
    // With a volume or the gradient selected, an option change redraws the last one drawn (a person
    // tweaking it). These options are for the stroke about to start: set them on a neutral tool.
    if (o.options) {
      editor.setTool(NEUTRAL_TOOL);
      setOptions(o.options);
    }
    if (tool !== editor.getState().tool) editor.setTool(tool);
    if (o.color) editor.setColor(o.secondary ? 'secondary' : 'primary', parseColor(o.color));
  };

  const setOptions = (patch: AgentToolOptions) => {
    const current = editor.getState().options;
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in current)) throw new Error(`Unknown option "${key}"`);
      editor.setOption(key as keyof ToolOptions, optionValue(key, value) as never);
    }
  };

  const down = (x: number, y: number, o: GestureOptions = {}) => {
    lastNotice = null;
    if (!editor.beginStroke(toPoint([x, y]), !!o.secondary, mods(o))) throw refused('Cannot draw here');
  };

  /** One whole gesture: down on the first point, through the others, up on the last. */
  const stroke = (points: PointInput[], o: StrokeOptions = {}) => {
    if (!points.length) throw new Error('A stroke needs at least one point');
    prepare(o);
    const [first, ...rest] = points.map(toPoint);
    down(first.x, first.y, o);
    for (const p of rest) editor.moveStroke(p, mods(o));
    editor.endStroke();
  };

  const box =
    (tool: ToolId) =>
    (x: number, y: number, w: number, h: number, o: StrokeOptions = {}) => {
      if (w < 1 || h < 1) throw new Error('Width and height must be at least 1');
      stroke(
        [
          [x, y],
          [x + w - 1, y + h - 1],
        ],
        { ...o, tool },
      );
    };

  const layers = (): LayerInfo[] => {
    const d = doc();
    return d.layers.map((l, index) => ({
      index,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      active: index === d.activeLayer,
    }));
  };

  const opened = () => hooks.onOpen?.();

  const api = {
    version: AGENT_API_VERSION,
    /** The raw editor, for anything this layer doesn't cover. */
    editor,

    help: (): string => HELP,

    /* ---------------------------------------------------------------- look */

    state: (): AgentState => {
      const s = editor.getState();
      const sel = s.selection;
      return {
        file: s.doc.name,
        width: s.doc.width,
        height: s.doc.height,
        tool: s.tool,
        primary: colorToHex(s.primary) ?? '#00000000',
        secondary: colorToHex(s.secondary) ?? '#00000000',
        palette: s.palette.colors.map((c) => colorToHex(c) ?? '#00000000'),
        layers: layers(),
        frame: activeFrame(s.doc),
        frames: frameCount(s.doc),
        selection: sel && { x: sel.x, y: sel.y, w: sel.w, h: sel.h },
        canUndo: s.canUndo,
        canRedo: s.canRedo,
      };
    },

    layers,

    /** The color shown at a pixel (all visible layers merged, background included), null if empty. */
    pixel: (x: number, y: number): HexColor | null => {
      const { width, height } = doc();
      if (x < 0 || y < 0 || x >= width || y >= height) throw new Error(`(${x}, ${y}) is outside the canvas`);
      return colorToHex(editor.flatten()[y * width + x]);
    },

    /** Every pixel as rows of colors (null: transparent): the merged drawing, or one layer's own. */
    pixels: (layer?: number | string): (HexColor | null)[][] => {
      const d = doc();
      const src = layer === undefined ? editor.flatten() : d.layers[layerIndex(layer)].pixels;
      return Array.from({ length: d.height }, (_, y) =>
        Array.from({ length: d.width }, (_, x) => colorToHex(src[y * d.width + x])),
      );
    },

    /** The drawing as text, one character per pixel, with the colors each one stands for. */
    ascii: (): { rows: string[]; legend: Record<string, HexColor> } => {
      const d = doc();
      const flat = editor.flatten();
      const chars = new Map<Color, string>();
      const legend: Record<string, HexColor> = {};
      const rows: string[] = [];
      for (let y = 0; y < d.height; y++) {
        let row = '';
        for (let x = 0; x < d.width; x++) {
          const c = flat[y * d.width + x];
          if (!alpha(c)) {
            row += ASCII_EMPTY;
            continue;
          }
          let ch = chars.get(c);
          if (!ch) {
            ch = ASCII_CHARS[chars.size] ?? '~';
            chars.set(c, ch);
            if (ch !== '~') legend[ch] = colorToHex(c)!;
          }
          row += ch;
        }
        rows.push(row);
      }
      return { rows, legend };
    },

    /** The drawing as a PNG data URL (browser only), to look at it. */
    png: (scale = DEFAULT_PNG_SCALE): string => {
      if (!hooks.png) throw new Error('png() is only available in the browser');
      const d = doc();
      return hooks.png(editor.flatten(), d.width, d.height, Math.max(1, Math.round(scale)));
    },

    /* ---------------------------------------------------------------- files */

    newFile: (width: number, height: number, name?: string) => {
      editor.newFile(width, height, name);
      opened();
      return api.state();
    },

    /** Opens a `.baipix` file's text as a new file. */
    open: (json: string) => {
      editor.addDocuments(fileFromJson(json));
      opened();
      return api.state();
    },

    /** The active file as `.baipix` text, every board included. */
    save: (): string => fileToJson(editor.fileBoards()),

    /* ---------------------------------------------------------------- tools and colors */

    tools: (): ToolId[] => [...TOOL_IDS],
    setTool: (id: ToolId) => editor.setTool(checkTool(id)),
    options: (): ToolOptions => ({ ...editor.getState().options }),
    setOptions,

    setColor: (hex: HexColor, slot: 'primary' | 'secondary' = 'primary') =>
      editor.setColor(slot, parseColor(hex)),

    setPalette: (colors: HexColor[]) => editor.setPaletteColors(colors.map(parseColor)),

    /* ---------------------------------------------------------------- draw */

    down,
    move: (x: number, y: number, o: GestureOptions = {}) => editor.moveStroke(toPoint([x, y]), mods(o)),
    up: () => editor.endStroke(),
    cancel: () => editor.cancelStroke(),

    stroke,
    click: (x: number, y: number, o: StrokeOptions = {}) => stroke([[x, y]], o),
    line: (x0: number, y0: number, x1: number, y1: number, o: StrokeOptions = {}) =>
      stroke(
        [
          [x0, y0],
          [x1, y1],
        ],
        { ...o, tool: 'line' },
      ),
    rect: box('rect'),
    ellipse: box('ellipse'),
    fill: (x: number, y: number, o: StrokeOptions = {}) => stroke([[x, y]], { ...o, tool: 'bucket' }),
    erase: (points: PointInput[], o: StrokeOptions = {}) => stroke(points, { ...o, tool: 'eraser' }),

    /**
     * Sets many pixels of the active layer at once, as one undo step: `[x, y, color]` with a color
     * or null to clear it. Like the tools, it keeps to the selection when there is one.
     */
    plot: (pixels: [number, number, HexColor | null][]) => {
      const { width, height } = doc();
      const writes = pixels.map(([x, y, c]) => {
        const p = toPoint([x, y]);
        return { ...p, color: c === null ? 0 : parseColor(c) };
      });
      lastNotice = null;
      editor.beginAdjust(false);
      if (!editor.isAdjusting) throw refused('Cannot plot on this layer');
      editor.applyChange((base) => {
        const out = base.slice();
        for (const { x, y, color } of writes)
          if (x >= 0 && y >= 0 && x < width && y < height) out[y * width + x] = color;
        return out;
      });
    },

    /* ---------------------------------------------------------------- layers */

    addLayer: (name?: string) => {
      editor.addLayer();
      if (name) editor.renameLayer(doc().activeLayer, name);
      return layers();
    },
    selectLayer: (ref: number | string) => editor.setActiveLayer(layerIndex(ref)),
    renameLayer: (name: string, ref: number | string = doc().activeLayer) =>
      editor.renameLayer(layerIndex(ref), name),
    deleteLayer: () => editor.deleteLayer(),
    setLayerVisible: (ref: number | string, visible: boolean) =>
      editor.setLayerVisible(layerIndex(ref), visible),
    setLayerOpacity: (opacity: number) => editor.setLayerOpacity(Math.min(1, Math.max(0, opacity)), true),

    /* ---------------------------------------------------------------- selection */

    /** A rectangular selection, drawn with the Select tool. */
    select: (x: number, y: number, w: number, h: number) => box('select')(x, y, w, h),
    selectAll: () => editor.selectAll(),
    deselect: () => editor.deselect(),

    /* ---------------------------------------------------------------- frames */

    addFrame: (empty = false) => editor.addFrame(empty),
    setFrame: (f: number) => editor.setFrame(f),
    setFrameDuration: (ms: number) => editor.setFrameDuration(ms),

    /* ---------------------------------------------------------------- history */

    undo: () => editor.undo(),
    redo: () => editor.redo(),
  };
  return api;
}
