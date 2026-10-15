import { adjustColor, alpha, opaque, toOklab, withAlpha, type Color, type ColorAdjustment } from './color';
import { flatten, mergeLayerInto, type BlendMode, type FlattenOptions } from './composite';
import {
  activeLayer,
  centeredOffset,
  cloneDocument,
  cloneLayer,
  createDocument,
  createLayer,
  MAX_SIZE,
  newId,
  resizeDocument,
  type DocPalette,
  fileIdOf,
  fileNameOf,
  isBoard,
  isEmptyBoard,
  isFreeZone,
  isoCellSize,
  type Layer,
  type LayerGroup,
  type PixelDoc,
  type ReferenceImage,
  type RenderSettings,
} from './document';
import {
  findGroup,
  groupChain,
  groupDepth,
  groupLayers,
  isLocked,
  isShown,
  isWithin,
  itemHeight,
  itemLayers,
  layerTree,
  MAX_GROUP_DEPTH,
  moveItems,
  normalizeGroups,
  pickedItems,
  type GroupBlendMode,
  type LayerItem,
  type LayerNode,
} from './groups';
import { applyRepeat, clampGrid, DEFAULT_REPEAT, type RepeatGrid, type RepeatSource } from './repeat';
import { bakeEffects, newEffect, type EffectType, type LayerEffect } from './effects';
import {
  clipSelection,
  fromCanvasMask,
  toCanvasMask,
  fillSelection,
  flipMask,
  inSelection,
  maskBlock,
  rotateMask,
  scaleMask,
  type Selection,
} from './selection';
import { fragmentOf, pasteFragment, type LayerFragment } from './layerClipboard';
import {
  addInstance,
  detachInstance,
  findMaster,
  growFrame,
  isLinkedInstance,
  makeComponent,
  syncInstances,
} from './components';
import { History, takeSnapshot, type Snapshot } from './history';
import { addOutside, flipOutside, layerContent, reframe, type Outside } from './outside';
import { clamp, clipRect, type Point, type Rect } from './math';
import { PaletteIndex, hueShiftedRamp, presetColors, sortByLightness } from './palette';
import {
  extractBlock,
  flipRect,
  pixelBounds,
  rotateRect,
  scaleBlock,
  stampBlock,
  uniqueColors,
  type PixelBlock,
} from './region';
import {
  DEFAULT_TOOL_OPTIONS,
  TOOLS,
  type Modifiers,
  type Stroke,
  type ToolId,
  type ToolOptions,
} from './tools';
import { paintGradient, stopsOf } from './tools/gradient';
import { tilesIsometric } from './isoTile';
import { isoFaceMapping, type IsoFace } from './isoProject';
import { ISO_PLANES } from './isoPlane';
import { DEFAULT_EXTRUDE, extrude, type ExtrudeOptions } from './extrude';
import { cleanStops, GRADIENT_DITHERS, GRADIENT_SHAPES } from './gradient';
import { rotator, type Rotator } from './rotsprite';
import { applyMove, beginMove } from './tools/move';
import { strokeColors } from './tools/paint';

export interface ViewSettings {
  grid: boolean;
  tile: boolean;
  /** Tile preview: how visible the 8 copies around the drawing are, 0 to 1 (1: as the drawing). */
  tileOpacity: number;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Rulers along the workspace edges, and the guides dragged out of them. */
  rulers: boolean;
}

/** View settings that are switched on and off. */
type ViewToggle = 'grid' | 'tile' | 'mirrorX' | 'mirrorY' | 'rulers';

/** The space left between a board and one added or copied beside it, in pixels. */
const BOARD_SPACING = 16;

/** The isometric volumes: their options (height, outline, light edge) redraw the last one drawn. */
const VOLUMES: ToolId[] = ['box', 'cylinder', 'pyramid'];

/** Tools where Shift-click draws a straight line from the last point painted. */
const STRAIGHT_LINES: ToolId[] = ['pencil', 'eraser'];

export const DEFAULT_TILE_OPACITY = 0.65;
export const DEFAULT_ISO_CELL = 16;

/** A palette of the user's own, kept in the browser and usable in every file (copied into it). */
export interface MyPalette {
  id: string;
  name: string;
  colors: Color[];
}

/** A file's palette taken from one of the user's palettes: `mine:` and its id. */
export const MY_PALETTE = 'mine:';

export interface PaletteState {
  /** Preset key, 'custom' (the file's own colors), or 'drawing' (the colors the drawing uses). */
  key: string;
  colors: Color[];
  custom: Color[] | null;
}

export interface FileInfo {
  id: string;
  name: string;
  /** The size of the board it opens on. */
  width: number;
  height: number;
  /** Last change, in ms since the epoch. */
  updatedAt: number;
  /** How many boards it has. */
  boards: number;
}

/** A board of the active file, as the canvas lays them out. */
export interface BoardInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Immutable snapshot consumed by the UI. A new object is created on every change. */
export interface EditorState {
  files: FileInfo[];
  /** The active file's boards, the active one among them (`doc`). */
  boards: BoardInfo[];
  /** The boards selected as boards (blue frame), to resize, delete or align them. */
  selectedBoards: string[];
  /** The active file's id (see `fileIdOf`); `doc.id` is its active board's. */
  activeId: string;
  /** The active document. Its pixel buffers are mutable; rely on `revision` to detect changes. */
  doc: PixelDoc;
  selection: Selection | null;
  tool: ToolId;
  options: ToolOptions;
  primary: Color;
  secondary: Color;
  palette: PaletteState;
  /** Last colors painted with, most recent first. */
  recent: Color[];
  /** Custom brushes made from selections. */
  brushes: BrushInfo[];
  /** The user's own palettes, kept in the browser for every file. */
  myPalettes: MyPalette[];
  view: ViewSettings;
  /** Ids of the selected layers, bottom to top. Always includes the active layer. */
  selectedLayers: string[];
  /** The group selected in the Layers panel (its layers are the selected ones), or null. */
  selectedGroup: string | null;
  /** The reference image is selected (in the Layers panel, or picked by the Move tool). */
  referenceSelected: boolean;
  /** The Move tool frames the active layer (until a click beside every layer). */
  layerFramed: boolean;
  /** A repeat grid being set up (see `beginRepeat`), or null. */
  repeat: RepeatGrid | null;
  /** An extrusion being set up (see `beginExtrude`), or null. */
  extrude: ExtrudeOptions | null;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
}

/** Names the engine needs, injected by the UI so they can be translated. */
export interface EditorLabels {
  layer: (n: number) => string;
  copyOf: (name: string) => string;
  untitled: (n: number) => string;
  pasted: string;
  /** Name of the n-th custom brush. */
  brush: (n: number) => string;
  /** Name of the n-th group. */
  group: (n: number) => string;
  /** Name of the user's n-th own palette. */
  palette: (n: number) => string;
  /** Name of a file's n-th board. */
  board: (n: number) => string;
}

export type Notice =
  | { type: 'layerHidden' }
  | { type: 'layerLocked' }
  | { type: 'colorInPalette' }
  | { type: 'colorNotInPalette' }
  | { type: 'emptyDrawing' }
  | { type: 'rampAdded'; count: number }
  | { type: 'extracted'; count: number }
  | { type: 'pasted' }
  | { type: 'layersPasted'; count: number }
  | { type: 'merged' }
  | { type: 'groupTooDeep' }
  | { type: 'instanceLocked' }
  | { type: 'componentCreated' }
  | { type: 'componentStaysOnBoard' }
  | { type: 'layerToBoard'; board: string };

export interface Preferences {
  tool: ToolId;
  options: ToolOptions;
  primary: Color;
  secondary: Color;
  /** Older saves only: the palette belongs to each file now. */
  palette?: PaletteState;
  recent: Color[];
  view: ViewSettings;
  /** Custom brushes, colors as numbers so they can be saved as they are. */
  brushes: StoredBrush[];
  /** The user's own palettes. Missing in older saves. */
  myPalettes?: MyPalette[];
  /** The isometric grid's cell width last picked. Missing in older saves. */
  isoCell?: number;
}

interface Session {
  doc: PixelDoc;
  history: History;
  selection: Selection | null;
  /** Ids of the selected layers (always including the active one), and where a Shift+click range starts. */
  picked?: string[];
  anchor?: string;
  /** The reference image is selected in the Layers panel instead of a layer. */
  referencePicked?: boolean;
  /** A group is selected in the Layers panel: `picked` holds its layers. */
  pickedGroup?: string;
  /** A click beside every layer with the Move tool: the active layer stays active, without its frame. */
  unframed?: boolean;
}

/** What the last delete removed, so it can be brought back (the toast's Undo button). */
type Deleted =
  /** `placeholder`: the blank board put in when every board of a file went (see `BoardPlace.empty`). */
  | { kind: 'file'; sessions: Session[]; index: number; placeholder?: Session }
  | { kind: 'layer'; session: Session; layer: Layer; index: number }
  | {
      kind: 'layers';
      session: Session;
      entries: { layer: Layer; index: number }[];
      /** The groups as they were, to bring back the ones that went away with their layers. */
      groups?: LayerGroup[];
      /** The empty layer put in when every layer went, taken out again if still empty. */
      placeholder?: Layer;
    };

type Listener = () => void;

/** A change to a file's boards themselves, undone and redone outside their histories. */
interface FileStep {
  undo(): boolean;
  redo(): void;
}

/** How many recent colors are kept. */
export const RECENT_COLORS = 8;

const DEFAULT_LABELS: EditorLabels = {
  layer: (n) => `Layer ${n}`,
  copyOf: (name) => `${name} copy`,
  group: (n) => `Group ${n}`,
  untitled: (n) => (n > 1 ? `Untitled ${n}` : 'Untitled'),
  pasted: 'Pasted',
  brush: (n) => `Brush ${n}`,
  palette: (n) => `My palette ${n}`,
  board: (n) => `Board ${n}`,
};

/** Freehand tools the stabilizer smooths (shapes, selections and fills don't need it). */
const STABILIZED_TOOLS: ToolId[] = [
  'pencil',
  'lassoFill',
  'eraser',
  'shade',
  'lighten',
  'blur',
  'spray',
  'jumble',
  'liquify',
];

/** A color change applied to every pixel, color by color (Adjustments). */
export type ColorMap = (c: Color) => Color;

/** New pixels for a layer, from its original ones; only `rect` (the selection, or all) may change. */
export type PixelChange = (base: Uint32Array, width: number, rect: Rect) => Uint32Array;

/** A color change as a pixel change, each color mapped once. */
function mapChange(map: ColorMap): PixelChange {
  return (base, width, rect) => {
    const out = base.slice();
    const cache = new Map<Color, Color>();
    for (let y = rect.y; y < rect.y + rect.h; y++)
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = y * width + x;
        const c = base[i];
        let next = cache.get(c);
        if (next === undefined) cache.set(c, (next = map(c)));
        out[i] = next;
      }
    return out;
  };
}

/** A custom brush: a block of pixels taken from a selection. */
export interface CustomBrush {
  id: string;
  name: string;
  width: number;
  height: number;
  pixels: Uint32Array;
}
export type StoredBrush = Omit<CustomBrush, 'pixels'> & { pixels: number[] };
export type BrushInfo = Omit<CustomBrush, 'pixels'>;

/** Brushes are kept small: past this, a selection is scaled down. */
export const MAX_BRUSH = 64;

export class Editor {
  private sessions: Session[] = [];
  private active!: Session;
  private tool: ToolId = 'pencil';
  private options: ToolOptions = { ...DEFAULT_TOOL_OPTIONS };
  private primary: Color;
  private secondary: Color;
  /** The colors the drawing uses, for a palette in 'drawing' mode: worked out once per change. */
  private drawingColors: { doc: PixelDoc; revision: number; colors: Color[] } | null = null;
  /** The palette's index for the shading tools, built once per set of colors. */
  private paletteCache: { colors: Color[]; index: PaletteIndex } | null = null;

  /** The active file's palette (each file has its own, saved with it). */
  private get palette(): PaletteState {
    const p = this.doc.palette;
    const custom = p?.custom ?? null;
    if (p && p.key !== 'drawing') return { key: p.key, colors: p.colors, custom };
    return { key: 'drawing', colors: this.colorsOfDrawing(), custom };
  }

  private set palette(p: PaletteState) {
    this.doc.palette = {
      key: p.key,
      colors: p.key === 'drawing' ? [] : p.colors,
      ...(p.custom && { custom: p.custom }),
    };
    this.sharePalette();
  }

  /**
   * The boards of a file share its palette: the active board's goes to the others. With Drawing
   * colors, each board shows the colors it uses itself.
   */
  private sharePalette(): void {
    const own = this.doc.palette;
    for (const s of this.sessions) {
      if (s === this.active || fileIdOf(s.doc) !== fileIdOf(this.doc) || !this.doc.board) continue;
      if (own)
        s.doc.palette = { ...own, colors: [...own.colors], ...(own.custom && { custom: [...own.custom] }) };
      else delete s.doc.palette;
    }
  }

  private colorsOfDrawing(): Color[] {
    const c = this.drawingColors;
    if (c && c.doc === this.doc && c.revision === this.revision) return c.colors;
    const colors = sortByLightness(uniqueColors(this.flatten({ includeBackground: false })));
    this.drawingColors = { doc: this.doc, revision: this.revision, colors };
    return colors;
  }

  private get paletteIndex(): PaletteIndex {
    const colors = this.palette.colors;
    if (this.paletteCache?.colors !== colors) this.paletteCache = { colors, index: new PaletteIndex(colors) };
    return this.paletteCache.index;
  }
  private view: ViewSettings = {
    grid: true,
    tile: false,
    tileOpacity: DEFAULT_TILE_OPACITY,
    mirrorX: false,
    mirrorY: false,
    rulers: false,
  };
  /** The isometric grid's cell width last picked, for the next file it's turned on in. */
  private isoCell = DEFAULT_ISO_CELL;
  private clipboard: PixelBlock | null = null;
  /** Whole layers copied (the last copy wins over `clipboard`). */
  private layerClip: LayerFragment | null = null;
  /** A repeat grid being set up: what it repeats, and how things were, to lay it out again or drop it. */
  private repeatSession: {
    source: RepeatSource;
    base: Uint32Array;
    layers: Layer[];
    picked: string[];
    activeLayer: number;
    grid: RepeatGrid;
  } | null = null;
  /** The last repeat grid kept, to start the next one from. */
  private lastRepeat: RepeatGrid = DEFAULT_REPEAT;
  /** An extrusion being set up: the shape pulled up, and how the layer was. */
  private extrudeSession: {
    layer: Layer;
    base: Uint32Array;
    baseOutside: Outside | undefined;
    region: Uint8Array;
    selection: Selection | null;
    options: ExtrudeOptions;
  } | null = null;
  /** The last extrusion kept, to start the next one from. */
  private lastExtrude: ExtrudeOptions = DEFAULT_EXTRUDE;
  /**
   * The last gradient drawn, kept editable: while its layer still shows it, changing the gradient's
   * options redraws it in place (same undo step), like a gradient in Figma.
   */
  private lastGradient: {
    layer: Layer;
    base: Uint32Array;
    mask: Uint8Array;
    a: Point;
    b: Point;
    result: Uint32Array;
  } | null = null;
  /**
   * The last isometric box drawn, kept editable like the gradient: while its layer still shows it,
   * changing the box's options redraws it in place (same undo step). Its stroke holds what it needs.
   */
  private lastVolume: { stroke: Stroke; repaint: () => void; result: Uint32Array } | null = null;
  /** Where the last pencil or eraser stroke ended, for Shift-click straight lines. */
  private lastPainted: { doc: PixelDoc; layer: Layer; at: Point } | null = null;
  /** The id of the last layers copied here, even if pixels were copied since. */
  private layerClipId: string | null = null;
  private stroke: Stroke | null = null;
  /** Shift+press on a layer already selected: it leaves the selection on release, unless dragged. */
  private unpick: { ids: string[]; start: Point; moved: boolean } | null = null;
  /**
   * The Move tool dragged from beside every layer: a rectangle that selects the layers it touches,
   * like in a design tool. `kept`: the layers selected before, with Shift.
   */
  private marquee: { start: Point; end: Point; kept: string[] } | null = null;
  /**
   * Layers moved across boards, by the id their two steps share: where from and to, whether the
   * free layers they went to were made for them (`created`), and where a board taken away by an
   * undo or the move goes back (`at`).
   */
  /**
   * What was done to the file's boards themselves, outside their own histories: boards moved,
   * aligned or deleted. Undo and Redo go through these first, like in Figma, until a board is
   * edited. `undo` returns false when there's nothing left to undo (e.g. the toast brought the
   * boards back already).
   */
  private fileSteps: FileStep[] = [];
  private fileRedos: FileStep[] = [];
  /** Replaying a file step: what it does isn't recorded again. */
  private replaying = false;
  /** Where the file's boards were when a drag started (see `beginBoardMove`). */
  private placesBefore: Map<string, Point> | null = null;
  private links = new Map<string, { from: Session; to: Session; created: boolean; at?: number }>();
  /** Color adjustment in progress: the original pixels of the layers being adjusted. */
  /** Resizing by the handles: the content being resized and how to put it back. */
  private scaling: {
    layer: Layer;
    base: Uint32Array;
    baseOutside: Outside | undefined;
    from: Rect;
    /** The selection as it was, its shape included, to scale it along or put it back. */
    fromSelection?: Selection;
    block: PixelBlock;
    /** With a selection: the layer with the selection emptied, to stamp the resized block on. */
    cleared?: Uint32Array;
    /** Rotating rather than resizing: prepared once for the block. */
    rotator?: Rotator;
    /**
     * Several layers selected: each one's content and where it was, resized (or turned) with the
     * box they fill together, `from`.
     */
    group?: {
      layer: Layer;
      base: Uint32Array;
      baseOutside: Outside | undefined;
      rect: Rect;
      block: PixelBlock;
      rotator?: Rotator;
    }[];
  } | null = null;
  private adjusting: {
    layers: { id: string; base: Uint32Array }[];
    rect: Rect;
    /** The palette before the adjustment, while it's previewed on the palette too. */
    basePalette?: PaletteState;
  } | null = null;
  private strokeTool: ToolId | null = null;
  private opacityChange = false;
  /** An effect's setting being dragged: one undo step for the whole drag. */
  private effectChange = false;
  private deleted: Deleted | null = null;
  /** Each file's board last used, to open it there again. */
  private lastBoard = new Map<string, string>();
  /** The boards selected as boards (see `selectBoards`). */
  private boardSelection: string[] = [];
  private recent: Color[] = [];
  /** The Move tool moving a group (or several selected layers) together. */
  private groupMove: {
    start: Point;
    /**
     * `at`: an instance's position when the move started (it moves by its position). `frame`: a
     * master's frame, which moves with its drawing.
     */
    items: { layer: Layer; base: Uint32Array; outside?: Outside; at?: Point; frame?: Rect }[];
  } | null = null;
  /** The active layer's blend mode while another one is previewed. */
  private blendPreview: { target: Layer | LayerGroup; mode: BlendMode | undefined } | null = null;
  /** New files left untouched so far: any change to one takes it out. */
  private fresh = new Set<string>();
  private brushes: CustomBrush[] = [];
  private myPalettes: MyPalette[] = [];
  private revision = 0;
  private state!: EditorState;

  private listeners = new Set<Listener>();
  private pixelListeners = new Set<Listener>();
  private persistListeners = new Set<Listener>();
  private noticeListeners = new Set<(n: Notice) => void>();

  constructor(private labels: EditorLabels = DEFAULT_LABELS) {
    const colors = presetColors('sweetie16');
    this.primary = colors[0];
    this.secondary = colors[12];
    this.addSession(createDocument(labels.untitled(1), 32, 32, labels.layer(1)));
    this.refresh();
  }

  /* ------------------------------------------------------------------ subscriptions */

  getState = (): EditorState => this.state;

  /** Live document and selection, updated during strokes (the state snapshot is not). */
  getLive = (): {
    doc: PixelDoc;
    selection: Selection | null;
    view: ViewSettings;
    stroking: ToolId | null;
  } => ({
    doc: this.active.doc,
    selection: this.active.selection,
    view: this.view,
    stroking: this.strokeTool,
  });

  /** UI state changes (not fired on every pointer move while drawing). */
  subscribe = (listener: Listener): (() => void) => this.on(this.listeners, listener);
  /** Pixel or selection changes, fired continuously while drawing. For the canvas renderer. */
  onPixels = (listener: Listener): (() => void) => this.on(this.pixelListeners, listener);
  /** Anything worth saving changed. */
  onPersist = (listener: Listener): (() => void) => this.on(this.persistListeners, listener);
  onNotice = (listener: (n: Notice) => void): (() => void) => this.on(this.noticeListeners, listener);

  setLabels(labels: EditorLabels): void {
    this.labels = labels;
  }

  private on<T>(set: Set<T>, listener: T): () => void {
    set.add(listener);
    return () => set.delete(listener);
  }

  private notice(n: Notice): void {
    this.noticeListeners.forEach((l) => l(n));
  }

  private refresh(): void {
    const s = this.active;
    this.revision++;
    // Keep the layer selection valid: existing layers only, and always the active one.
    const active = activeLayer(s.doc).id;
    const ids = s.doc.layers.map((l) => l.id);
    const picked = ids.filter((id) => s.picked?.includes(id));
    s.picked = picked.includes(active) ? picked : [active];
    if (s.pickedGroup && !findGroup(s.doc, s.pickedGroup)) delete s.pickedGroup;
    this.state = {
      files: this.fileList(),
      boards: this.sessions
        .filter((x) => fileIdOf(x.doc) === fileIdOf(s.doc) && isBoard(x.doc))
        .map(({ doc }) => ({
          id: doc.id,
          name: doc.name,
          x: doc.board?.x ?? 0,
          y: doc.board?.y ?? 0,
          width: doc.width,
          height: doc.height,
        })),
      selectedBoards: this.boardSelection.filter((id) =>
        this.boardsOf(fileIdOf(s.doc)).some((b) => b.doc.id === id),
      ),
      activeId: fileIdOf(s.doc),
      doc: s.doc,
      selection: s.selection,
      tool: this.tool,
      options: this.options,
      primary: this.primary,
      secondary: this.secondary,
      palette: this.palette,
      recent: this.recent,
      brushes: this.brushes.map(({ id, name, width, height }) => ({ id, name, width, height })),
      myPalettes: this.myPalettes,
      view: this.view,
      selectedLayers: s.picked,
      selectedGroup: s.pickedGroup ?? null,
      referenceSelected: !!s.referencePicked && !!s.doc.reference,
      layerFramed: !s.unframed,
      repeat: this.repeatSession?.grid ?? null,
      extrude: this.extrudeSession?.options ?? null,
      canUndo: s.history.canUndo || this.fileSteps.length > 0,
      canRedo: s.history.canRedo || this.fileRedos.length > 0,
      revision: this.revision,
    };
  }

  /** Publishes a change. `persist` is false for pure UI changes that don't need saving. */
  private commit(persist = true): void {
    // Instances show their master as it is now, whatever changed it.
    syncInstances(this.doc);
    this.refresh();
    this.listeners.forEach((l) => l());
    this.pixelListeners.forEach((l) => l());
    if (persist) this.persistListeners.forEach((l) => l());
  }

  private pixelsChanged(): void {
    this.pixelListeners.forEach((l) => l());
  }

  /* ------------------------------------------------------------------ history */

  private get doc(): PixelDoc {
    return this.active.doc;
  }

  private checkpoint(): void {
    // Anything else done during a repeat grid or an extrusion keeps it first: two steps, never mixed.
    if (this.repeatSession) this.endRepeat(true);
    if (this.extrudeSession) this.endExtrude(true);
    this.fileSteps = [];
    this.fileRedos = [];
    this.active.history.push(takeSnapshot(this.doc, this.active.selection));
    this.touch();
  }

  /** Dates the active file's last change. */
  private touch(): void {
    this.doc.updatedAt = Date.now();
    this.fresh.delete(this.doc.id);
  }

  private restore(snapshot: Snapshot): void {
    // The palette isn't part of the history either, except for the steps that changed it along
    // with the pixels (`snapshot.palette`).
    const palette = snapshot.palette ?? this.active.doc.palette;
    if (palette) snapshot.doc.palette = palette;
    else delete snapshot.doc.palette;
    // The reference image and the guides aren't part of the history: undo and redo leave them,
    // except across a canvas resize, which moved them with the drawing.
    const { reference, guides, isoGrid, isoGridVertical } = this.active.doc;
    // The isometric grid isn't either, resize or not.
    if (isoGrid) snapshot.doc.isoGrid = isoGrid;
    else delete snapshot.doc.isoGrid;
    if (isoGridVertical) snapshot.doc.isoGridVertical = true;
    else delete snapshot.doc.isoGridVertical;
    if (!snapshot.resized) {
      snapshot.doc.reference = reference;
      if (!reference) delete snapshot.doc.reference;
      snapshot.doc.guides = guides;
      if (!guides) delete snapshot.doc.guides;
    }
    // Names and the board's place aren't part of the history either: a board moved or renamed stays
    // so. A resize by the board's sides moved it with its size, so undoing it puts it back.
    const { name, board } = this.active.doc;
    snapshot.doc.name = name;
    const place = snapshot.resized && snapshot.doc.board ? snapshot.doc.board : board;
    if (board && place) snapshot.doc.board = { ...board, x: place.x, y: place.y };
    else delete snapshot.doc.board;
    this.active.doc = snapshot.doc;
    this.active.selection = snapshot.selection;
    // A step that changed the palette changes it for the file's other boards too.
    if (snapshot.palette) this.sharePalette();
  }

  undo(): void {
    if (this.repeatSession) return this.endRepeat(false);
    if (this.extrudeSession) return this.endExtrude(false);
    if (this.stroke || this.adjusting || this.scaling) return;
    // Boards moved, aligned or deleted come back first, like in Figma.
    while (this.fileSteps.length) {
      const step = this.fileSteps.pop()!;
      this.replaying = true;
      const done = step.undo();
      this.replaying = false;
      if (!done) continue;
      this.fileRedos.push(step);
      this.commit();
      return;
    }
    const id = this.active.history.top()?.linked;
    const link = id ? this.links.get(id) : undefined;
    // A layer moved across boards: both sides are undone, and it's back on the board it left.
    if (id && link) {
      for (const side of [this.active, this.active === link.to ? link.from : link.to]) {
        this.activate(side);
        // New free layers: their first step is the layer coming in, undone by taking them away.
        if (side === link.to && link.created) {
          link.at = this.sessions.indexOf(side);
          this.sessions = this.sessions.filter((x) => x !== side);
        } else if (!this.sessions.includes(side)) {
          // The free layers it left, gone with it: back as they were.
          if (link.at !== undefined) this.sessions.splice(link.at, 0, side);
        } else if (side.history.top()?.linked === id) this.travel('undo');
      }
      this.activate(link.from);
      this.commit();
      return;
    }
    if (this.travel('undo')) this.commit();
  }

  redo(): void {
    if (this.stroke || this.adjusting || this.scaling) return;
    const again = this.fileRedos.pop();
    if (again) {
      this.replaying = true;
      again.redo();
      this.replaying = false;
      this.fileSteps.push(again);
      this.commit();
      return;
    }
    // Back on free layers that went with their last layer: the move is redone from its other side.
    const id =
      this.active.history.nextRedo()?.linked ??
      [...this.links].find(
        ([k, l]) => l.from === this.active && l.at !== undefined && l.to.history.nextRedo()?.linked === k,
      )?.[0];
    const link = id ? this.links.get(id) : undefined;
    if (id && link) {
      for (const side of [this.active, this.active === link.to ? link.from : link.to]) {
        this.activate(side);
        if (side === link.to && link.created) {
          if (!this.sessions.includes(side)) this.sessions.splice(link.at ?? this.sessions.length, 0, side);
        } else if (side === link.from && link.at !== undefined && side.history.nextRedo()?.linked !== id) {
          // The free layers it leaves go again with their last layer.
          this.sessions = this.sessions.filter((x) => x !== side);
        } else if (side.history.nextRedo()?.linked === id) this.travel('redo');
      }
      this.activate(link.to);
      this.commit();
      return;
    }
    if (this.travel('redo')) this.commit();
  }

  /** One step back or forth in the active board's history. Returns false when there's none. */
  private travel(way: 'undo' | 'redo'): boolean {
    const current = takeSnapshot(this.doc, this.active.selection);
    const step = this.active.history[way](current);
    if (!step) return false;
    // A step that changed the palette swaps it back and forth with the pixels.
    if (step.palette) current.palette = this.savedPalette();
    if (step.resized) current.resized = true;
    if (step.linked) current.linked = step.linked;
    this.forgetDeletedLayer();
    this.restore(step);
    this.touch();
    return true;
  }

  /** Undo and redo swap whole snapshots, which may bring the deleted layer back on their own. */
  private forgetDeletedLayer(): void {
    const d = this.deleted;
    if (d && d.kind !== 'file' && d.session === this.active) this.deleted = null;
  }

  /** Runs a document mutation as one undoable step. */
  private edit(mutate: (doc: PixelDoc) => void): void {
    this.checkpoint();
    mutate(this.doc);
    this.commit();
  }

  /* ------------------------------------------------------------------ files */

  private addSession(doc: PixelDoc): Session {
    const session: Session = { doc, history: new History(), selection: null };
    this.sessions.push(session);
    this.activate(session);
    return session;
  }

  private nextUntitled(): string {
    const names = new Set(this.sessions.map((s) => s.doc.name));
    let n = this.sessions.length + 1;
    while (names.has(this.labels.untitled(n))) n++;
    return this.labels.untitled(n);
  }

  newFile(width: number, height: number, name = this.nextUntitled()): void {
    this.cancelStroke();
    const w = clamp(Math.round(width), 1, MAX_SIZE);
    const h = clamp(Math.round(height), 1, MAX_SIZE);
    this.addSession(createDocument(name, w, h, this.labels.layer(1)));
    this.dropFresh();
    this.markFresh();
    this.commit();
  }

  /**
   * A new file left as it was created (nothing drawn, renamed or changed since): it isn't worth
   * keeping, so it goes away once you leave it, and isn't saved.
   */
  isFresh(id: string): boolean {
    const s = this.sessions.find((x) => x.doc.id === id);
    return !!s && this.fresh.has(id);
  }

  /** The active file counts as just created, as it is now (once a template has set it up). */
  markFresh(): void {
    this.fresh.add(this.doc.id);
  }

  /** Drops the fresh files other than the active one. */
  private dropFresh(): void {
    const stale = this.sessions.filter((s) => s !== this.active && this.isFresh(s.doc.id));
    for (const s of stale) this.fresh.delete(s.doc.id);
    this.sessions = this.sessions.filter((s) => !stale.includes(s));
  }

  /** Adds an existing document (import, open file). */
  addDocument(doc: PixelDoc): void {
    this.cancelStroke();
    doc.updatedAt = Date.now();
    this.addSession(doc);
    this.commit();
  }

  /** Adds a file of several boards (an opened .baipix file), opened on its first board. */
  addDocuments(docs: PixelDoc[]): void {
    if (!docs.length) return;
    if (docs.length === 1) return this.addDocument(docs[0]);
    this.cancelStroke();
    const now = Date.now();
    const sessions = docs.map(
      (doc) => ((doc.updatedAt = now), { doc, history: new History(), selection: null }),
    );
    this.sessions.push(...sessions);
    this.activate(sessions[0]);
    this.commit();
  }

  /** The active file's boards, in order: what a .baipix file of it holds. */
  fileBoards(): PixelDoc[] {
    return this.boardsOf(fileIdOf(this.doc)).map((s) => s.doc);
  }

  /** Replaces every file, e.g. when restoring a saved workspace. */
  loadDocuments(docs: PixelDoc[], activeId?: string): void {
    if (!docs.length) return;
    this.cancelStroke();
    const now = Date.now();
    docs.forEach((doc) => (doc.updatedAt ??= now));
    this.sessions = docs.map((doc) => ({ doc, history: new History(), selection: null }));
    this.deleted = null;
    this.lastBoard.clear();
    // `activeId` is a file's id, or a board's in older saves.
    this.activate(
      this.sessions.find((s) => s.doc.id === activeId) ??
        this.sessions.find((s) => fileIdOf(s.doc) === activeId) ??
        this.sessions[0],
    );
    this.commit(false);
  }

  getDocuments(): PixelDoc[] {
    return this.sessions.map((s) => s.doc);
  }

  /** The sessions of a file's boards, in order. */
  private boardsOf(fileId: string): Session[] {
    return this.sessions.filter((s) => fileIdOf(s.doc) === fileId);
  }

  /** The files, each once, in the order of their first board. */
  private fileList(): FileInfo[] {
    const files = new Map<string, Session[]>();
    for (const s of this.sessions) {
      const id = fileIdOf(s.doc);
      files.set(id, [...(files.get(id) ?? []), s]);
    }
    return [...files].map(([id, boards]) => {
      const open = boards.find((b) => b === this.active) ?? this.boardFor(id) ?? boards[0];
      return {
        id,
        name: fileNameOf(open.doc),
        width: open.doc.width,
        height: open.doc.height,
        updatedAt: Math.max(...boards.map((b) => b.doc.updatedAt ?? 0)),
        boards: boards.filter((b) => isBoard(b.doc)).length,
      };
    });
  }

  /** The board a file opens on: the last one used, or its first (a board before its free layers). */
  private boardFor(fileId: string): Session | undefined {
    const last = this.lastBoard.get(fileId);
    const boards = this.boardsOf(fileId);
    return boards.find((s) => s.doc.id === last) ?? boards.find((s) => isBoard(s.doc)) ?? boards[0];
  }

  /** Makes a session active, remembering it as its file's last board. */
  private activate(target: Session): void {
    this.active = target;
    this.lastBoard.set(fileIdOf(target.doc), target.doc.id);
  }

  /**
   * Opens a file (`id` from `files`) on the board last used in it. A board's id also works: a file
   * of one board has its board's id, and older callers pass a document's id.
   */
  switchFile(id: string): void {
    this.open(this.boardFor(id) ?? this.sessions.find((s) => s.doc.id === id));
  }

  /** Goes to one of the boards (`id` from `boards`, a document's id). */
  switchBoard(id: string): void {
    this.open(this.sessions.find((s) => s.doc.id === id));
  }

  private open(target: Session | undefined): void {
    if (!target || target === this.active) return;
    // Another file: what was done to this one's boards isn't undone from there.
    if (fileIdOf(target.doc) !== fileIdOf(this.doc) && !this.replaying) {
      this.fileSteps = [];
      this.fileRedos = [];
    }
    this.cancelStroke();
    this.cancelAdjust();
    this.activate(target);
    this.dropFresh();
    this.commit();
  }

  /** Renames a file (`id` from `files`): its only board, or the file holding several. */
  renameFile(id: string, name: string): void {
    const boards = this.boardsOf(id);
    const clean = name.trim().slice(0, 120);
    if (!boards.length || !clean) return;
    const now = Date.now();
    for (const { doc } of boards) {
      if (doc.board) doc.board.fileName = clean;
      else doc.name = clean;
      doc.updatedAt = now;
      this.fresh.delete(doc.id);
    }
    this.commit();
  }

  duplicateFile(id: string): void {
    const boards = this.boardsOf(id);
    if (!boards.length) return;
    this.cancelStroke();
    const file = newId('doc');
    const copies = boards.map(({ doc }) => {
      const copy = cloneDocument(doc, false);
      if (copy.board) copy.board = { ...copy.board, file, fileName: this.labels.copyOf(copy.board.fileName) };
      else copy.name = this.labels.copyOf(copy.name);
      copy.updatedAt = Date.now();
      return { doc: copy, history: new History(), selection: null } as Session;
    });
    const at = this.sessions.indexOf(boards[boards.length - 1]) + 1;
    this.sessions.splice(at, 0, ...copies);
    this.activate(copies[boards.indexOf(this.boardFor(id)!)] ?? copies[0]);
    this.commit();
  }

  /**
   * Deletes a file and all its boards. Returns false when nothing was deleted. The file can be
   * brought back with `restoreDeleted`. The editor always holds a file: deleting the last one leaves
   * a blank one in its place.
   */
  deleteFile(id: string): boolean {
    const boards = this.boardsOf(id);
    if (!boards.length) return false;
    this.cancelStroke();
    if (boards.length === this.sessions.length) {
      const { width, height } = boards[0].doc;
      this.sessions.push({
        doc: createDocument(this.labels.untitled(1), width, height, this.labels.layer(1)),
        history: new History(),
        selection: null,
      });
    }
    const index = this.sessions.indexOf(boards[0]);
    this.sessions = this.sessions.filter((s) => !boards.includes(s));
    if (boards.includes(this.active)) this.activate(this.sessions[Math.max(0, index - 1)]);
    this.deleted = { kind: 'file', sessions: boards, index };
    this.commit();
    return true;
  }

  /** Removes a file for good, without offering to bring it back (the home screen's blank file). */
  discardFile(id: string): void {
    const boards = this.boardsOf(id);
    if (!boards.length || boards.length === this.sessions.length) return;
    this.cancelStroke();
    const index = this.sessions.indexOf(boards[0]);
    this.sessions = this.sessions.filter((s) => !boards.includes(s));
    if (boards.includes(this.active)) this.activate(this.sessions[Math.max(0, index - 1)]);
    this.commit();
  }

  /* ------------------------------------------------------------------ boards */

  /**
   * Adds a board to the active file at (`x`, `y`) in the file, `width` × `height` pixels, and makes
   * it active. A file of its own becomes a file of boards, the first one at (0, 0). The new board
   * starts with the file's palette, pixel size and isometric grid.
   */
  addBoard(x: number, y: number, width: number, height: number, name?: string): void {
    this.cancelStroke();
    const doc = this.doc;
    doc.board ??= { file: doc.id, fileName: doc.name, x: 0, y: 0 };
    const boards = this.boardsOf(doc.board.file);
    const shown = boards.filter((b) => isBoard(b.doc)).length;
    const w = clamp(Math.round(width), 1, MAX_SIZE);
    const h = clamp(Math.round(height), 1, MAX_SIZE);
    const board = createDocument(name ?? this.labels.board(shown + 1), w, h, this.labels.layer(1));
    board.board = { ...doc.board, x: Math.round(x), y: Math.round(y) };
    delete board.board.empty;
    delete board.board.free;
    board.render = { ...doc.render };
    if (doc.palette) board.palette = { ...doc.palette, colors: [...doc.palette.colors] };
    if (doc.isoGrid) board.isoGrid = doc.isoGrid;
    board.updatedAt = Date.now();
    const session: Session = { doc: board, history: new History(), selection: null };
    this.sessions.splice(this.sessions.indexOf(boards[boards.length - 1]) + 1, 0, session);
    // The first board of a file with none takes the blank board's place.
    if (isEmptyBoard(doc)) this.sessions = this.sessions.filter((x) => x.doc !== doc);
    this.fresh.delete(doc.id);
    this.activate(session);
    this.commit();
  }

  /**
   * Selects boards as boards, like layers: a blue frame, handles to resize the active one, Delete
   * and Align for them all. `add` toggles them in the selection (Shift-click). The last one
   * selected becomes the active board.
   */
  selectBoards(ids: string[], add = false): void {
    const next = add
      ? [
          ...this.boardSelection.filter((id) => !ids.includes(id)),
          ...ids.filter((id) => !this.boardSelection.includes(id)),
        ]
      : ids;
    this.boardSelection = next;
    const last = next.at(-1);
    if (last && last !== this.doc.id) this.switchBoard(last);
    else this.commit(false);
  }

  /**
   * Lines the selected boards up against the edges, or the middle, of the box they fill together,
   * like Figma. Board places aren't in the undo history, like moving a board.
   */
  alignBoards(to: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'): void {
    const picked = this.boardsOf(fileIdOf(this.doc)).filter((s) =>
      this.state.selectedBoards.includes(s.doc.id),
    );
    if (picked.length < 2) return;
    const before = this.boardPlaces();
    const places = picked.map(({ doc }) => ({ doc, x: doc.board?.x ?? 0, y: doc.board?.y ?? 0 }));
    const x0 = Math.min(...places.map((p) => p.x));
    const y0 = Math.min(...places.map((p) => p.y));
    const x1 = Math.max(...places.map((p) => p.x + p.doc.width));
    const y1 = Math.max(...places.map((p) => p.y + p.doc.height));
    for (const { doc, x, y } of places) {
      if (!doc.board) continue;
      const nx =
        to === 'left'
          ? x0
          : to === 'right'
            ? x1 - doc.width
            : to === 'centerX'
              ? Math.round((x0 + x1 - doc.width) / 2)
              : x;
      const ny =
        to === 'top'
          ? y0
          : to === 'bottom'
            ? y1 - doc.height
            : to === 'centerY'
              ? Math.round((y0 + y1 - doc.height) / 2)
              : y;
      doc.board = { ...doc.board, x: nx, y: ny };
      doc.updatedAt = Date.now();
    }
    this.recordPlaces(before);
    this.commit();
  }

  /** Where the active file's boards are, by id. */
  private boardPlaces(): Map<string, Point> {
    return new Map(
      this.boardsOf(fileIdOf(this.doc)).map(({ doc }) => [
        doc.id,
        { x: doc.board?.x ?? 0, y: doc.board?.y ?? 0 },
      ]),
    );
  }

  /** Puts boards back at given places (those still there). */
  private placeBoards(places: Map<string, Point>): void {
    for (const s of this.sessions) {
      const at = places.get(s.doc.id);
      if (!at || !s.doc.board) continue;
      s.doc.board = { ...s.doc.board, x: at.x, y: at.y };
      s.doc.updatedAt = Date.now();
    }
  }

  /** Records boards moved from `before` to where they are now as one step, when any moved. */
  private recordPlaces(before: Map<string, Point>): void {
    const after = this.boardPlaces();
    const moved = new Map<string, Point>();
    const was = new Map<string, Point>();
    for (const [id, at] of after) {
      const from = before.get(id);
      if (!from || (from.x === at.x && from.y === at.y)) continue;
      moved.set(id, at);
      was.set(id, from);
    }
    if (!moved.size) return;
    this.recordFileStep({
      undo: () => {
        this.placeBoards(was);
        return true;
      },
      redo: () => this.placeBoards(moved),
    });
  }

  /** Records boards (or free layers) just deleted, for Undo; `again` deletes them again, for Redo. */
  private recordDeletion(again: () => void): void {
    const step = {
      gone: this.deleted,
      undo: () => {
        // Brought back already (the toast's Undo): nothing to undo here.
        const gone = step.gone;
        if (gone?.kind !== 'file' || gone.sessions.some((x) => this.sessions.includes(x))) return false;
        this.deleted = gone;
        return this.restoreDeleted();
      },
      redo: () => {
        again();
        step.gone = this.deleted;
      },
    };
    this.recordFileStep(step);
  }

  private recordFileStep(step: FileStep): void {
    if (this.replaying) return;
    this.fileSteps.push(step);
    this.fileRedos = [];
  }

  /** A board drag starts: where the boards are, to record the move as one step at its end. */
  beginBoardMove(): void {
    this.placesBefore = this.boardPlaces();
  }

  /** A board drag ends: the boards moved are one step, which Undo puts back. */
  endBoardMove(): void {
    if (this.placesBefore) this.recordPlaces(this.placesBefore);
    this.placesBefore = null;
    this.commit();
  }

  /**
   * Moves a layer of the active board to another board of the file, keeping where it is in the
   * file (what's outside the new board is kept outside it), and makes that board active with the
   * layer selected. Components and their copies stay on their board: their links don't cross
   * boards yet. One undo step on each board. Returns false when nothing moved.
   */
  moveLayerToBoard(layerId: string, boardId: string): boolean {
    const from = this.active;
    const to = this.boardsOf(fileIdOf(from.doc)).find((b) => b.doc.id === boardId);
    const layer = from.doc.layers.find((l) => l.id === layerId);
    if (!to || to === from || !layer) return false;
    if (layer.component || layer.instance) {
      this.notice({ type: 'componentStaysOnBoard' });
      return false;
    }
    if (layer.locked) {
      this.notice({ type: 'layerLocked' });
      return false;
    }
    this.cancelStroke();
    const src = from.doc;
    const dst = to.doc;
    const dx = (src.board?.x ?? 0) - (dst.board?.x ?? 0);
    const dy = (src.board?.y ?? 0) - (dst.board?.y ?? 0);
    const moved = reframe(layer.pixels, src.width, src.height, layer.outside, dx, dy, dst.width, dst.height);
    // Off the board it leaves: the board keeps a layer, even if it's an empty one. The free layers
    // go when their last one does.
    // Both sides are one step: undone (and redone) together.
    const id = newId('move');
    const link = { from, to, created: !dst.layers.length } as {
      from: Session;
      to: Session;
      created: boolean;
      at?: number;
    };
    this.links.set(id, link);
    const emptied = isFreeZone(src) && src.layers.length === 1;
    if (!emptied) {
      this.edit((doc) => {
        const i = doc.layers.findIndex((l) => l.id === layerId);
        doc.layers.splice(i, 1);
        if (!doc.layers.length) doc.layers.push(createLayer(this.labels.layer(1), doc.width, doc.height));
        doc.activeLayer = Math.min(doc.activeLayer, doc.layers.length - 1);
      });
      from.history.top()!.linked = id;
      this.fitFree();
    }
    // Onto the other one, on top, as it was (name, opacity, blend mode, effects), out of any group.
    this.activate(to);
    const put = (doc: PixelDoc) => {
      const copy: Layer = { ...layer, pixels: moved.pixels };
      delete copy.group;
      if (moved.outside) copy.outside = moved.outside;
      else delete copy.outside;
      doc.layers.push(copy);
      doc.activeLayer = doc.layers.length - 1;
    };
    // New free layers start with it: undoing it takes them away rather than going back to nothing.
    this.edit(put);
    to.history.top()!.linked = id;
    this.fitFree();
    if (emptied) {
      link.at = this.sessions.indexOf(from);
      this.sessions = this.sessions.filter((x) => x !== from);
    }
    this.active.picked = [layer.id];
    this.active.unframed = false;
    if (!isFreeZone(dst)) this.notice({ type: 'layerToBoard', board: dst.name });
    this.commit();
    return true;
  }

  /** Moves a board of the active file to (`x`, `y`) in the file. */
  moveBoard(id: string, x: number, y: number): void {
    const s = this.boardsOf(fileIdOf(this.doc)).find((b) => b.doc.id === id);
    if (!s?.doc.board) return;
    s.doc.board = { ...s.doc.board, x: Math.round(x), y: Math.round(y) };
    s.doc.updatedAt = Date.now();
    this.commit();
  }

  /** Renames a board (the file's only one names the file too, as before boards). */
  renameBoard(id: string, name: string): void {
    const s = this.sessions.find((x) => x.doc.id === id);
    const clean = name.trim().slice(0, 120);
    if (!s || !clean || clean === s.doc.name) return;
    s.doc.name = clean;
    s.doc.updatedAt = Date.now();
    this.fresh.delete(id);
    this.commit();
  }

  /** Deletes a board of a file that has others. Returns false when it's the file's only one. */
  deleteBoard(id: string): boolean {
    return this.deleteBoards([id]) > 0;
  }

  /**
   * Deletes boards of the active file, all in one go, which one Undo brings back (with their
   * histories). A file keeps at least one board: when they're all asked for, the first stays.
   * Returns how many were deleted.
   */
  deleteBoards(ids: string[]): number {
    const boards = this.boardsOf(fileIdOf(this.doc));
    const going = boards.filter((b) => ids.includes(b.doc.id) && isBoard(b.doc));
    if (!going.length) return 0;
    this.cancelStroke();
    const index = this.sessions.indexOf(going[0]);
    // Every board going, and no layer outside them: a blank one, not shown, keeps the file (its
    // name, palette and settings) until a board is made.
    const left = boards.filter((b) => !going.includes(b));
    const placeholder = left.length ? undefined : this.blankBoard(boards[0].doc, index);
    this.sessions = this.sessions.filter((x) => !going.includes(x));
    // The file keeps its id while its first board goes: the others still carry it.
    if (going.includes(this.active))
      this.activate(placeholder ?? left.find((b) => isBoard(b.doc)) ?? left[0]);
    this.boardSelection = [];
    this.deleted = { kind: 'file', sessions: going, index, placeholder };
    this.recordDeletion(() => this.deleteBoards(going.map((x) => x.doc.id)));
    this.commit();
    return going.length;
  }

  /** Puts a blank board, not shown, at `index` for a file left with nothing (see `BoardPlace.empty`). */
  private blankBoard(like: PixelDoc, index: number): Session {
    const doc = createDocument(like.name, like.width, like.height, this.labels.layer(1));
    doc.board = { file: fileIdOf(like), fileName: fileNameOf(like), x: 0, y: 0, empty: true };
    doc.render = { ...like.render };
    if (like.palette) doc.palette = { ...like.palette, colors: [...like.palette.colors] };
    if (like.isoGrid) doc.isoGrid = like.isoGrid;
    doc.updatedAt = Date.now();
    const session: Session = { doc, history: new History(), selection: null };
    this.sessions.splice(index, 0, session);
    return session;
  }

  /** The active file's layers outside its boards, as a document placed in the file, if it has any. */
  freeZone(): PixelDoc | null {
    return this.freeOf(fileIdOf(this.doc))?.doc ?? null;
  }

  private freeOf(fileId: string): Session | undefined {
    return this.boardsOf(fileId).find((s) => isFreeZone(s.doc));
  }

  /**
   * Fits the active free layers to what they hold, in the step being made: what was pushed past
   * their edge comes back in, and the empty edges go. Their place moves so nothing moves on screen.
   */
  private fitFree(): void {
    const s = this.active;
    const doc = s.doc;
    if (!isFreeZone(doc) || !doc.board) return;
    let box: Rect | null = null;
    for (const l of doc.layers) {
      const r = layerContent(l.pixels, doc.width, doc.height, l.outside)?.rect;
      if (!r) continue;
      if (!box) box = { ...r };
      else {
        const x = Math.min(box.x, r.x);
        const y = Math.min(box.y, r.y);
        box = {
          x,
          y,
          w: Math.max(box.x + box.w, r.x + r.w) - x,
          h: Math.max(box.y + box.h, r.y + r.h) - y,
        };
      }
    }
    if (!box || (box.x === 0 && box.y === 0 && box.w === doc.width && box.h === doc.height)) return;
    const top = s.history.top();
    if (top) top.resized = true;
    resizeDocument(doc, Math.min(box.w, MAX_SIZE), Math.min(box.h, MAX_SIZE), -box.x, -box.y);
    doc.board = { ...doc.board, x: doc.board.x + box.x, y: doc.board.y + box.y };
    s.selection = null;
  }

  /**
   * Takes a layer off its board and leaves it where it is on the canvas, outside every board, like
   * an object beside the frames in Figma: a Move tool drag let go beside the boards.
   */
  moveLayerOut(layerId: string): boolean {
    const from = this.active;
    const src = from.doc;
    const layer = src.layers.find((l) => l.id === layerId);
    if (!layer || isFreeZone(src)) return false;
    const box = layerContent(layer.pixels, src.width, src.height, layer.outside)?.rect;
    if (!box) return false;
    // A file of one board becomes a file of boards, its board at (0, 0).
    src.board ??= { file: src.id, fileName: src.name, x: 0, y: 0 };
    if (!this.freeOf(src.board.file)) {
      const doc = createDocument(fileNameOf(src), box.w, box.h);
      doc.layers = [];
      doc.board = { ...src.board, x: src.board.x + box.x, y: src.board.y + box.y, free: true };
      delete doc.board.empty;
      doc.backgroundVisible = false;
      doc.render = { ...src.render };
      if (src.palette) doc.palette = { ...src.palette, colors: [...src.palette.colors] };
      if (src.isoGrid) doc.isoGrid = src.isoGrid;
      const boards = this.boardsOf(src.board.file);
      const at = this.sessions.indexOf(boards[boards.length - 1]) + 1;
      this.sessions.splice(at, 0, { doc, history: new History(), selection: null });
    }
    return this.moveLayerToBoard(layerId, this.freeOf(src.board.file)!.doc.id);
  }

  /**
   * Copies a board, layers and all, and makes the copy active: next to it on the right, or at `at`
   * in the file (Alt-drag drops it where the pointer goes).
   */
  duplicateBoard(id: string, at?: Point): void {
    const s = this.sessions.find((x) => x.doc.id === id);
    if (!s) return;
    this.cancelStroke();
    const doc = s.doc;
    doc.board ??= { file: doc.id, fileName: doc.name, x: 0, y: 0 };
    const copy = cloneDocument(doc, false);
    copy.name = this.labels.copyOf(doc.name);
    copy.board = at
      ? { ...doc.board, x: Math.round(at.x), y: Math.round(at.y) }
      : { ...doc.board, x: doc.board.x + doc.width + BOARD_SPACING };
    copy.updatedAt = Date.now();
    const session: Session = { doc: copy, history: new History(), selection: null };
    this.sessions.splice(this.sessions.indexOf(s) + 1, 0, session);
    this.fresh.delete(doc.id);
    this.activate(session);
    this.commit();
  }

  /** Adds a board the size of the active one, beside it on the right. */
  addBoardBeside(): void {
    const { doc } = this;
    if (isEmptyBoard(doc)) return this.addBoard(0, 0, doc.width, doc.height);
    const at = doc.board ?? { x: 0, y: 0 };
    this.addBoard(at.x + doc.width + BOARD_SPACING, at.y, doc.width, doc.height);
  }

  /**
   * Brings back the last deleted file (with its history) or layer, and makes it active.
   * Returns false when it can't anymore: already restored, its file is gone, or the canvas was resized.
   */
  restoreDeleted(): boolean {
    const d = this.deleted;
    if (!d) return false;
    this.deleted = null;
    this.cancelStroke();
    if (d.kind === 'file') {
      // Boards coming back to a file left with no board: its blank board goes.
      const blank = d.placeholder;
      if (blank && isEmptyBoard(blank.doc)) this.sessions = this.sessions.filter((x) => x !== blank);
      this.sessions.splice(Math.min(d.index, this.sessions.length), 0, ...d.sessions);
      this.activate(
        d.sessions.find((x) => x.doc.id === this.lastBoard.get(fileIdOf(x.doc))) ?? d.sessions[0],
      );
      this.commit();
      return true;
    }
    const { width, height } = d.session.doc;
    const entries = d.kind === 'layer' ? [{ layer: d.layer, index: d.index }] : d.entries;
    if (!this.sessions.includes(d.session) || entries.some((x) => x.layer.pixels.length !== width * height))
      return false;
    this.cancelAdjust();
    this.active = d.session;
    this.edit((doc) => {
      const blank = d.kind === 'layers' && d.placeholder;
      if (blank && !blank.pixels.some((c) => c !== 0)) doc.layers = doc.layers.filter((l) => l !== blank);
      // Lowest first, so each layer lands back at its own index.
      for (const { layer, index } of entries) doc.layers.splice(Math.min(index, doc.layers.length), 0, layer);
      // The groups that went away with their layers come back too.
      if (d.kind === 'layers' && d.groups) {
        const kept = new Set((doc.groups ?? []).map((g) => g.id));
        doc.groups = [
          ...(doc.groups ?? []),
          ...d.groups.filter((g) => !kept.has(g.id)).map((g) => ({ ...g })),
        ];
        normalizeGroups(doc);
      }
      doc.activeLayer = doc.layers.indexOf(entries[entries.length - 1].layer);
      this.active.picked = entries.map((x) => x.layer.id);
    });
    return true;
  }

  /* ------------------------------------------------------------------ document */

  /**
   * Changes the canvas size. `offset` is where the old canvas's top-left lands in the new one, in
   * whole pixels; without it the drawing stays centered.
   */
  resize(width: number, height: number, offset?: { x: number; y: number }): void {
    const w = clamp(Math.round(width) || this.doc.width, 1, MAX_SIZE);
    const h = clamp(Math.round(height) || this.doc.height, 1, MAX_SIZE);
    const o = offset ? { x: Math.round(offset.x), y: Math.round(offset.y) } : centeredOffset(this.doc, w, h);
    // The same size can still shift the drawing.
    if (w === this.doc.width && h === this.doc.height && !o.x && !o.y) return;
    this.edit((doc) => {
      this.active.history.top()!.resized = true;
      resizeDocument(doc, w, h, o.x, o.y);
      this.active.selection = null;
    });
  }

  /**
   * Resizes the active board to `rect`, in the file's pixels: a side pulled out grows it on that
   * side, a side pushed in crops it, and the drawing stays where it is in the file. One undo step,
   * which puts the board back where it was too.
   */
  resizeBoardTo(rect: Rect): void {
    const doc = this.doc;
    const at = doc.board ?? { x: 0, y: 0 };
    const w = clamp(Math.round(rect.w), 1, MAX_SIZE);
    const h = clamp(Math.round(rect.h), 1, MAX_SIZE);
    const [x, y] = [Math.round(rect.x), Math.round(rect.y)];
    if (w === doc.width && h === doc.height && x === at.x && y === at.y) return;
    this.edit((d) => {
      this.active.history.top()!.resized = true;
      resizeDocument(d, w, h, at.x - x, at.y - y);
      if (d.board) d.board = { ...d.board, x, y };
      this.active.selection = null;
    });
  }

  setBackground(color: Color, visible = true): void {
    this.edit((doc) => {
      doc.background = color;
      doc.backgroundVisible = visible;
    });
  }

  /**
   * Adds, replaces or removes (null) the reference image. Not undoable, like view settings. A new
   * reference is selected, with the Move tool, so it can be placed right away.
   */
  setReference(reference: ReferenceImage | null): void {
    this.cancelStroke();
    if (reference) {
      this.doc.reference = { ...reference };
      this.active.referencePicked = true;
      this.tool = 'move';
    } else {
      delete this.doc.reference;
      this.active.referencePicked = false;
    }
    this.touch();
    this.commit();
  }

  /** Selects the reference image like a layer, with the Move tool to place it. */
  selectReference(): void {
    if (!this.doc.reference || (this.active.referencePicked && this.tool === 'move')) return;
    this.active.referencePicked = true;
    this.tool = 'move';
    this.commit(false);
  }

  /** Back to the active layer. */
  deselectReference(): void {
    if (!this.active.referencePicked) return;
    this.active.referencePicked = false;
    this.commit(false);
  }

  /**
   * Moves, resizes or changes the reference image. `final` is false during a drag: the canvas redraws
   * but nothing is saved until the gesture ends.
   */
  updateReference(patch: Partial<Omit<ReferenceImage, 'src' | 'width' | 'height'>>, final = true): void {
    const r = this.doc.reference;
    if (!r) return;
    this.doc.reference = { ...r, ...patch, opacity: clamp(patch.opacity ?? r.opacity, 0, 1) };
    if (!final) return this.pixelsChanged();
    this.touch();
    this.commit();
  }

  /** Live background color edits (color picker drags) without an undo step per move. */
  previewBackground(color: Color): void {
    this.doc.background = color;
    this.commit();
  }

  /**
   * Moves a symmetry axis, snapped to half pixels and kept on the canvas. `null`, or the center,
   * puts it back in the middle.
   */
  setMirrorAxis(axis: 'x' | 'y', value: number | null): void {
    const doc = this.doc;
    const size = axis === 'x' ? doc.width : doc.height;
    const key = axis === 'x' ? 'axisX' : 'axisY';
    const next = value === null ? size / 2 : Math.min(size, Math.max(0, Math.round(value * 2) / 2));
    if (next === (doc[key] ?? size / 2)) return;
    if (next === size / 2) delete doc[key];
    else doc[key] = next;
    this.commit();
  }

  /**
   * Adds a guide (`index` null), moves one, or removes it (`at` null). On pixel edges, so `at` is
   * rounded. Returns the guide's index (or -1 once removed).
   */
  setGuide(axis: 'x' | 'y', index: number | null, at: number | null): number {
    const guides = this.doc.guides ?? { x: [], y: [] };
    const list = [...guides[axis]];
    let i = index ?? list.length;
    if (at === null) {
      if (index !== null) list.splice(index, 1);
      i = -1;
    } else list[i] = Math.round(at);
    const next = { ...guides, [axis]: list };
    if (next.x.length || next.y.length) this.doc.guides = next;
    else delete this.doc.guides;
    this.touch();
    this.commit();
    return i;
  }

  /**
   * Turns the file's isometric grid on with diamonds `cell` pixels wide (rounded, see
   * `isoCellSize`), or off with null. The width is remembered for the next file.
   */
  setIsoGrid(cell: number | null): void {
    if (cell === null) delete this.doc.isoGrid;
    else this.doc.isoGrid = this.isoCell = isoCellSize(cell);
    this.touch();
    this.commit();
  }

  /** Adds upright lines to the isometric grid, through its diamonds' corners, or takes them away. */
  setIsoGridVertical(on: boolean): void {
    if (on) this.doc.isoGridVertical = true;
    else delete this.doc.isoGridVertical;
    this.touch();
    this.commit();
  }

  toggleIsoGrid(): void {
    this.setIsoGrid(this.doc.isoGrid ? null : this.isoCell);
  }

  setRender(render: Partial<RenderSettings>): void {
    this.doc.render = {
      pixelSize: clamp(render.pixelSize ?? this.doc.render.pixelSize, 1, 64),
      gap: clamp(render.gap ?? this.doc.render.gap, 0, 64),
    };
    this.touch();
    this.commit();
  }

  flatten(options?: FlattenOptions): Uint32Array {
    return flatten(this.doc, options);
  }

  /* ------------------------------------------------------------------ layers */

  /**
   * The layer the Move tool takes at pixel `p`: the top visible, unlocked layer with a pixel there.
   * -1 when there is none, or with a selection (the selection moves instead).
   */
  layerAt(p: Point): number {
    const { width, height, layers } = this.doc;
    if (this.active.selection || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) return -1;
    const i = p.y * width + p.x;
    for (let k = layers.length - 1; k >= 0; k--) {
      const l = layers[k];
      if (isShown(this.doc, l) && !isLocked(this.doc, l) && l.opacity > 0 && l.pixels[i] >>> 24) return k;
    }
    return -1;
  }

  /**
   * What the Move tool would take at layer `k`: in a group, the whole group (its outermost one),
   * unless the group is selected or one of its layers was picked on its own in the Layers panel.
   */
  private moveTarget(k: number): { group?: string } {
    const s = this.active;
    const layer = this.doc.layers[k];
    if (s.pickedGroup && isWithin(this.doc, layer.group, s.pickedGroup)) return { group: s.pickedGroup };
    const outer = groupChain(this.doc, layer.group).at(-1);
    const entered = !s.pickedGroup && outer && isWithin(this.doc, activeLayer(this.doc).group, outer.id);
    return outer && !entered ? { group: outer.id } : {};
  }

  /**
   * Double-click with the Move tool, like in Figma: one level into the group taken at `p`, its
   * subgroup there if it has one, else the layer itself. Returns false when there's nothing to enter.
   */
  enterAt(p: Point): boolean {
    const k = this.layerAt(p);
    if (k < 0) return false;
    const s = this.active;
    const chain = groupChain(this.doc, this.doc.layers[k].group);
    const at = s.pickedGroup ? chain.findIndex((g) => g.id === s.pickedGroup) : -1;
    if (at > 0) {
      this.selectGroup(chain[at - 1].id);
      return true;
    }
    if (!chain.length || (k === this.doc.activeLayer && !s.pickedGroup)) return false;
    this.setActiveLayer(k);
    return true;
  }

  /**
   * Escape on a layer or a subgroup taken inside a group: the group around it gets selected, like
   * in Figma. Returns false at the top level.
   */
  selectParent(): boolean {
    const s = this.active;
    // Several loose layers picked in the Layers panel have no one group around them.
    if (!s.pickedGroup && (s.unframed || this.state.selectedLayers.length > 1)) return false;
    const parent = s.pickedGroup ? findGroup(this.doc, s.pickedGroup)?.parent : activeLayer(this.doc).group;
    if (!parent) return false;
    this.selectGroup(parent);
    return true;
  }

  /** The layers the Move tool would move from pixel `p` (a layer, or a group's layers), for its outline. */
  moveTargetLayers(p: Point): Layer[] {
    const k = this.layerAt(p);
    if (k < 0) return [];
    const { group } = this.moveTarget(k);
    return group ? groupLayers(this.doc, group).filter((l) => isShown(this.doc, l)) : [this.doc.layers[k]];
  }

  setActiveLayer(index: number): void {
    if (index < 0 || index >= this.doc.layers.length) return;
    const id = this.doc.layers[index].id;
    const s = this.active;
    if (
      index === this.doc.activeLayer &&
      s.picked?.length === 1 &&
      !s.referencePicked &&
      !s.unframed &&
      !s.pickedGroup
    )
      return;
    s.referencePicked = false;
    delete s.pickedGroup;
    s.unframed = false;
    this.doc.activeLayer = index;
    this.active.picked = [id];
    this.active.anchor = id;
    this.commit();
  }

  /**
   * Layer list clicks: `single` selects one layer, `toggle` (Cmd/Ctrl+click) adds or removes one,
   * `range` (Shift+click) selects every layer from the last clicked one. The clicked layer becomes
   * the active one, except when it's toggled off.
   */
  selectLayer(index: number, mode: 'single' | 'toggle' | 'range'): void {
    const layers = this.doc.layers;
    if (!layers[index]) return;
    if (mode === 'single') return this.setActiveLayer(index);
    this.active.referencePicked = false;
    delete this.active.pickedGroup;
    this.active.unframed = false;
    const id = layers[index].id;
    const picked = this.state.selectedLayers;
    if (mode === 'toggle') {
      if (picked.includes(id)) {
        if (picked.length === 1) return;
        const rest = picked.filter((x) => x !== id);
        this.active.picked = rest;
        if (layers[this.doc.activeLayer].id === id)
          this.doc.activeLayer = layers.findIndex((l) => l.id === rest[rest.length - 1]);
      } else {
        this.active.picked = [...picked, id];
        this.doc.activeLayer = index;
      }
      this.active.anchor = id;
    } else {
      const from = layers.findIndex((l) => l.id === this.active.anchor);
      const start = from < 0 ? this.doc.activeLayer : from;
      const [lo, hi] = start < index ? [start, index] : [index, start];
      this.active.picked = layers.slice(lo, hi + 1).map((l) => l.id);
      this.doc.activeLayer = index;
    }
    this.commit(false);
  }

  /** Selected layers, bottom to top. */
  private pickedLayers(): Layer[] {
    const picked = this.state.selectedLayers;
    return this.doc.layers.filter((l) => picked.includes(l.id));
  }

  addLayer(): void {
    this.edit((doc) => {
      doc.layerCounter += 1;
      const layer = createLayer(this.labels.layer(doc.layerCounter), doc.width, doc.height);
      // In the active layer's group, right above it.
      const group = activeLayer(doc).group;
      if (group) layer.group = group;
      doc.layers.splice(doc.activeLayer + 1, 0, layer);
      doc.activeLayer += 1;
      delete this.active.pickedGroup;
    });
  }

  /** Duplicates the selected layers, or the selected group (Shift+D). One undo step. */
  duplicateLayer(): void {
    if (this.active.pickedGroup && !groupLayers(this.doc, this.active.pickedGroup).length) return;
    this.edit(() => this.duplicatePicked());
  }

  /**
   * Copies of the selected layers, each just above its original (in its group), or of the selected
   * group, which become the selection. In place, without an undo step of its own.
   */
  private duplicatePicked(): void {
    const d = this.doc;
    const s = this.active;
    if (s.pickedGroup) return this.duplicateGroupIn(s.pickedGroup);
    const picked = this.state.selectedLayers;
    const active = activeLayer(d).id;
    const copyOf = new Map<string, string>();
    // From the top down, so the indices below stay where they were.
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const layer = d.layers[i];
      if (!picked.includes(layer.id)) continue;
      const copy = cloneLayer(layer, false);
      copy.name = this.labels.copyOf(copy.name);
      d.layers.splice(i + 1, 0, copy);
      copyOf.set(layer.id, copy.id);
    }
    if (!copyOf.size) return;
    const ids = new Set(copyOf.values());
    s.picked = d.layers.filter((l) => ids.has(l.id)).map((l) => l.id);
    const top = copyOf.get(active) ?? s.picked[s.picked.length - 1];
    d.activeLayer = d.layers.findIndex((l) => l.id === top);
    s.anchor = top;
  }

  /**
   * Deletes the selected layers; when they are all of them, an empty layer takes their place. Returns
   * how many were deleted; they can be brought back with `restoreDeleted`.
   */
  deleteLayers(): number {
    const picked = this.pickedLayers();
    if (isFreeZone(this.doc) && picked.length >= this.doc.layers.length) return this.dropFree();
    if (picked.length < 2) return this.deleteLayer() ? 1 : 0;
    this.edit((doc) => {
      const entries = picked.map((layer) => ({ layer, index: doc.layers.indexOf(layer) }));
      const groups = doc.groups?.map((g) => ({ ...g }));
      doc.layers = doc.layers.filter((l) => !picked.includes(l));
      const placeholder = doc.layers.length
        ? undefined
        : createLayer(this.labels.layer(1), doc.width, doc.height);
      if (placeholder) doc.layers.push(placeholder);
      doc.activeLayer = Math.min(doc.layers.length - 1, Math.max(0, entries[0].index - 1));
      normalizeGroups(doc);
      this.deleted = { kind: 'layers', session: this.active, entries, groups, placeholder };
      this.active.picked = [doc.layers[doc.activeLayer].id];
    });
    return picked.length;
  }

  /**
   * Every layer outside the boards deleted: they go, the file opening on a board (or blank, if it
   * has none). `restoreDeleted` brings them back.
   */
  private dropFree(): number {
    const s = this.active;
    const index = this.sessions.indexOf(s);
    const count = s.doc.layers.length;
    this.cancelStroke();
    this.sessions = this.sessions.filter((x) => x !== s);
    const fileId = fileIdOf(s.doc);
    const placeholder = this.boardsOf(fileId).length ? undefined : this.blankBoard(s.doc, index);
    this.activate(placeholder ?? this.boardFor(fileId)!);
    this.deleted = { kind: 'file', sessions: [s], index, placeholder };
    this.recordDeletion(() => {
      this.open(s);
      this.dropFree();
    });
    this.commit();
    return count;
  }

  /** Returns false when nothing was deleted. The layer can be brought back with `restoreDeleted`. */
  deleteLayer(): boolean {
    if (this.doc.layers.length < 2) return false;
    this.edit((doc) => {
      const index = doc.activeLayer;
      const groups = doc.groups?.map((g) => ({ ...g }));
      const [layer] = doc.layers.splice(index, 1);
      doc.activeLayer = Math.max(0, index - 1);
      normalizeGroups(doc);
      // Its group, if it was the last layer in it, comes back with it.
      this.deleted = { kind: 'layers', session: this.active, entries: [{ layer, index }], groups };
    });
    return true;
  }

  /** The selected item (the selected group, or the active layer) and the items beside it in its group. */
  private siblings(): { item: LayerItem; parent: string | undefined; list: LayerNode[]; at: number } {
    const doc = this.doc;
    const g = this.active.pickedGroup;
    const item: LayerItem = g ? { kind: 'group', id: g } : { kind: 'layer', id: activeLayer(doc).id };
    const parent = g ? findGroup(doc, g)?.parent : activeLayer(doc).group;
    const find = (nodes: LayerNode[]): LayerNode[] | null => {
      for (const n of nodes) {
        if (n.kind === 'group') {
          if (n.group.id === parent) return n.children;
          const inner = find(n.children);
          if (inner) return inner;
        }
      }
      return null;
    };
    const list = (parent ? find(layerTree(doc)) : layerTree(doc)) ?? [];
    const at = list.findIndex((n) =>
      n.kind === 'layer' ? item.kind === 'layer' && n.layer.id === item.id : n.group.id === item.id,
    );
    return { item, parent, list, at };
  }

  /** Whether the selected layer or group can move up (1) or down (-1) within its group. */
  canMoveLayer(direction: 1 | -1): boolean {
    const { list, at } = this.siblings();
    return at >= 0 && at + direction >= 0 && at + direction < list.length;
  }

  /** Moves the selected layer or group past its neighbor, within its group (one undo step). */
  moveLayer(direction: 1 | -1): void {
    const { item, parent, list, at } = this.siblings();
    if (!this.canMoveLayer(direction)) return;
    const top = (n: LayerNode) =>
      n.kind === 'layer' ? n.layer.id : groupLayers(this.doc, n.group.id).at(-1)!.id;
    // Up: right above the next item. Down: right above the item two below, or at the group's bottom.
    const below = direction > 0 ? list[at + 1] : list[at - 2];
    this.checkpoint();
    if (!moveItems(this.doc, [item], { parent, aboveLayer: below ? top(below) : null })) {
      this.active.history.discardLast();
      return;
    }
    this.commit();
  }

  /** Drops the dragged layers or groups at a place in the Layers panel (one undo step). */
  moveItemsTo(items: LayerItem[], parent: string | undefined, aboveLayer: string | null): boolean {
    this.checkpoint();
    if (!moveItems(this.doc, items, { parent, aboveLayer })) {
      this.active.history.discardLast();
      if (parent && items.some((i) => i.kind === 'group')) this.notice({ type: 'groupTooDeep' });
      return false;
    }
    this.commit();
    return true;
  }

  /** The selected layers as items of the list (whole groups when all their layers are selected). */
  selectedItems(): LayerItem[] {
    const g = this.active.pickedGroup;
    return g ? [{ kind: 'group', id: g }] : pickedItems(this.doc, this.state.selectedLayers);
  }

  /* ------------------------------------------------------------------ groups */

  /** Selects a group in the Layers panel: all its layers, the top one active. */
  selectGroup(id: string): void {
    const layers = groupLayers(this.doc, id);
    if (!layers.length) return;
    const s = this.active;
    s.referencePicked = false;
    s.unframed = false;
    s.pickedGroup = id;
    s.picked = layers.map((l) => l.id);
    s.anchor = layers[layers.length - 1].id;
    this.doc.activeLayer = this.doc.layers.indexOf(layers[layers.length - 1]);
    this.commit(false);
  }

  /**
   * Puts the selected layers (and groups) in a new group, where the top one was. Returns false when
   * it would go deeper than `MAX_GROUP_DEPTH`.
   */
  groupSelection(): boolean {
    const doc = this.doc;
    const items = this.selectedItems();
    if (!items.length) return false;
    // The new group goes in the innermost group holding every item.
    const chains = items.map((it) => {
      const p =
        it.kind === 'layer' ? doc.layers.find((l) => l.id === it.id)?.group : findGroup(doc, it.id)?.parent;
      return groupChain(doc, p).map((g) => g.id);
    });
    const parent = chains[0].find((id) => chains.every((c) => c.includes(id)));
    const height = Math.max(...items.map((it) => itemHeight(doc, it)));
    if ((parent ? groupDepth(doc, parent) : 0) + 1 + height > MAX_GROUP_DEPTH) {
      this.notice({ type: 'groupTooDeep' });
      return false;
    }
    this.edit((d) => {
      const moving = items.flatMap((it) => itemLayers(d, it));
      // Where the top item sits in the new group's parent: the group holding it there, or itself.
      const topLayer = moving[moving.length - 1];
      const holder = groupChain(d, topLayer.group).find((g) => g.parent === parent);
      const holderTop = holder ? groupLayers(d, holder.id).at(-1)! : topLayer;
      const end = d.layers.indexOf(holderTop);
      const before = d.layers.filter((l, i) => i <= end && !moving.includes(l));
      const after = d.layers.filter((l, i) => i > end && !moving.includes(l));
      const active = d.layers[d.activeLayer];
      d.layers = [...before, ...moving, ...after];
      const group: LayerGroup = {
        id: newId('group'),
        name: this.labels.group((d.groups?.length ?? 0) + 1),
        visible: true,
        locked: false,
        opacity: 1,
        ...(parent && { parent }),
      };
      d.groups = [...(d.groups ?? []), group];
      for (const it of items) {
        if (it.kind === 'layer') d.layers.find((l) => l.id === it.id)!.group = group.id;
        else findGroup(d, it.id)!.parent = group.id;
      }
      d.activeLayer = Math.max(0, d.layers.indexOf(active));
      normalizeGroups(d);
      this.active.pickedGroup = group.id;
      this.active.picked = groupLayers(d, group.id).map((l) => l.id);
    });
    return true;
  }

  /** Takes a group apart: its layers and groups go to the group it was in. */
  ungroup(id: string): void {
    const g = findGroup(this.doc, id);
    if (!g) return;
    this.edit((doc) => {
      for (const l of doc.layers) if (l.group === id) l.group = g.parent;
      for (const c of doc.groups ?? []) if (c.parent === id) c.parent = g.parent;
      doc.groups = (doc.groups ?? []).filter((x) => x.id !== id);
      for (const l of doc.layers) if (!l.group) delete l.group;
      normalizeGroups(doc);
      delete this.active.pickedGroup;
    });
  }

  /** Merges a group into one layer, which keeps the group's name, opacity, blend mode and place. */
  mergeGroup(id: string): void {
    const doc = this.doc;
    const g = findGroup(doc, id);
    const layers = groupLayers(doc, id);
    if (!g || !layers.length) return;
    if (layers.some((l) => isLocked(doc, l))) {
      this.notice({ type: 'layerLocked' });
      return;
    }
    // The group's layers on their own, as if the group were plain and shown.
    const inner = (doc.groups ?? []).filter((x) => x.id !== id && isWithin(doc, x.id, id));
    const pixels = flatten(
      {
        ...doc,
        layers: layers.map((l) => ({ ...l, group: l.group === id ? undefined : l.group })),
        groups: inner.map((x) => ({ ...x, parent: x.parent === id ? undefined : x.parent })),
        background: 0,
      },
      { includeBackground: false },
    );
    this.edit((d) => {
      const merged = createLayer(g.name, d.width, d.height);
      merged.pixels.set(pixels);
      merged.opacity = g.opacity;
      merged.visible = g.visible;
      if (g.blendMode) merged.blendMode = g.blendMode;
      if (g.parent) merged.group = g.parent;
      const at = d.layers.indexOf(layers[0]);
      d.layers = d.layers.filter((l) => !layers.includes(l));
      d.layers.splice(at, 0, merged);
      d.groups = (d.groups ?? []).filter((x) => x.id !== id && !inner.includes(x));
      d.activeLayer = at;
      normalizeGroups(d);
      delete this.active.pickedGroup;
      this.active.picked = [merged.id];
    });
    this.notice({ type: 'merged' });
  }

  /** Duplicates a group with everything in it, right above it, and selects the copy. */
  /** Copies a group (and its subgroups) just above it, the copy becoming the selection. In place. */
  private duplicateGroupIn(id: string): void {
    const d = this.doc;
    const layers = groupLayers(d, id);
    if (!layers.length) return;
    const groups = (d.groups ?? []).filter((x) => isWithin(d, x.id, id));
    const ids = new Map(groups.map((x) => [x.id, newId('group')]));
    const copies = groups.map((x) => ({
      ...x,
      id: ids.get(x.id)!,
      ...(x.id === id && { name: this.labels.copyOf(x.name) }),
      ...(x.parent && ids.has(x.parent) && { parent: ids.get(x.parent)! }),
    }));
    const layerCopies = layers.map((l) => ({ ...cloneLayer(l, false), group: ids.get(l.group!) }));
    const at = d.layers.indexOf(layers[layers.length - 1]) + 1;
    d.layers.splice(at, 0, ...layerCopies);
    d.groups = [...(d.groups ?? []), ...copies];
    d.activeLayer = at + layerCopies.length - 1;
    normalizeGroups(d);
    this.active.pickedGroup = ids.get(id);
    this.active.picked = layerCopies.map((l) => l.id);
  }

  private changeGroup(id: string, change: (g: LayerGroup) => void, history = true): void {
    const g = findGroup(this.doc, id);
    if (!g) return;
    if (history) this.checkpoint();
    change(g);
    this.commit();
  }

  renameGroup(id: string, name: string): void {
    const clean = name.trim().slice(0, 120);
    if (clean && clean !== findGroup(this.doc, id)?.name) this.changeGroup(id, (g) => (g.name = clean));
  }

  setGroupVisible(id: string, visible: boolean): void {
    this.changeGroup(id, (g) => (g.visible = visible));
  }

  setGroupLocked(id: string, locked: boolean): void {
    this.changeGroup(id, (g) => (g.locked = locked));
  }

  setGroupBlendMode(id: string, mode: GroupBlendMode): void {
    this.endBlendPreview();
    if ((findGroup(this.doc, id)?.blendMode ?? 'pass-through') === mode) return;
    this.changeGroup(id, (g) => {
      if (mode === 'pass-through') delete g.blendMode;
      else g.blendMode = mode;
    });
  }

  /** Opacity drags: one undo step per gesture. Call with `done` on release. */
  setGroupOpacity(id: string, opacity: number, done = false): void {
    const g = findGroup(this.doc, id);
    if (!g) return;
    if (!this.opacityChange) {
      this.checkpoint();
      this.opacityChange = true;
    }
    g.opacity = clamp(opacity, 0, 1);
    if (done) {
      this.opacityChange = false;
      this.commit();
    } else this.pixelsChanged();
  }

  /** Folds or unfolds a group in the Layers panel (not an undo step). */
  setGroupCollapsed(id: string, collapsed: boolean): void {
    this.changeGroup(id, (g) => (collapsed ? (g.collapsed = true) : delete g.collapsed), false);
  }

  /** Moves a layer to another position (indices bottom to top), as one undo step. It stays active. */
  reorderLayer(from: number, to: number): void {
    const n = this.doc.layers.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    this.edit((doc) => {
      const [layer] = doc.layers.splice(from, 1);
      doc.layers.splice(to, 0, layer);
      doc.activeLayer = to;
    });
  }

  /** Whether the active layer has a layer below it in the same group, to merge down into. */
  canMergeDown(): boolean {
    const i = this.doc.activeLayer;
    return i > 0 && this.doc.layers[i - 1].group === this.doc.layers[i].group && !this.active.pickedGroup;
  }

  /**
   * Orders layers by depth for an isometric scene: the lower a layer's drawing reaches on screen,
   * the nearer the front. Sorts the selected layers when several are, every layer otherwise; each
   * group's layers stay in their group, and empty layers stay where they are. Returns how many
   * layers changed place (0: already in order, nothing done).
   */
  sortByDepth(): number {
    const doc = this.doc;
    const { width: W, height: H } = doc;
    const picked = this.state.selectedLayers;
    const scope = picked.length > 1 ? new Set(picked) : null;
    const bottom = (l: Layer) => {
      const c = layerContent(l.pixels, W, H, l.outside);
      return c ? c.rect.y + c.rect.h : null;
    };
    // The slots of each group's layers to sort, bottom to top: they're sorted among themselves.
    const slots = new Map<string, number[]>();
    doc.layers.forEach((l, i) => {
      if ((scope && !scope.has(l.id)) || bottom(l) === null) return;
      const key = l.group ?? '';
      slots.set(key, [...(slots.get(key) ?? []), i]);
    });
    const order = doc.layers.slice();
    for (const indices of slots.values()) {
      // Stable: layers reaching as low keep their order.
      const sorted = indices.map((i) => doc.layers[i]).sort((a, b) => bottom(a)! - bottom(b)!);
      indices.forEach((i, k) => (order[i] = sorted[k]));
    }
    const moved = order.filter((l, i) => l !== doc.layers[i]).length;
    if (!moved) return 0;
    const active = doc.layers[doc.activeLayer].id;
    this.edit((d) => {
      d.layers = order;
      d.activeLayer = order.findIndex((l) => l.id === active);
    });
    return moved;
  }

  mergeDown(): void {
    const i = this.doc.activeLayer;
    if (!this.canMergeDown()) return;
    if (this.doc.layers[i].locked || this.doc.layers[i - 1].locked) {
      this.notice({ type: 'layerLocked' });
      return;
    }
    this.edit((doc) => {
      // Merged into an instance, it becomes plain pixels: they're no longer its master's.
      detachInstance(doc.layers[i - 1]);
      mergeLayerInto(doc.layers[i], doc.layers[i - 1], doc.width, doc.height);
      doc.layers.splice(i, 1);
      doc.activeLayer = i - 1;
    });
    this.notice({ type: 'merged' });
  }

  /** Merges the selected visible layers into the lowest of them, as one undo step. */
  mergeLayers(): void {
    this.mergeInto(this.pickedLayers().filter((l) => l.visible));
  }

  /** Merges every visible layer into one and drops the hidden ones, as one undo step. */
  flattenImage(): void {
    const visible = this.doc.layers.filter((l) => isShown(this.doc, l));
    const [bottom] = visible;
    if (!visible.length || (visible.length === 1 && this.doc.layers.length === 1 && !this.doc.groups)) return;
    if (visible.some((l) => l.locked)) {
      this.notice({ type: 'layerLocked' });
      return;
    }
    this.edit((doc) => {
      // The image as shown, groups included, in the bottom layer.
      bottom.pixels.set(flatten(doc, { includeBackground: false }));
      bottom.opacity = 1;
      delete bottom.blendMode;
      delete bottom.group;
      bottom.visible = true;
      doc.layers = [bottom];
      delete doc.groups;
      doc.activeLayer = 0;
    });
    this.notice({ type: 'merged' });
  }

  private mergeInto(layers: Layer[]): void {
    if (layers.length < 2) return;
    if (layers.some((l) => l.locked)) {
      this.notice({ type: 'layerLocked' });
      return;
    }
    this.edit((doc) => {
      const [bottom, ...rest] = layers;
      detachInstance(bottom);
      for (const layer of rest) mergeLayerInto(layer, bottom, doc.width, doc.height);
      doc.layers = doc.layers.filter((l) => !rest.includes(l));
      doc.activeLayer = doc.layers.indexOf(bottom);
      normalizeGroups(doc);
      delete this.active.pickedGroup;
    });
    this.notice({ type: 'merged' });
  }

  /**
   * Moves the selected layers together, keeping their order, so they land at `slot` (0 = bottom,
   * layers.length = top, counted before the move). One undo step.
   */
  moveLayersTo(slot: number): void {
    const picked = this.pickedLayers();
    const layers = this.doc.layers;
    const rest = layers.filter((l) => !picked.includes(l));
    const at = layers.slice(0, Math.max(0, slot)).filter((l) => !picked.includes(l)).length;
    const next = [...rest.slice(0, at), ...picked, ...rest.slice(at)];
    if (next.every((l, i) => l === layers[i])) return;
    this.edit((doc) => {
      const active = doc.layers[doc.activeLayer];
      doc.layers = next;
      doc.activeLayer = next.indexOf(active);
      normalizeGroups(doc);
    });
  }

  /** Merges every visible layer into the lowest visible one, as one undo step. */
  mergeVisible(): void {
    this.mergeInto(this.doc.layers.filter((l) => isShown(this.doc, l)));
  }

  setLayerVisible(index: number, visible: boolean): void {
    this.edit((doc) => {
      doc.layers[index].visible = visible;
    });
  }

  /** Shows only this layer. If it already was the only visible one, shows every layer again. */
  soloLayer(index: number): void {
    if (!this.doc.layers[index]) return;
    const alone = this.doc.layers.every((l, i) => l.visible === (i === index));
    this.edit((doc) => doc.layers.forEach((l, i) => (l.visible = alone || i === index)));
  }

  setLayerLocked(index: number, locked: boolean): void {
    if (!this.doc.layers[index]) return;
    this.edit((doc) => {
      doc.layers[index].locked = locked;
    });
  }

  /**
   * Paint on a locked layer, or on an instance (its pixels come from its master): tells the user
   * why nothing happens. `moving`: an instance can still be moved.
   */
  private activeLocked(moving = false): boolean {
    const layer = activeLayer(this.doc);
    if (isLocked(this.doc, layer)) {
      this.notice({ type: 'layerLocked' });
      return true;
    }
    if (!moving && isLinkedInstance(this.doc, layer)) {
      this.notice({ type: 'instanceLocked' });
      return true;
    }
    return false;
  }

  renameLayer(index: number, name: string): void {
    const clean = name.trim().slice(0, 120);
    if (!clean || clean === this.doc.layers[index]?.name) return;
    this.edit((doc) => {
      doc.layers[index].name = clean;
    });
  }

  /** Opacity drags: one undo step per gesture. Call with `done` on release. */
  /**
   * Shows the active layer in another blend mode without keeping it (hovering the blend mode menu);
   * `null` shows it as it was. Not in the history: `endBlendPreview` puts it back.
   */
  previewLayerBlendMode(mode: BlendMode | null): void {
    this.previewBlend(activeLayer(this.doc), mode === 'normal' ? undefined : mode);
  }

  /** The same for a group; `pass-through` is its own default. */
  previewGroupBlendMode(id: string, mode: GroupBlendMode | null): void {
    const group = findGroup(this.doc, id);
    if (group) this.previewBlend(group, mode === 'pass-through' ? undefined : mode);
  }

  /** `null`: as it was before the preview; `undefined`: the default (normal, or pass-through). */
  private previewBlend(target: Layer | LayerGroup, mode: BlendMode | undefined | null): void {
    if (this.blendPreview && this.blendPreview.target !== target) this.endBlendPreview();
    if (!this.blendPreview) this.blendPreview = { target, mode: target.blendMode };
    const next = mode === null ? this.blendPreview.mode : mode;
    if (target.blendMode === next) return;
    if (next) target.blendMode = next;
    else delete target.blendMode;
    this.pixelsChanged();
  }

  endBlendPreview(): void {
    const p = this.blendPreview;
    if (!p) return;
    this.blendPreview = null;
    if (p.mode) p.target.blendMode = p.mode;
    else delete p.target.blendMode;
    this.pixelsChanged();
  }

  /** The active layer's blend mode, as one undo step. */
  setLayerBlendMode(mode: BlendMode): void {
    this.endBlendPreview();
    const layer = activeLayer(this.doc);
    if ((layer.blendMode ?? 'normal') === mode) return;
    this.checkpoint();
    if (mode === 'normal') delete layer.blendMode;
    else layer.blendMode = mode;
    this.commit();
  }

  setLayerOpacity(opacity: number, done = false): void {
    if (!this.opacityChange) {
      this.checkpoint();
      this.opacityChange = true;
    }
    activeLayer(this.doc).opacity = clamp(opacity, 0, 1);
    if (done) {
      this.opacityChange = false;
      this.commit();
    } else this.pixelsChanged();
  }

  /* ------------------------------------------------------------------ effects */

  /**
   * Adds an effect to the active layer, on top of its list. Outlines and shadows start in the
   * palette's darkest color, glows in the primary one.
   */
  addEffect(type: EffectType): void {
    const colors = this.palette.colors.filter((c) => alpha(c) === 255);
    const darkest = colors.reduce<Color | null>(
      (d, c) => (d === null || toOklab(c)[0] < toOklab(d)[0] ? c : d),
      null,
    );
    const color = type === 'glow' ? this.primary : (darkest ?? 0xff000000);
    this.edit((doc) => {
      const layer = activeLayer(doc);
      layer.effects = [newEffect(type, color), ...(layer.effects ?? [])];
    });
  }

  /** Changes an effect of the active layer. While dragging (`done` false), one undo step in all. */
  setEffect(index: number, patch: Partial<LayerEffect>, done = true): void {
    const effects = activeLayer(this.doc).effects;
    if (!effects?.[index]) return;
    if (!this.effectChange) {
      this.checkpoint();
      this.effectChange = true;
    }
    effects[index] = { ...effects[index], ...patch } as LayerEffect;
    if (done) {
      this.effectChange = false;
      this.commit();
    } else {
      this.refresh();
      this.listeners.forEach((l) => l());
      this.pixelsChanged();
    }
  }

  removeEffect(index: number): void {
    const effects = activeLayer(this.doc).effects;
    if (!effects?.[index]) return;
    this.edit((doc) => {
      const layer = activeLayer(doc);
      layer.effects = layer.effects!.filter((_, k) => k !== index);
      if (!layer.effects.length) delete layer.effects;
    });
  }

  /** Writes the active layer's visible effects into its pixels, and removes them all. */
  applyEffects(): void {
    if (!activeLayer(this.doc).effects || this.activeLocked()) return;
    this.edit((doc) => bakeEffects(activeLayer(doc), doc.width, doc.height));
  }

  /* ------------------------------------------------------------------ colors & palette */

  setColor(slot: 'primary' | 'secondary', color: Color): void {
    this[slot] = color >>> 0;
    this.commit();
  }

  /** Moves colors to the front of the recent colors (transparent ones are skipped). */
  private remember(...colors: Color[]): void {
    const fresh = colors.filter((c) => alpha(c) > 0).map((c) => c >>> 0);
    if (!fresh.length) return;
    this.recent = [...new Set([...fresh, ...this.recent])].slice(0, RECENT_COLORS);
  }

  swapColors(): void {
    [this.primary, this.secondary] = [this.secondary, this.primary];
    this.commit();
  }

  /** A preset, the file's own colors ('custom'), or the colors of the drawing ('drawing'). */
  setPalettePreset(key: string): void {
    const colors =
      key === 'custom' ? (this.palette.custom ?? []) : key === 'drawing' ? [] : presetColors(key);
    this.paletteStep();
    this.palette = { ...this.palette, key, colors };
    this.commit();
  }

  /* ------------------------------------------------------------------ my palettes */

  /** Keeps `colors` (the file's palette by default) as a palette of the user's own; returns its id. */
  savePalette(name: string, colors: Color[] = this.palette.colors): string | null {
    const unique = [...new Set(colors.map(opaque))];
    if (!unique.length) {
      this.notice({ type: 'emptyDrawing' });
      return null;
    }
    const id = newId('palette');
    this.myPalettes = [
      ...this.myPalettes,
      { id, name: name.trim() || this.labels.palette(this.myPalettes.length + 1), colors: unique },
    ];
    this.commit();
    return id;
  }

  renamePalette(id: string, name: string): void {
    const n = name.trim();
    if (!n) return;
    this.myPalettes = this.myPalettes.map((m) => (m.id === id ? { ...m, name: n.slice(0, 60) } : m));
    this.commit();
  }

  /** Replaces one of the user's palettes with the file's palette. */
  updatePalette(id: string): void {
    const colors = [...new Set(this.palette.colors.map(opaque))];
    if (!colors.length) return;
    this.myPalettes = this.myPalettes.map((m) => (m.id === id ? { ...m, colors } : m));
    this.commit();
  }

  deletePalette(id: string): void {
    this.myPalettes = this.myPalettes.filter((m) => m.id !== id);
    this.commit();
  }

  /** Copies one of the user's palettes into the file: later changes to either don't reach the other. */
  useMyPalette(id: string): void {
    const m = this.myPalettes.find((x) => x.id === id);
    if (!m) return;
    this.paletteStep();
    this.palette = { key: MY_PALETTE + id, colors: m.colors, custom: this.palette.custom };
    this.commit();
  }

  /** Forgets the custom palette, unless it's the one in use. */
  deleteCustomPalette(): void {
    if (this.palette.key === 'custom' || !this.palette.custom) return;
    this.palette = { ...this.palette, custom: null };
    this.commit();
  }

  /** Replaces the palette with custom colors. */
  setPaletteColors(colors: Color[]): void {
    this.paletteStep();
    this.usePalette(colors);
    this.commit();
  }

  /** Records the palette as it is, so the change about to be made to it can be undone. */
  private paletteStep(): void {
    this.cancelStroke();
    this.checkpoint();
    this.active.history.top()!.palette = this.savedPalette();
  }

  /** The file's palette as saved in it, for the history. */
  private savedPalette(): DocPalette {
    return this.doc.palette ?? { key: 'drawing', colors: [] };
  }

  /** Sets the palette (as a custom one) without publishing the change. */
  private usePalette(colors: Color[]): void {
    const unique = [...new Set(colors.map(opaque))];
    this.palette = { key: 'custom', colors: unique, custom: unique };
  }

  addToPalette(color: Color = this.primary): void {
    const c = opaque(color);
    if (this.palette.colors.includes(c)) {
      this.notice({ type: 'colorInPalette' });
      return;
    }
    this.setPaletteColors([...this.palette.colors, c]);
  }

  removeFromPalette(color: Color = this.primary): void {
    const c = opaque(color);
    if (!this.palette.colors.includes(c)) {
      this.notice({ type: 'colorNotInPalette' });
      return;
    }
    this.setPaletteColors(this.palette.colors.filter((x) => x !== c));
  }

  /**
   * Replaces a color with another in every unlocked layer (each pixel keeps its opacity), and in
   * the palette: one undo step for both. Returns how many pixels changed.
   */
  replaceColor(from: Color, to: Color): number {
    const a = opaque(from);
    const b = opaque(to);
    if (a === b || !alpha(to)) return 0;
    const layers = this.doc.layers.filter((l) => !l.locked);
    const hits = layers.map((l) => l.pixels.some((c) => alpha(c) > 0 && opaque(c) === a));
    const inPalette = this.palette.colors.includes(a);
    if (!hits.some(Boolean) && !inPalette) return 0;
    this.cancelStroke();
    this.checkpoint();
    this.active.history.top()!.palette = this.savedPalette();
    let count = 0;
    layers.forEach((layer, k) => {
      if (!hits[k]) return;
      const px = layer.pixels;
      for (let i = 0; i < px.length; i++)
        if (alpha(px[i]) > 0 && opaque(px[i]) === a) {
          px[i] = withAlpha(b, alpha(px[i]));
          count++;
        }
    });
    // The swatch takes the new color, unless the palette has it already (or is the drawing's).
    if (inPalette && this.palette.key !== 'drawing')
      this.usePalette(this.palette.colors.map((c) => (c === a ? b : c)));
    this.commit();
    return count;
  }

  addRamp(): void {
    const added = hueShiftedRamp(this.primary).filter((c) => !this.palette.colors.includes(c));
    this.setPaletteColors([...this.palette.colors, ...added]);
    this.notice({ type: 'rampAdded', count: added.length });
  }

  /** Moves a palette color to another position (a preset becomes a custom palette, like any edit). */
  movePaletteColor(from: number, to: number): void {
    const colors = [...this.palette.colors];
    if (from === to || !colors[from] || to < 0 || to >= colors.length) return;
    const [color] = colors.splice(from, 1);
    colors.splice(to, 0, color);
    this.setPaletteColors(colors);
  }

  sortPalette(): void {
    // The colors of the drawing are sorted already: a copy would just stop following the drawing.
    if (this.palette.key === 'drawing') return;
    this.setPaletteColors(sortByLightness(this.palette.colors));
  }

  paletteFromDrawing(): void {
    const colors = uniqueColors(this.flatten());
    if (!colors.length) {
      this.notice({ type: 'emptyDrawing' });
      return;
    }
    this.setPaletteColors(sortByLightness(colors));
    this.notice({ type: 'extracted', count: colors.length });
  }

  /* ------------------------------------------------------------------ tools & view */

  setTool(tool: ToolId): void {
    if (this.stroke) this.endStroke();
    this.tool = tool;
    this.commit();
  }

  setOption<K extends keyof ToolOptions>(key: K, value: ToolOptions[K]): void {
    this.options = { ...this.options, [key]: value };
    if (key.startsWith('gradient')) this.redrawGradient();
    if (key.startsWith('box')) this.redrawVolume();
    this.commit();
  }

  /** Redraws the last box, cylinder or pyramid with the current options, in place (no undo step of its own). */
  private redrawVolume(): void {
    const v = this.lastVolume;
    if (!v || !VOLUMES.includes(this.tool) || !this.doc.layers.includes(v.stroke.layer)) return;
    const layer = v.stroke.layer;
    if (layer.pixels.length !== v.result.length || changed(v.result, layer.pixels)) return;
    v.stroke.options = this.options;
    v.repaint();
    syncInstances(this.doc, layer.id);
    v.result = layer.pixels.slice();
    this.pixelsChanged();
  }

  /** The last gradient, still on its layer as drawn, or null. */
  private editableGradient() {
    const g = this.lastGradient;
    if (!g || this.tool !== 'gradient' || !this.doc.layers.includes(g.layer)) return null;
    return g.layer.pixels.length === g.result.length && !changed(g.result, g.layer.pixels) ? g : null;
  }

  /** Redraws the last gradient with the current options, in place (no undo step of its own). */
  private redrawGradient(a?: Point, b?: Point): boolean {
    const g = this.editableGradient();
    if (!g) return false;
    if (a && b) Object.assign(g, { a, b });
    paintGradient(
      g.layer.pixels,
      g.base,
      g.mask,
      this.doc.width,
      this.options,
      stopsOf(this.options, this.primary, this.secondary),
      g.a,
      g.b,
    );
    syncInstances(this.doc, g.layer.id);
    g.result = g.layer.pixels.slice();
    this.pixelsChanged();
    return true;
  }

  /** Turns the last gradient by 90° around its middle (clockwise). Returns false without one. */
  rotateGradient(): boolean {
    const g = this.editableGradient();
    if (!g) return false;
    const cx = (g.a.x + g.b.x) / 2;
    const cy = (g.a.y + g.b.y) / 2;
    const turn = (p: Point) => ({ x: Math.round(cx - (p.y - cy)), y: Math.round(cy + (p.x - cx)) });
    this.redrawGradient(turn(g.a), turn(g.b));
    this.commit();
    return true;
  }

  /** Reverses the gradient's stops (the last one first), and redraws the last gradient. */
  reverseGradient(): void {
    const stops = stopsOf(this.options, this.primary, this.secondary);
    this.setOption('gradientStops', stops.map((s) => ({ at: 1 - s.at, color: s.color })).reverse());
  }

  setView<K extends keyof ViewSettings>(key: K, value: ViewSettings[K]): void {
    this.view = { ...this.view, [key]: value };
    this.commit();
  }

  toggleView(key: ViewToggle): void {
    this.setView(key, !this.view[key]);
  }

  getPreferences(): Preferences {
    return {
      tool: this.tool,
      options: this.options,
      primary: this.primary,
      secondary: this.secondary,
      recent: this.recent,
      view: this.view,
      brushes: this.brushes.map((b) => ({ ...b, pixels: [...b.pixels] })),
      myPalettes: this.myPalettes,
      isoCell: this.isoCell,
    };
  }

  setPreferences(p: Partial<Preferences>): void {
    if (p.tool && p.tool in TOOLS) this.tool = p.tool;
    if (p.options) {
      const o = { ...DEFAULT_TOOL_OPTIONS, ...p.options };
      this.options = {
        ...o,
        gradientStops: cleanStops(o.gradientStops),
        gradientShape: GRADIENT_SHAPES.includes(o.gradientShape) ? o.gradientShape : 'linear',
        gradientDither: GRADIENT_DITHERS.includes(o.gradientDither) ? o.gradientDither : 'bayer',
        plane: ISO_PLANES.includes(o.plane) ? o.plane : 'flat',
      };
    }
    if (typeof p.primary === 'number') this.primary = p.primary >>> 0;
    if (typeof p.secondary === 'number') this.secondary = p.secondary >>> 0;
    if (p.view) {
      const { grid, tile, tileOpacity, mirrorX, mirrorY, rulers } = { ...this.view, ...p.view };
      // Older saves also had showGap, and no tileOpacity.
      this.view = {
        grid,
        tile,
        tileOpacity: typeof tileOpacity === 'number' ? clamp(tileOpacity, 0, 1) : DEFAULT_TILE_OPACITY,
        mirrorX,
        mirrorY,
        rulers: rulers === true,
      };
    }
    if (typeof p.isoCell === 'number') this.isoCell = isoCellSize(p.isoCell);
    if (Array.isArray(p.myPalettes))
      this.myPalettes = p.myPalettes
        .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && Array.isArray(m.colors))
        .map((m) => ({
          id: m.id,
          name: m.name.slice(0, 60),
          colors: m.colors
            .filter((c) => typeof c === 'number')
            .map(opaque)
            .slice(0, 256),
        }));
    if (Array.isArray(p.brushes))
      this.brushes = p.brushes
        .filter((b) => b && typeof b.id === 'string' && b.width > 0 && b.height > 0)
        .filter((b) => Array.isArray(b.pixels) && b.pixels.length === b.width * b.height)
        .map((b) => ({ ...b, pixels: Uint32Array.from(b.pixels) }));
    if (Array.isArray(p.recent))
      this.recent = p.recent.filter((c) => typeof c === 'number').slice(0, RECENT_COLORS);
    // The palette used to be saved here, for every file; it belongs to each file now.
    this.commit(false);
  }

  /* ------------------------------------------------------------------ custom brushes */

  /** The custom brush the Pencil and Lasso fill paint with, if one is chosen. */
  private strokeBrush(): PixelBlock | null {
    if (this.tool !== 'pencil' && this.tool !== 'lassoFill') return null;
    const b = this.brushes.find((x) => x.id === this.options.customBrush);
    return b ? { width: b.width, height: b.height, pixels: b.pixels } : null;
  }

  /**
   * Makes a custom brush from the active layer's pixels in the selection (trimmed to what's
   * drawn there), and paints with it. Returns false when the selection is empty.
   */
  brushFromSelection(): boolean {
    const sel = this.active.selection;
    if (!sel) return false;
    const { width, height } = this.doc;
    const r = clipSelection(sel, width, height);
    if (!r) return false;
    const block = maskBlock(extractBlock(activeLayer(this.doc).pixels, width, height, r), r);
    const bounds = pixelBounds(block.pixels, block.width, block.height);
    if (!bounds) return false;
    let brush = extractBlock(block.pixels, block.width, block.height, bounds);
    const k = Math.min(1, MAX_BRUSH / Math.max(brush.width, brush.height));
    if (k < 1) brush = scaleBlock(brush, brush.width * k, brush.height * k);
    const n = this.brushes.length + 1;
    const id = newId('brush');
    this.brushes = [
      ...this.brushes,
      { id, name: this.labels.brush(n), width: brush.width, height: brush.height, pixels: brush.pixels },
    ];
    this.options = { ...this.options, customBrush: id };
    this.tool = this.tool === 'lassoFill' ? 'lassoFill' : 'pencil';
    this.commit();
    return true;
  }

  /** A custom brush's pixels, for the preview under the pointer. */
  brushPixels(id: string | null): PixelBlock | null {
    const b = this.brushes.find((x) => x.id === id);
    return b ? { width: b.width, height: b.height, pixels: b.pixels } : null;
  }

  deleteBrush(id: string): void {
    this.brushes = this.brushes.filter((b) => b.id !== id);
    if (this.options.customBrush === id) this.options = { ...this.options, customBrush: null };
    this.commit();
  }

  /* ------------------------------------------------------------------ selection & clipboard */

  selectAll(): void {
    this.active.selection = { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
    this.commit(false);
  }

  deselect(): void {
    if (!this.active.selection) return;
    this.active.selection = null;
    this.commit(false);
  }

  /** Selects what wasn't, and lets go of what was (nothing selected: everything). */
  invertSelection(): void {
    const { width, height } = this.doc;
    const mask = toCanvasMask(this.active.selection, width, height);
    for (let i = 0; i < mask.length; i++) mask[i] = 1 - mask[i];
    this.active.selection = fromCanvasMask(mask, width, height);
    this.commit(false);
  }

  /**
   * Escape with no pixel selection: back to the active layer alone, without the Move tool's frame
   * (as a click beside every layer), and out of a multiple or group selection. The active layer
   * stays: it's where drawing goes. Returns false when there was nothing to drop.
   */
  deselectLayers(): boolean {
    const s = this.active;
    const multiple = !!s.pickedGroup || this.state.selectedLayers.length > 1;
    if (s.unframed && !multiple) return false;
    delete s.pickedGroup;
    s.picked = [activeLayer(this.doc).id];
    s.unframed = true;
    this.commit(false);
    return true;
  }

  /* ------------------------------------------------------------------ repeat grid */

  /**
   * Starts a repeat grid, set up live with `setRepeat`, then kept or dropped with `endRepeat`. It
   * repeats an instance or a component as instances, else the pixel selection, else what's drawn
   * on the active layer. Returns false when there's nothing to repeat.
   */
  beginRepeat(): boolean {
    if (this.repeatSession) this.endRepeat(false);
    const doc = this.doc;
    const layer = activeLayer(doc);
    const selection = this.active.selection;
    let source: RepeatSource;
    const master = layer.instance && findMaster(doc, layer.instance.of);
    if (master?.component && layer.instance) {
      const { w, h } = master.component;
      source = { kind: 'instances', layer, of: master.id, x: layer.instance.x, y: layer.instance.y, w, h };
    } else if (layer.component && !selection) {
      const { x, y, w, h } = layer.component;
      source = { kind: 'instances', layer, of: layer.id, x, y, w, h };
    } else {
      if (this.activeLocked()) return false;
      const rect = selection
        ? clipSelection(selection, doc.width, doc.height)
        : pixelBounds(layer.pixels, doc.width, doc.height);
      if (!rect || !rect.w || !rect.h) {
        this.notice({ type: 'emptyDrawing' });
        return false;
      }
      source = { kind: 'pixels', layer, rect };
    }
    this.checkpoint();
    this.repeatSession = {
      source,
      base: layer.pixels.slice(),
      layers: doc.layers.slice(),
      picked: [...this.state.selectedLayers],
      activeLayer: doc.activeLayer,
      grid: this.lastRepeat,
    };
    this.setRepeat(this.lastRepeat);
    return true;
  }

  /** Lays the repeat grid out again with new numbers: live, from where it started. */
  setRepeat(grid: RepeatGrid): void {
    const r = this.repeatSession;
    if (!r) return;
    const { source } = r;
    const size = source.kind === 'pixels' ? source.rect : source;
    r.grid = clampGrid(grid, size.w, size.h);
    const doc = this.doc;
    doc.layers = r.layers.slice();
    doc.activeLayer = r.activeLayer;
    const added = applyRepeat(doc, source, r.base, r.grid);
    // Instances: the original and its copies are selected, so they move together.
    this.active.picked = added.length ? [source.layer.id, ...added] : r.picked;
    // Shown live, saved once kept.
    this.commit(false);
  }

  /** Keeps the repeat grid (one undo step), or drops it and puts everything back. */
  endRepeat(keep: boolean): void {
    const r = this.repeatSession;
    if (!r) return;
    this.repeatSession = null;
    if (keep) {
      this.lastRepeat = r.grid;
      this.commit();
      return;
    }
    this.doc.layers = r.layers;
    this.doc.activeLayer = r.activeLayer;
    r.source.layer.pixels.set(r.base);
    this.active.picked = r.picked;
    syncInstances(this.doc);
    this.active.history.discardLast();
    this.commit(false);
  }

  /* ------------------------------------------------------------------ extrusion */

  /**
   * Starts pulling a flat shape up into an isometric volume (see `extrude`): the pixel selection,
   * or what's drawn on the active layer. Set up live with `setExtrude`, then kept or dropped with
   * `endExtrude`. Returns false when there's nothing to extrude.
   */
  beginExtrude(): boolean {
    if (this.extrudeSession) this.endExtrude(false);
    if (this.repeatSession) this.endRepeat(true);
    if (this.activeLocked()) return false;
    const { width: W, height: H } = this.doc;
    const layer = activeLayer(this.doc);
    const sel = this.active.selection;
    const region = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (layer.pixels[y * W + x] >>> 24 && inSelection(sel, x, y)) region[y * W + x] = 1;
    if (!region.includes(1)) {
      this.notice({ type: 'emptyDrawing' });
      return false;
    }
    this.cancelStroke();
    this.checkpoint();
    this.extrudeSession = {
      layer,
      base: layer.pixels.slice(),
      baseOutside: layer.outside,
      region,
      selection: sel,
      options: this.lastExtrude,
    };
    this.setExtrude(this.lastExtrude);
    return true;
  }

  /** Pulls the shape up again with new settings: live, from how the layer was. */
  setExtrude(options: ExtrudeOptions): void {
    const x = this.extrudeSession;
    if (!x) return;
    const { width: W, height: H } = this.doc;
    x.options = { ...options, height: Math.max(0, Math.min(256, Math.round(options.height))) };
    x.layer.pixels.set(x.base);
    x.layer.outside = x.baseOutside;
    const { covered, outside } = extrude(x.layer.pixels, W, H, x.region, x.options, this.paletteIndex);
    const kept = addOutside(x.baseOutside, outside, W, H);
    if (kept) x.layer.outside = kept;
    else delete x.layer.outside;
    // The volume is selected, ready to move into place.
    if (x.selection) this.active.selection = fromCanvasMask(covered, W, H);
    syncInstances(this.doc, x.layer.id);
    this.commit(false);
  }

  /** Keeps the extrusion (one undo step), or drops it and puts the layer back. */
  endExtrude(keep: boolean): void {
    const x = this.extrudeSession;
    if (!x) return;
    this.extrudeSession = null;
    if (keep) {
      this.lastExtrude = x.options;
      this.commit();
      return;
    }
    x.layer.pixels.set(x.base);
    if (x.baseOutside) x.layer.outside = x.baseOutside;
    else delete x.layer.outside;
    this.active.selection = x.selection;
    syncInstances(this.doc, x.layer.id);
    this.active.history.discardLast();
    this.commit(false);
  }

  /* ------------------------------------------------------------------ components */

  /**
   * Turns the active layer into a component (Ctrl/Cmd+Alt+K): its sprite is the selection, or
   * else what's drawn on it. Returns false when there's nothing to make one of.
   */
  createComponent(): boolean {
    const doc = this.doc;
    const layer = activeLayer(doc);
    if (isLinkedInstance(doc, layer)) {
      this.notice({ type: 'instanceLocked' });
      return false;
    }
    const frame = this.active.selection ?? pixelBounds(layer.pixels, doc.width, doc.height);
    if (!frame) {
      this.notice({ type: 'emptyDrawing' });
      return false;
    }
    this.active.selection = null;
    this.edit((d) => makeComponent(d, d.activeLayer, frame));
    this.notice({ type: 'componentCreated' });
    return true;
  }

  /** From an instance: its component becomes the active layer, to edit every copy at once. */
  goToMaster(): boolean {
    const layer = activeLayer(this.doc);
    const master = layer.instance && findMaster(this.doc, layer.instance.of);
    if (!master) return false;
    this.setActiveLayer(this.doc.layers.indexOf(master));
    return true;
  }

  /** Turns the active instance into a plain layer with the same pixels (Ctrl/Cmd+Alt+B). */
  detachInstance(): boolean {
    if (!isLinkedInstance(this.doc, activeLayer(this.doc))) return false;
    this.edit((d) => detachInstance(activeLayer(d)));
    return true;
  }

  /**
   * A new instance of a master (dropped from the Components list), its sprite centered on `p`,
   * above the master. It becomes the active layer.
   */
  addInstanceAt(masterId: string, p: Point): boolean {
    const master = findMaster(this.doc, masterId);
    if (!master?.component) return false;
    const { w, h } = master.component;
    let index = -1;
    this.edit((d) => {
      index = addInstance(d, masterId, p.x - Math.floor(w / 2), p.y - Math.floor(h / 2));
      if (index >= 0) d.activeLayer = index;
    });
    if (index < 0) return false;
    const s = this.active;
    delete s.pickedGroup;
    s.referencePicked = false;
    s.unframed = false;
    s.picked = [this.doc.layers[index].id];
    this.commit(false);
    return true;
  }

  private targetRect(): Rect {
    return this.active.selection ?? { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
  }

  clearSelection(): void {
    if (!this.active.selection || this.activeLocked()) return;
    this.edit((doc) =>
      fillSelection(activeLayer(doc).pixels, doc.width, doc.height, this.active.selection, 0),
    );
  }

  /** Fills the selection, or the whole layer, with the primary color. */
  fill(): void {
    if (this.activeLocked()) return;
    if (!activeLayer(this.doc).visible) {
      this.notice({ type: 'layerHidden' });
      return;
    }
    this.remember(this.primary);
    this.edit((doc) =>
      fillSelection(activeLayer(doc).pixels, doc.width, doc.height, this.active.selection, this.primary),
    );
  }

  flip(horizontal: boolean): void {
    if (this.activeLocked()) return;
    const sel = this.active.selection;
    if (sel?.mask)
      return this.transformShape(
        (p, w, h, r) => (flipRect(p, w, h, r, horizontal), r),
        (s) => flipMask(s, horizontal),
      );
    const wholeLayer = !sel;
    this.edit((doc) => {
      const layer = activeLayer(doc);
      flipRect(layer.pixels, doc.width, doc.height, this.targetRect(), horizontal);
      // The part outside the canvas flips across it too.
      if (wholeLayer && layer.outside)
        layer.outside = flipOutside(layer.outside, doc.width, doc.height, horizontal);
    });
  }

  /** Rotates the selection (or the layer) by 90°; the selection follows the new shape. */
  rotate(clockwise = true): void {
    if (this.activeLocked()) return;
    if (this.active.selection?.mask)
      return this.transformShape(
        (p, w, h, r) => rotateRect(p, w, h, r, clockwise),
        (s, to) => rotateMask(s, to, clockwise),
      );
    const hadSelection = this.active.selection !== null;
    this.edit((doc) => {
      const layer = activeLayer(doc);
      const rotated = rotateRect(layer.pixels, doc.width, doc.height, this.targetRect(), clockwise);
      if (hadSelection) this.active.selection = rotated;
      // Rotating the layer turns it within the canvas: what was outside doesn't follow.
      else delete layer.outside;
    });
  }

  /**
   * Lays the selection (or what's drawn on the layer) onto a face of an isometric box, kept crisp
   * (see `isoFaceMapping`), from its top left corner. The selection becomes the face's shape, so
   * it can be moved into place.
   */
  putOnIsoFace(face: IsoFace): void {
    if (this.activeLocked()) return;
    const { width: W, height: H } = this.doc;
    const layer = activeLayer(this.doc);
    const sel = this.active.selection ? clipSelection(this.active.selection, W, H) : null;
    // Without a selection, all of the layer's drawing, what's outside the canvas included.
    const whole = sel ? null : layerContent(layer.pixels, W, H, layer.outside);
    const rect = sel ?? whole?.rect;
    if (!rect) {
      this.notice({ type: 'emptyDrawing' });
      return;
    }
    this.edit((doc) => {
      const target = activeLayer(doc);
      const pixels = target.pixels;
      const source = sel ? maskBlock(extractBlock(pixels, W, H, sel), sel).pixels : whole!.pixels;
      const { width, height, source: from } = isoFaceMapping(face, rect.w, rect.h);
      if (sel) fillSelection(pixels, W, H, sel, 0);
      else {
        pixels.fill(0);
        delete target.outside;
      }
      // What lands past the canvas's edges is kept outside it, as after a move.
      const outside: number[] = [];
      const mask = new Uint8Array(width * height);
      from.forEach((index, i) => {
        if (index < 0 || (sel?.mask && !sel.mask[index])) return;
        mask[i] = 1;
        const x = rect.x + (i % width);
        const y = rect.y + Math.floor(i / width);
        const c = source[index];
        if (!(c >>> 24)) return;
        if (x >= 0 && y >= 0 && x < W && y < H) pixels[y * W + x] = c;
        else outside.push(x, y, c);
      });
      const kept = addOutside(target.outside, outside, W, H);
      if (kept) target.outside = kept;
      if (sel)
        this.active.selection = clipSelection({ x: rect.x, y: rect.y, w: width, h: height, mask }, W, H);
    });
  }

  /**
   * Flips or turns a selection of any shape (lasso, magic wand): its pixels are lifted on their
   * own, transformed in their rectangle, and put back over what's left, the mask following.
   */
  private transformShape(
    transform: (pixels: Uint32Array, width: number, height: number, rect: Rect) => Rect,
    moveMask: (sel: Selection, to: Rect) => Selection,
  ): void {
    const sel = clipSelection(this.active.selection!, this.doc.width, this.doc.height);
    if (!sel) return;
    this.edit((doc) => {
      const { width: W, height: H } = doc;
      const pixels = activeLayer(doc).pixels;
      const lifted = new Uint32Array(W * H);
      stampBlock(lifted, W, H, maskBlock(extractBlock(pixels, W, H, sel), sel), sel.x, sel.y, true);
      const to = transform(lifted, W, H, sel);
      fillSelection(pixels, W, H, sel, 0);
      for (let i = 0; i < lifted.length; i++) if (lifted[i] >>> 24) pixels[i] = lifted[i];
      this.active.selection = moveMask(sel, to);
    });
  }

  /* ------------------------------------------------------------------ color adjustment */

  get isAdjusting(): boolean {
    return this.adjusting !== null;
  }

  /**
   * Starts adjusting colors of the active layer (or all layers), limited to the selection if any.
   * Previews are live and not in the history; `applyAdjust` makes one undo step.
   */
  beginAdjust(allLayers: boolean): void {
    this.cancelStroke();
    this.cancelAdjust();
    const doc = this.doc;
    const layers = (allLayers ? doc.layers : [activeLayer(doc)]).filter((l) => !l.locked);
    if (!layers.length) {
      this.notice({ type: 'layerLocked' });
      this.commit(false); // Lets the adjustment panel notice that nothing is being adjusted.
      return;
    }
    this.adjusting = {
      layers: layers.map((l) => ({ id: l.id, base: l.pixels.slice() })),
      rect: clipRect(this.targetRect(), doc.width, doc.height),
    };
  }

  /** Rewrites the adjusted layers from their original pixels, through `change` (none: as they were). */
  private writeAdjustment(change: PixelChange | null): void {
    const { layers, rect } = this.adjusting!;
    const width = this.doc.width;
    const sel = this.active.selection;
    for (const { id, base } of layers) {
      const layer = this.doc.layers.find((l) => l.id === id);
      if (!layer) continue;
      const out = change ? change(base, width, rect) : base;
      // A selection of any shape: what's in its rectangle but not selected stays as it was.
      if (change && sel?.mask)
        for (let y = rect.y; y < rect.y + rect.h; y++)
          for (let x = rect.x; x < rect.x + rect.w; x++)
            if (!inSelection(sel, x, y)) out[y * width + x] = base[y * width + x];
      layer.pixels.set(out);
    }
  }

  /**
   * The colors being adjusted (opaque, from the original pixels of the layers and area being
   * adjusted) and how many pixels have each: what a remap starts from.
   */
  adjustedColors(): Map<Color, number> {
    const used = new Map<Color, number>();
    if (!this.adjusting) return used;
    const { layers, rect } = this.adjusting;
    const width = this.doc.width;
    for (const { base } of layers)
      for (let y = rect.y; y < rect.y + rect.h; y++)
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const c = base[y * width + x];
          if (alpha(c)) used.set(opaque(c), (used.get(opaque(c)) ?? 0) + 1);
        }
    return used;
  }

  /** Hue, saturation and brightness; with `palette`, the palette previews the change too. */
  previewAdjust(adj: ColorAdjustment, palette = false): void {
    this.previewMap(
      (c) => adjustColor(c, adj),
      palette ? (colors) => colors.map((c) => adjustColor(c, adj)) : null,
    );
  }

  /** Hue, saturation and brightness as one undo step; with `palette`, the palette is adapted too. */
  applyAdjust(adj: ColorAdjustment, palette: boolean): void {
    this.applyMap(
      (c) => adjustColor(c, adj),
      palette ? (colors) => colors.map((c) => adjustColor(c, adj)) : null,
    );
  }

  /**
   * Live preview of any color change on the adjusted pixels. `palette` gives the palette to show
   * meanwhile (from the palette before the adjustment), or null to leave it as it is.
   */
  previewMap(map: ColorMap, palette: ((colors: Color[]) => Color[]) | null): void {
    this.previewChange(mapChange(map), palette);
  }

  /** Live preview of any change of the adjusted pixels (an outline…), like `previewMap`. */
  previewChange(change: PixelChange, palette: ((colors: Color[]) => Color[]) | null = null): void {
    if (!this.adjusting) return;
    this.writeAdjustment(change);
    const a = this.adjusting;
    if (palette) {
      a.basePalette ??= this.palette;
      this.palette = { ...a.basePalette, colors: palette(a.basePalette.colors) };
      this.commit(false);
    } else if (a.basePalette) {
      this.palette = a.basePalette;
      delete a.basePalette;
      this.commit(false);
    }
    this.pixelsChanged();
  }

  /**
   * Commits a color change as one undo step. With `palette`, the palette becomes what it returns,
   * in the same step: undoing it gives back the pixels and the palette together.
   */
  applyMap(map: ColorMap, palette: ((colors: Color[]) => Color[]) | null): void {
    this.applyChange(mapChange(map), palette);
  }

  /** Commits any change of the adjusted pixels as one undo step, like `applyMap`. */
  applyChange(change: PixelChange, palette: ((colors: Color[]) => Color[]) | null = null): void {
    if (!this.adjusting) return;
    const base = this.adjusting.basePalette ?? this.palette;
    this.palette = base;
    this.writeAdjustment(null);
    this.checkpoint();
    // The colors of the drawing follow the pixels on their own: nothing to swap or set.
    const ownColors = palette && base.key !== 'drawing';
    if (ownColors) this.active.history.top()!.palette = this.savedPalette();
    this.writeAdjustment(change);
    this.adjusting = null;
    if (ownColors) this.usePalette(palette(base.colors));
    this.commit();
  }

  cancelAdjust(): void {
    if (!this.adjusting) return;
    this.writeAdjustment(null);
    const palette = this.adjusting.basePalette;
    this.adjusting = null;
    // Only a previewed palette needs the panels to update; pixels just need a redraw.
    if (palette) {
      this.palette = palette;
      this.commit(false);
    } else this.pixelsChanged();
  }

  /* ------------------------------------------------------------------ resize by the handles */

  /**
   * Starts resizing the selection's content, or the whole active layer (inside and outside the
   * canvas). Returns the rectangle being resized, or null when there's nothing to resize.
   */
  beginScale(): Rect | null {
    this.cancelStroke();
    this.cancelScale();
    const doc = this.doc;
    const layer = activeLayer(doc);
    if (!isShown(doc, layer) || this.activeLocked()) return null;
    // Several layers: resized together, in the box they fill.
    if (!this.active.selection && this.state.selectedLayers.length > 1) return this.beginGroupScale();
    const base = layer.pixels.slice();
    const sel = this.active.selection ? clipSelection(this.active.selection, doc.width, doc.height) : null;
    if (sel && sel.w && sel.h) {
      // Only the selected pixels are lifted, whatever the selection's shape.
      const block = maskBlock(extractBlock(base, doc.width, doc.height, sel), sel);
      const cleared = base.slice();
      fillSelection(cleared, doc.width, doc.height, sel, 0);
      this.checkpoint();
      const from = { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
      this.scaling = { layer, base, baseOutside: layer.outside, from, fromSelection: sel, block, cleared };
      return { ...from };
    }
    const content = layerContent(base, doc.width, doc.height, layer.outside);
    if (!content) return null;
    this.checkpoint();
    this.scaling = {
      layer,
      base,
      baseOutside: layer.outside,
      from: content.rect,
      block: { width: content.rect.w, height: content.rect.h, pixels: content.pixels },
    };
    return { ...content.rect };
  }

  /** Several layers selected: each one's content, in the box they fill together. */
  private beginGroupScale(): Rect | null {
    const doc = this.doc;
    const layers = this.pickedLayers().filter((l) => isShown(doc, l));
    if (layers.some((l) => isLocked(doc, l))) {
      this.notice({ type: 'layerLocked' });
      return null;
    }
    const group = layers.flatMap((layer) => {
      const content = layerContent(layer.pixels, doc.width, doc.height, layer.outside);
      if (!content) return [];
      const { rect, pixels } = content;
      return [
        {
          layer,
          base: layer.pixels.slice(),
          baseOutside: layer.outside,
          rect,
          block: { width: rect.w, height: rect.h, pixels },
        },
      ];
    });
    if (!group.length) return null;
    const x0 = Math.min(...group.map((m) => m.rect.x));
    const y0 = Math.min(...group.map((m) => m.rect.y));
    const x1 = Math.max(...group.map((m) => m.rect.x + m.rect.w));
    const y1 = Math.max(...group.map((m) => m.rect.y + m.rect.h));
    const from = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const first = group[0];
    this.checkpoint();
    this.scaling = {
      layer: first.layer,
      base: first.base,
      baseOutside: first.baseOutside,
      from,
      block: first.block,
      group,
    };
    return { ...from };
  }

  /** Puts a layer's content back, transformed, at (x, y), what lands outside the canvas kept. */
  private placeLayer(layer: Layer, block: PixelBlock, x: number, y: number): void {
    const { width, height } = this.doc;
    const r = reframe(block.pixels, block.width, block.height, undefined, x, y, width, height);
    layer.pixels.set(r.pixels);
    layer.outside = r.outside;
  }

  /** Shows the content resized into `rect` (canvas pixels), from the original pixels. */
  previewScale(rect: Rect): void {
    const sc = this.scaling;
    if (!sc) return;
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    if (sc.group) {
      // Each layer keeps its place and size in the box, in proportion.
      const kx = w / sc.from.w;
      const ky = h / sc.from.h;
      for (const m of sc.group) {
        const left = Math.round(x + (m.rect.x - sc.from.x) * kx);
        const top = Math.round(y + (m.rect.y - sc.from.y) * ky);
        const right = Math.round(x + (m.rect.x + m.rect.w - sc.from.x) * kx);
        const bottom = Math.round(y + (m.rect.y + m.rect.h - sc.from.y) * ky);
        const block = scaleBlock(m.block, Math.max(1, right - left), Math.max(1, bottom - top));
        this.placeLayer(m.layer, block, left, top);
      }
      this.pixelsChanged();
      return;
    }
    this.placeTransformed(scaleBlock(sc.block, w, h), x, y, true);
  }

  /** Puts the lifted content back, transformed, at (x, y): on the emptied layer, or as the whole layer. */
  private placeTransformed(block: PixelBlock, x: number, y: number, scaled = false): void {
    const sc = this.scaling!;
    const { width, height } = this.doc;
    if (sc.cleared) {
      sc.layer.pixels.set(sc.cleared);
      stampBlock(sc.layer.pixels, width, height, block, x, y);
      const rect = { x, y, w: block.width, h: block.height };
      // Resized, a shaped selection keeps its shape; turned freely, it becomes the turned box.
      this.active.selection = scaled && sc.fromSelection?.mask ? scaleMask(sc.fromSelection, rect) : rect;
    } else {
      // A whole layer: what lands outside the canvas is kept, like a move.
      const r = reframe(block.pixels, block.width, block.height, undefined, x, y, width, height);
      sc.layer.pixels.set(r.pixels);
      sc.layer.outside = r.outside;
    }
    this.pixelsChanged();
  }

  /**
   * Starts rotating the selection's content, or the whole active layer, by dragging (see
   * `previewRotate`). Returns the rectangle being rotated, or null when there's nothing to rotate.
   */
  beginRotate(): Rect | null {
    const from = this.beginScale();
    const sc = this.scaling;
    if (from && sc?.group) for (const m of sc.group) m.rotator = rotator(m.block);
    else if (from) sc!.rotator = rotator(sc!.block);
    return from;
  }

  /** Shows the content turned by `degrees` (clockwise) around its center. Commit with `endScale`. */
  previewRotate(degrees: number): void {
    const sc = this.scaling;
    if (sc?.group) {
      // Each layer turns on itself, and its center turns around the box's.
      const a = (degrees * Math.PI) / 180;
      const gx = sc.from.x + sc.from.w / 2;
      const gy = sc.from.y + sc.from.h / 2;
      for (const m of sc.group) {
        if (!m.rotator) continue;
        const turned = m.rotator.rotate(degrees);
        const dx = m.rect.x + m.rect.w / 2 - gx;
        const dy = m.rect.y + m.rect.h / 2 - gy;
        const cx = gx + dx * Math.cos(a) - dy * Math.sin(a);
        const cy = gy + dx * Math.sin(a) + dy * Math.cos(a);
        this.placeLayer(
          m.layer,
          turned,
          Math.round(cx - turned.width / 2),
          Math.round(cy - turned.height / 2),
        );
      }
      this.pixelsChanged();
      return;
    }
    if (!sc?.rotator) return;
    const turned = sc.rotator.rotate(degrees);
    const cx = sc.from.x + sc.from.w / 2;
    const cy = sc.from.y + sc.from.h / 2;
    this.placeTransformed(turned, Math.round(cx - turned.width / 2), Math.round(cy - turned.height / 2));
  }

  /** Commits the resize as one undo step (recorded when it began). */
  endScale(): void {
    if (!this.scaling) return;
    this.scaling = null;
    this.fitFree();
    this.commit();
  }

  /** Puts the content back as it was, without an undo step. */
  cancelScale(): void {
    const sc = this.scaling;
    if (!sc) return;
    sc.layer.pixels.set(sc.base);
    sc.layer.outside = sc.baseOutside;
    for (const m of sc.group ?? []) {
      m.layer.pixels.set(m.base);
      m.layer.outside = m.baseOutside;
    }
    if (sc.cleared) this.active.selection = sc.fromSelection ?? sc.from;
    this.active.history.discardLast();
    this.scaling = null;
    this.commit(false);
  }

  get isScaling(): boolean {
    return this.scaling !== null;
  }

  /** Moves the selection (or the layer) by a few pixels, as one undo step. */
  /**
   * Moves what's drawn in the selection (or the whole layer) against an edge of the canvas, or to
   * its middle, as one undo step. Only the drawn pixels count, not the empty part of the selection.
   */
  align(to: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'): void {
    // Several boards selected as boards: they're the ones lined up.
    if (this.state.selectedBoards.length > 1) return this.alignBoards(to);
    const doc = this.doc;
    const area = clipRect(this.targetRect(), doc.width, doc.height);
    // Several layers selected (a group), no selection: what they draw together.
    const layers =
      !this.active.selection && this.state.selectedLayers.length > 1
        ? this.pickedLayers()
        : [activeLayer(doc)];
    let b: Rect | null = null;
    for (const layer of layers) {
      const block = extractBlock(layer.pixels, doc.width, doc.height, area);
      const inner = pixelBounds(block.pixels, block.width, block.height);
      if (!inner) continue;
      const r = { x: area.x + inner.x, y: area.y + inner.y, w: inner.w, h: inner.h };
      if (!b) b = r;
      else {
        const x = Math.min(b.x, r.x);
        const y = Math.min(b.y, r.y);
        b = { x, y, w: Math.max(b.x + b.w, r.x + r.w) - x, h: Math.max(b.y + b.h, r.y + r.h) - y };
      }
    }
    if (!b) return;
    const dx =
      to === 'left'
        ? -b.x
        : to === 'right'
          ? doc.width - b.w - b.x
          : to === 'centerX'
            ? Math.floor((doc.width - b.w) / 2) - b.x
            : 0;
    const dy =
      to === 'top'
        ? -b.y
        : to === 'bottom'
          ? doc.height - b.h - b.y
          : to === 'centerY'
            ? Math.floor((doc.height - b.h) / 2) - b.y
            : 0;
    if (dx || dy) this.nudge(dx, dy);
  }

  nudge(dx: number, dy: number): void {
    const r = this.doc.reference;
    if (this.state.referenceSelected && r) {
      if (!r.locked) this.updateReference({ x: r.x + dx, y: r.y + dy });
      return;
    }
    if (this.stroke || this.groupMove) return;
    // Several layers selected (a group), no selection: they all move.
    if (!this.active.selection && this.state.selectedLayers.length > 1) {
      if (!this.beginGroupMove({ x: 0, y: 0 })) return;
      this.applyGroupMove(dx, dy);
      this.groupMove = null;
      this.fitFree();
      this.commit();
      return;
    }
    if (!isShown(this.doc, activeLayer(this.doc)) || this.activeLocked(true)) return;
    this.active.unframed = false;
    this.checkpoint();
    const s = this.createStroke({ x: 0, y: 0 }, false);
    beginMove(s);
    applyMove(s, dx, dy);
    this.fitFree();
    this.commit();
  }

  copy(): boolean {
    const { width, height } = this.doc;
    const sel = this.active.selection ? clipSelection(this.active.selection, width, height) : null;
    if (this.active.selection && !sel) return false;
    const r = sel ?? { x: 0, y: 0, w: width, h: height };
    if (!r.w || !r.h) return false;
    // A selection of any shape copies its own pixels only.
    const block = extractBlock(activeLayer(this.doc).pixels, width, height, r);
    this.clipboard = sel ? maskBlock(block, sel) : block;
    this.layerClip = null;
    return true;
  }

  /** Copies the selected layers whole (or the selected group), for `pasteLayers` here or in another file. */
  copyLayers(): LayerFragment | null {
    const fragment = fragmentOf(this.doc, this.state.selectedLayers);
    if (!fragment) return null;
    fragment.id = this.layerClipId = newId('clip');
    this.layerClip = fragment;
    this.clipboard = null;
    return fragment;
  }

  /** Copies the selected layers, then deletes them (at least one layer stays). */
  cutLayers(): LayerFragment | null {
    const fragment = this.copyLayers();
    if (fragment) this.deleteLayers();
    return fragment;
  }

  /** Pastes whole layers above the active one (see `pasteFragment`); they become the selection. */
  pasteLayers(fragment: LayerFragment | null = this.layerClip): boolean {
    if (!fragment?.layers.length) return false;
    this.edit((doc) => {
      const { ids, group } = pasteFragment(doc, fragment);
      const s = this.active;
      s.referencePicked = false;
      s.unframed = false;
      if (group) s.pickedGroup = group;
      else delete s.pickedGroup;
      s.picked = ids;
      s.anchor = ids[ids.length - 1];
      doc.activeLayer = doc.layers.findIndex((l) => l.id === s.anchor);
    });
    this.notice({ type: 'layersPasted', count: fragment.layers.length });
    return true;
  }

  cut(): boolean {
    if (this.activeLocked() || !this.copy()) return false;
    if (!this.active.selection) this.selectAll();
    this.clearSelection();
    return true;
  }

  /**
   * Layers found on the system clipboard are an older copy from here, pixels having been copied
   * since (that copy stays inside the app): paste those instead.
   */
  isOlderCopy(fragment: LayerFragment): boolean {
    return !!fragment.id && fragment.id === this.layerClipId && this.clipboard !== null;
  }

  hasClipboard(): boolean {
    return this.clipboard !== null || this.layerClip !== null;
  }

  /** Pastes the clipboard (or a given block) on a new layer, selected, with the move tool active. */
  paste(block: PixelBlock | null = this.clipboard, name = this.labels.pasted): void {
    if (!block && this.layerClip) {
      this.pasteLayers();
      return;
    }
    if (!block) return;
    this.edit((doc) => {
      const sel = this.active.selection;
      const x = sel ? clamp(sel.x, 0, doc.width - 1) : Math.max(0, Math.floor((doc.width - block.width) / 2));
      const y = sel
        ? clamp(sel.y, 0, doc.height - 1)
        : Math.max(0, Math.floor((doc.height - block.height) / 2));
      const layer = createLayer(name, doc.width, doc.height);
      for (let by = 0; by < block.height; by++) {
        for (let bx = 0; bx < block.width; bx++) {
          const tx = x + bx;
          const ty = y + by;
          if (tx < doc.width && ty < doc.height)
            layer.pixels[ty * doc.width + tx] = block.pixels[by * block.width + bx];
        }
      }
      doc.layers.splice(doc.activeLayer + 1, 0, layer);
      doc.activeLayer += 1;
      this.active.selection = {
        x,
        y,
        w: Math.min(block.width, doc.width - x),
        h: Math.min(block.height, doc.height - y),
      };
      this.tool = 'move';
    });
    this.notice({ type: 'pasted' });
  }

  /* ------------------------------------------------------------------ strokes */

  get isStroking(): boolean {
    return this.stroke !== null || this.groupMove !== null || this.marquee !== null;
  }

  /** The rectangle being dragged to select layers, in pixels of the active board, if any. */
  marqueeRect(): Rect | null {
    const m = this.marquee;
    if (!m) return null;
    const x = Math.min(m.start.x, m.end.x);
    const y = Math.min(m.start.y, m.end.y);
    return { x, y, w: Math.abs(m.end.x - m.start.x) + 1, h: Math.abs(m.end.y - m.start.y) + 1 };
  }

  /**
   * Selects the layers the marquee touches, with the ones kept: a layer in a group takes its whole
   * group, as a click would.
   */
  private applyMarquee(): void {
    const m = this.marquee!;
    const r = this.marqueeRect()!;
    const { width, height, layers } = this.doc;
    const taken = new Set(m.kept);
    layers.forEach((l, k) => {
      if (!isShown(this.doc, l) || isLocked(this.doc, l)) return;
      const b = pixelBounds(l.pixels, width, height);
      if (!b || b.x >= r.x + r.w || b.y >= r.y + r.h || b.x + b.w <= r.x || b.y + b.h <= r.y) return;
      const { group } = this.moveTarget(k);
      for (const id of group ? groupLayers(this.doc, group).map((g) => g.id) : [l.id]) taken.add(id);
    });
    const s = this.active;
    const picked = layers.filter((l) => taken.has(l.id)).map((l) => l.id);
    if (picked.join() === this.state.selectedLayers.join() && s.unframed === !picked.length) return;
    delete s.pickedGroup;
    s.referencePicked = false;
    if (picked.length) {
      s.picked = picked;
      s.unframed = false;
      this.doc.activeLayer = layers.findIndex((l) => l.id === picked[picked.length - 1]);
      s.anchor = picked[picked.length - 1];
    } else {
      s.picked = [activeLayer(this.doc).id];
      s.unframed = true;
    }
    this.commit(false);
  }

  /**
   * The layers the Move tool is moving whole right now, if any: what they push off the board is
   * shown with them, so they follow the pointer outside it.
   */
  movingLayers(): Layer[] {
    if (this.groupMove) return this.groupMove.items.map((i) => i.layer);
    const s = this.stroke;
    return s && this.strokeTool === 'move' && !s.selection && !s.layer.instance ? [s.layer] : [];
  }

  private createStroke(p: Point, secondary: boolean): Stroke {
    const doc = this.doc;
    const layer = activeLayer(doc);
    return {
      doc,
      layer,
      base: layer.pixels.slice(),
      baseOutside: layer.outside,
      start: p,
      last: p,
      secondary,
      options: this.options,
      primaryColor: this.primary,
      secondaryColor: this.secondary,
      palette: this.paletteIndex,
      mirrorX: this.view.mirrorX,
      mirrorY: this.view.mirrorY,
      wrap: this.view.tile && (tilesIsometric(doc) ? 'iso' : 'rect'),
      customBrush: this.strokeBrush(),
      selection: this.active.selection,
      visited: new Uint8Array(doc.width * doc.height),
      trail: [],
      scratch: {},
      sample: (q) => {
        const flat = flatten(doc);
        const c = flat[q.y * doc.width + q.x];
        return alpha(c) ? c : 0;
      },
      setColor: (slot, color) => {
        this[slot] = color;
        this.commit(false);
      },
      setSelection: (rect) => {
        this.active.selection = rect;
      },
    };
  }

  /**
   * Starts a gesture at pixel `p`. `toolOverride` lets the UI force a tool (Alt → picker).
   * Returns false when nothing happens (e.g. drawing on a hidden layer).
   */
  beginStroke(p: Point, secondary: boolean, mods: Modifiers, toolOverride?: ToolId): boolean {
    this.cancelStroke();
    // Working on the pixels lets go of the boards selected as boards.
    this.boardSelection = [];
    if (this.adjusting || isEmptyBoard(this.doc)) return false;
    // Outside the boards, layers are only moved: the tools draw on a board.
    if (isFreeZone(this.doc) && (toolOverride ?? this.tool) !== 'move') return false;
    const id = toolOverride ?? this.tool;
    const tool = TOOLS[id];
    // Drawing, or moving pixels, goes back to the active layer.
    if (tool.editsPixels && this.active.referencePicked) {
      this.active.referencePicked = false;
      this.commit(false);
    }
    if (id === 'move' && !this.active.selection) {
      // Beside every layer (and outside the active one's frame), a click lets go of the layers
      // selected, like a click on the empty canvas in a design tool: the active one stays, unframed.
      if (!mods.keepLayer && !this.pickLayerAt(p, mods.add)) {
        if (!mods.add) this.deselectLayers();
        this.marquee = { start: p, end: p, kept: mods.add ? [...this.state.selectedLayers] : [] };
        return true;
      }
      this.active.unframed = false;
    }
    // A group (or several layers) selected: the Move tool moves them all.
    if (id === 'move' && !this.active.selection && this.state.selectedLayers.length > 1)
      return this.beginGroupMove(p, mods.duplicate);
    if (tool.editsPixels && this.activeLocked(id === 'move')) return false;
    if (tool.editsPixels && !isShown(this.doc, activeLayer(this.doc))) {
      this.notice({ type: 'layerHidden' });
      return false;
    }
    if (tool.editsPixels) this.checkpoint();
    // Alt+drag a component or an instance with the Move tool, like in Figma: a new instance, which
    // is the one that moves, just above the layer dragged and in its group.
    const picked = activeLayer(this.doc);
    const source =
      picked.component && !isLinkedInstance(this.doc, picked)
        ? { of: picked.id, x: picked.component.x, y: picked.component.y }
        : isLinkedInstance(this.doc, picked)
          ? picked.instance!
          : null;
    if (id === 'move' && mods.duplicate && !this.active.selection && source) {
      const at = addInstance(this.doc, source.of, source.x, source.y, this.doc.activeLayer + 1);
      const copy = this.doc.layers[at];
      copy.name = picked.name;
      if (picked.group) copy.group = picked.group;
      else delete copy.group;
      this.doc.activeLayer = at;
      this.active.picked = [copy.id];
      this.refresh();
    } else if (id === 'move' && mods.duplicate && !this.active.selection) {
      // Alt+drag any other layer (or a group): its copy is what moves.
      this.duplicatePicked();
      this.refresh();
    }
    this.stroke = this.createStroke(p, secondary);
    this.strokeTool = id;
    // Shift-click: a straight line from where the last pencil or eraser stroke on this layer ended.
    const last = this.lastPainted;
    if (
      mods.shift &&
      STRAIGHT_LINES.includes(id) &&
      last?.doc === this.doc &&
      last.layer === this.stroke.layer
    )
      this.stroke.lineFrom = last.at;
    tool.onDown(this.stroke, p, mods);
    this.pixelsChanged();
    return true;
  }

  /**
   * Makes the layer under `p` the active one (see `layerAt`), without an undo step of its own.
   * Returns false when there's nothing to take there: no layer pixel, and not inside the frame of
   * the active layer (a hole in a drawing still moves it).
   */
  private pickLayerAt(p: Point, add = false): boolean {
    const k = this.layerAt(p);
    if (k < 0) {
      const { width, height } = this.doc;
      const box = this.active.unframed ? null : pixelBounds(activeLayer(this.doc).pixels, width, height);
      return !!box && p.x >= box.x && p.y >= box.y && p.x < box.x + box.w && p.y < box.y + box.h;
    }
    const s = this.active;
    const layer = this.doc.layers[k];
    // In a group, the Move tool takes the whole group, like in a design tool.
    const { group } = this.moveTarget(k);
    const taken = group ? groupLayers(this.doc, group).map((l) => l.id) : [layer.id];
    const picked = this.state.selectedLayers;
    const inPicked = taken.every((id) => picked.includes(id));
    if (add && !inPicked) return this.togglePicked(taken, false, layer);
    if (add) this.unpick = { ids: taken, start: p, moved: false };
    // Part of a bigger selection (Shift+click, or the Layers panel): a drag moves it all.
    if (inPicked && picked.length > taken.length && !s.pickedGroup) return true;
    if (group) {
      if (s.pickedGroup !== group) this.selectGroup(group);
      return true;
    }
    if (k === this.doc.activeLayer && !s.pickedGroup) return true;
    delete s.pickedGroup;
    this.doc.activeLayer = k;
    s.picked = [layer.id];
    s.anchor = layer.id;
    this.commit(false);
    return true;
  }

  /**
   * Shift+click with the Move tool, like in Figma: what's under the cursor (a layer, or its group)
   * joins the selected layers, or leaves them (`remove`). Returns whether there's something to drag.
   */
  private togglePicked(taken: string[], remove: boolean, layer: Layer): boolean {
    const s = this.active;
    const picked = this.state.selectedLayers;
    const ids = remove ? picked.filter((id) => !taken.includes(id)) : [...picked, ...taken];
    if (!ids.length) return false;
    const keep = new Set(ids);
    delete s.pickedGroup;
    s.referencePicked = false;
    s.unframed = false;
    s.picked = this.doc.layers.filter((l) => keep.has(l.id)).map((l) => l.id);
    const active = remove ? s.picked[s.picked.length - 1] : layer.id;
    this.doc.activeLayer = this.doc.layers.findIndex((l) => l.id === active);
    s.anchor = active;
    this.commit(false);
    return !remove;
  }

  /** Moving every selected layer together (a group), whole layers with what's off the canvas. */
  private beginGroupMove(p: Point, duplicate = false): boolean {
    if (this.pickedLayers().some((l) => isLocked(this.doc, l))) {
      this.notice({ type: 'layerLocked' });
      return false;
    }
    this.checkpoint();
    // Alt+drag: the copies are what moves, the originals stay.
    if (duplicate) {
      this.duplicatePicked();
      this.refresh();
    }
    const layers = this.pickedLayers();
    this.groupMove = {
      start: p,
      items: layers.map((layer) => ({
        layer,
        base: layer.pixels.slice(),
        outside: layer.outside,
        ...(layer.instance && { at: { x: layer.instance.x, y: layer.instance.y } }),
        ...(layer.component && { frame: { ...layer.component } }),
      })),
    };
    return true;
  }

  private applyGroupMove(dx: number, dy: number): void {
    const { width, height } = this.doc;
    for (const { layer, base, outside, at, frame } of this.groupMove!.items) {
      if (at && layer.instance) {
        layer.instance = { ...layer.instance, x: at.x + dx, y: at.y + dy };
        continue;
      }
      const r = reframe(base, width, height, outside, dx, dy, width, height);
      layer.pixels.set(r.pixels);
      layer.outside = r.outside;
      if (frame) layer.component = { ...frame, x: frame.x + dx, y: frame.y + dy };
    }
    syncInstances(this.doc);
    this.pixelsChanged();
  }

  moveStroke(p: Point, mods: Modifiers): void {
    if (this.unpick && (p.x !== this.unpick.start.x || p.y !== this.unpick.start.y)) this.unpick.moved = true;
    if (this.marquee) {
      this.marquee.end = p;
      return this.applyMarquee();
    }
    if (this.groupMove)
      return this.applyGroupMove(p.x - this.groupMove.start.x, p.y - this.groupMove.start.y);
    if (!this.stroke || !this.strokeTool) return;
    TOOLS[this.strokeTool].onMove(this.stroke, this.stabilized(p), mods);
    // Drawing on a master: its instances follow as it goes.
    if (this.stroke.layer.component) syncInstances(this.doc, this.stroke.layer.id);
    this.pixelsChanged();
  }

  /**
   * The stabilizer: freehand tools follow a point pulled by the pointer on a string of
   * `stabilizer` pixels. It only moves when the string is tight, so small wobbles of the hand
   * never reach the drawing.
   */
  private stabilized(p: Point): Point {
    const s = this.stroke!;
    const length = s.options.stabilizer;
    if (!length || !STABILIZED_TOOLS.includes(this.strokeTool!)) return p;
    const at = (s.scratch.string as Point | undefined) ?? { ...s.start };
    const dx = p.x - at.x;
    const dy = p.y - at.y;
    const d = Math.hypot(dx, dy);
    if (d > length) {
      at.x += (dx * (d - length)) / d;
      at.y += (dy * (d - length)) / d;
    }
    s.scratch.string = at;
    return { x: Math.round(at.x), y: Math.round(at.y) };
  }

  endStroke(): void {
    const unpick = this.unpick;
    this.unpick = null;
    if (unpick && !unpick.moved) this.togglePicked(unpick.ids, true, activeLayer(this.doc));
    if (this.marquee) {
      this.marquee = null;
      this.commit(false);
      return;
    }
    if (this.groupMove) {
      this.groupMove = null;
      this.fitFree();
      this.commit();
      return;
    }
    const s = this.stroke;
    const id = this.strokeTool;
    if (!s || !id) return;
    const tool = TOOLS[id];
    tool.onUp?.(s);
    this.stroke = null;
    this.strokeTool = null;
    if (tool.editsPixels && !changed(s.base, s.layer.pixels) && id !== 'move') {
      this.active.history.discardLast();
      this.commit(false);
      return;
    }
    // Drawn on a component, outside its frame: the frame takes it in, so instances show it too.
    if (s.layer.component && id !== 'move') growFrame(this.doc, s.layer, s.base);
    if (STRAIGHT_LINES.includes(id)) this.lastPainted = { doc: s.doc, layer: s.layer, at: s.last };
    if (VOLUMES.includes(id)) {
      // The options bar shows the size the drag gave a box, and changing an option redraws it.
      if (id === 'box')
        this.options = { ...this.options, boxWidth: s.options.boxWidth, boxDepth: s.options.boxDepth };
      const repaint = s.scratch.repaint as () => void;
      this.lastVolume = { stroke: s, repaint, result: s.layer.pixels.slice() };
    }
    if (id === 'gradient')
      this.lastGradient = {
        layer: s.layer,
        base: s.base,
        mask: s.scratch.mask as Uint8Array,
        a: s.start,
        b: s.scratch.end as Point,
        result: s.layer.pixels.slice(),
      };
    if (tool.paintsColor) {
      const [c1, c2] = strokeColors(s);
      if (s.options.dither) this.remember(c1, c2);
      else this.remember(c1);
    }
    if (id === 'move') this.fitFree();
    this.commit(tool.editsPixels);
  }

  cancelStroke(): void {
    this.unpick = null;
    if (this.marquee) {
      this.marquee = null;
      this.commit(false);
      return;
    }
    if (this.groupMove) {
      for (const { layer, base, outside } of this.groupMove.items) {
        layer.pixels.set(base);
        layer.outside = outside;
      }
      this.groupMove = null;
      this.active.history.discardLast();
      this.commit(false);
      return;
    }
    const s = this.stroke;
    const id = this.strokeTool;
    if (!s || !id) return;
    this.stroke = null;
    this.strokeTool = null;
    if (TOOLS[id].editsPixels) {
      s.layer.pixels.set(s.base);
      s.layer.outside = s.baseOutside;
      this.active.history.discardLast();
    }
    this.active.selection = s.selection;
    this.commit(false);
  }
}

function changed(a: Uint32Array, b: Uint32Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

export { MAX_SIZE };
