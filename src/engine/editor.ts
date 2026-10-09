import { adjustColor, alpha, opaque, withAlpha, type Color, type ColorAdjustment } from './color';
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
import { flipOutside, layerContent, reframe, type Outside } from './outside';
import { clamp, clipRect, type Point, type Rect } from './math';
import { PaletteIndex, hueShiftedRamp, presetColors, sortByLightness } from './palette';
import {
  extractBlock,
  fillRect,
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

export const DEFAULT_TILE_OPACITY = 0.65;

export interface PaletteState {
  /** Preset key, or 'custom'. */
  key: string;
  colors: Color[];
  custom: Color[] | null;
}

export interface FileInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Last change, in ms since the epoch. */
  updatedAt: number;
}

/** Immutable snapshot consumed by the UI. A new object is created on every change. */
export interface EditorState {
  files: FileInfo[];
  activeId: string;
  /** The active document. Its pixel buffers are mutable; rely on `revision` to detect changes. */
  doc: PixelDoc;
  selection: Rect | null;
  tool: ToolId;
  options: ToolOptions;
  primary: Color;
  secondary: Color;
  palette: PaletteState;
  /** Last colors painted with, most recent first. */
  recent: Color[];
  /** Custom brushes made from selections. */
  brushes: BrushInfo[];
  view: ViewSettings;
  /** Ids of the selected layers, bottom to top. Always includes the active layer. */
  selectedLayers: string[];
  /** The group selected in the Layers panel (its layers are the selected ones), or null. */
  selectedGroup: string | null;
  /** The reference image is selected (in the Layers panel, or picked by the Move tool). */
  referenceSelected: boolean;
  /** The Move tool frames the active layer (until a click beside every layer). */
  layerFramed: boolean;
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
  | { type: 'componentCreated' };

export interface Preferences {
  tool: ToolId;
  options: ToolOptions;
  primary: Color;
  secondary: Color;
  palette: PaletteState;
  recent: Color[];
  view: ViewSettings;
  /** Custom brushes, colors as numbers so they can be saved as they are. */
  brushes: StoredBrush[];
}

interface Session {
  doc: PixelDoc;
  history: History;
  selection: Rect | null;
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
  | { kind: 'file'; session: Session; index: number }
  | { kind: 'layer'; session: Session; layer: Layer; index: number }
  | {
      kind: 'layers';
      session: Session;
      entries: { layer: Layer; index: number }[];
      /** The groups as they were, to bring back the ones that went away with their layers. */
      groups?: LayerGroup[];
    };

type Listener = () => void;

/** How many recent colors are kept. */
export const RECENT_COLORS = 8;

const DEFAULT_LABELS: EditorLabels = {
  layer: (n) => `Layer ${n}`,
  copyOf: (name) => `${name} copy`,
  group: (n) => `Group ${n}`,
  untitled: (n) => (n > 1 ? `Untitled ${n}` : 'Untitled'),
  pasted: 'Pasted',
  brush: (n) => `Brush ${n}`,
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
  private palette: PaletteState;
  private paletteIndex: PaletteIndex;
  private view: ViewSettings = {
    grid: true,
    tile: false,
    tileOpacity: DEFAULT_TILE_OPACITY,
    mirrorX: false,
    mirrorY: false,
    rulers: false,
  };
  private clipboard: PixelBlock | null = null;
  /** Whole layers copied (the last copy wins over `clipboard`). */
  private layerClip: LayerFragment | null = null;
  /** The id of the last layers copied here, even if pixels were copied since. */
  private layerClipId: string | null = null;
  private stroke: Stroke | null = null;
  /** Color adjustment in progress: the original pixels of the layers being adjusted. */
  /** Resizing by the handles: the content being resized and how to put it back. */
  private scaling: {
    layer: Layer;
    base: Uint32Array;
    baseOutside: Outside | undefined;
    from: Rect;
    block: PixelBlock;
    /** With a selection: the layer with the selection emptied, to stamp the resized block on. */
    cleared?: Uint32Array;
    /** Rotating rather than resizing: prepared once for the block. */
    rotator?: Rotator;
  } | null = null;
  private adjusting: {
    layers: { id: string; base: Uint32Array }[];
    rect: Rect;
    /** The palette before the adjustment, while it's previewed on the palette too. */
    basePalette?: PaletteState;
  } | null = null;
  private strokeTool: ToolId | null = null;
  private opacityChange = false;
  private deleted: Deleted | null = null;
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
  private revision = 0;
  private state!: EditorState;

  private listeners = new Set<Listener>();
  private pixelListeners = new Set<Listener>();
  private persistListeners = new Set<Listener>();
  private noticeListeners = new Set<(n: Notice) => void>();

  constructor(private labels: EditorLabels = DEFAULT_LABELS) {
    const colors = presetColors('sweetie16');
    this.palette = { key: 'sweetie16', colors, custom: null };
    this.paletteIndex = new PaletteIndex(colors);
    this.primary = colors[0];
    this.secondary = colors[12];
    this.addSession(createDocument(labels.untitled(1), 32, 32, labels.layer(1)));
    this.refresh();
  }

  /* ------------------------------------------------------------------ subscriptions */

  getState = (): EditorState => this.state;

  /** Live document and selection, updated during strokes (the state snapshot is not). */
  getLive = (): { doc: PixelDoc; selection: Rect | null; view: ViewSettings; stroking: ToolId | null } => ({
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
      files: this.sessions.map(({ doc }) => ({
        id: doc.id,
        name: doc.name,
        width: doc.width,
        height: doc.height,
        updatedAt: doc.updatedAt ?? 0,
      })),
      activeId: s.doc.id,
      doc: s.doc,
      selection: s.selection,
      tool: this.tool,
      options: this.options,
      primary: this.primary,
      secondary: this.secondary,
      palette: this.palette,
      recent: this.recent,
      brushes: this.brushes.map(({ id, name, width, height }) => ({ id, name, width, height })),
      view: this.view,
      selectedLayers: s.picked,
      selectedGroup: s.pickedGroup ?? null,
      referenceSelected: !!s.referencePicked && !!s.doc.reference,
      layerFramed: !s.unframed,
      canUndo: s.history.canUndo,
      canRedo: s.history.canRedo,
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
    this.active.history.push(takeSnapshot(this.doc, this.active.selection));
    this.touch();
  }

  /** Dates the active file's last change. */
  private touch(): void {
    this.doc.updatedAt = Date.now();
    this.fresh.delete(this.doc.id);
  }

  private restore(snapshot: Snapshot): void {
    if (snapshot.palette) this.usePalette(snapshot.palette);
    // The reference image and the guides aren't part of the history: undo and redo leave them.
    const { reference, guides } = this.active.doc;
    snapshot.doc.reference = reference;
    if (!reference) delete snapshot.doc.reference;
    snapshot.doc.guides = guides;
    if (!guides) delete snapshot.doc.guides;
    this.active.doc = snapshot.doc;
    this.active.selection = snapshot.selection;
  }

  undo(): void {
    if (this.stroke || this.adjusting || this.scaling) return;
    const current = takeSnapshot(this.doc, this.active.selection);
    const prev = this.active.history.undo(current);
    if (prev) {
      // A step that changed the palette swaps it back and forth with the pixels.
      if (prev.palette) current.palette = this.palette.colors;
      this.forgetDeletedLayer();
      this.restore(prev);
      this.touch();
      this.commit();
    }
  }

  redo(): void {
    if (this.stroke || this.adjusting || this.scaling) return;
    const current = takeSnapshot(this.doc, this.active.selection);
    const next = this.active.history.redo(current);
    if (next) {
      if (next.palette) current.palette = this.palette.colors;
      this.forgetDeletedLayer();
      this.restore(next);
      this.touch();
      this.commit();
    }
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
    this.active = session;
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

  /** Replaces every file, e.g. when restoring a saved workspace. */
  loadDocuments(docs: PixelDoc[], activeId?: string): void {
    if (!docs.length) return;
    this.cancelStroke();
    const now = Date.now();
    docs.forEach((doc) => (doc.updatedAt ??= now));
    this.sessions = docs.map((doc) => ({ doc, history: new History(), selection: null }));
    this.deleted = null;
    this.active = this.sessions.find((s) => s.doc.id === activeId) ?? this.sessions[0];
    this.commit(false);
  }

  getDocuments(): PixelDoc[] {
    return this.sessions.map((s) => s.doc);
  }

  switchFile(id: string): void {
    const target = this.sessions.find((s) => s.doc.id === id);
    if (!target || target === this.active) return;
    this.cancelStroke();
    this.cancelAdjust();
    this.active = target;
    this.dropFresh();
    this.commit();
  }

  renameFile(id: string, name: string): void {
    const s = this.sessions.find((x) => x.doc.id === id);
    const clean = name.trim().slice(0, 120);
    if (!s || !clean || clean === s.doc.name) return;
    s.doc.name = clean;
    s.doc.updatedAt = Date.now();
    this.fresh.delete(id);
    this.commit();
  }

  duplicateFile(id: string): void {
    const i = this.sessions.findIndex((x) => x.doc.id === id);
    if (i < 0) return;
    this.cancelStroke();
    const copy = cloneDocument(this.sessions[i].doc, false);
    copy.name = this.labels.copyOf(copy.name);
    copy.updatedAt = Date.now();
    const session: Session = { doc: copy, history: new History(), selection: null };
    this.sessions.splice(i + 1, 0, session);
    this.active = session;
    this.commit();
  }

  /**
   * Returns false when nothing was deleted. The file can be brought back with `restoreDeleted`.
   * The editor always holds a file: deleting the last one leaves a blank one in its place.
   */
  deleteFile(id: string): boolean {
    const i = this.sessions.findIndex((x) => x.doc.id === id);
    if (i < 0) return false;
    this.cancelStroke();
    if (this.sessions.length === 1) {
      const { width, height } = this.sessions[0].doc;
      this.sessions.push({
        doc: createDocument(this.labels.untitled(1), width, height, this.labels.layer(1)),
        history: new History(),
        selection: null,
      });
    }
    const [removed] = this.sessions.splice(i, 1);
    if (removed === this.active) this.active = this.sessions[Math.max(0, i - 1)];
    this.deleted = { kind: 'file', session: removed, index: i };
    this.commit();
    return true;
  }

  /** Removes a file for good, without offering to bring it back (the home screen's blank file). */
  discardFile(id: string): void {
    const i = this.sessions.findIndex((x) => x.doc.id === id);
    if (i < 0 || this.sessions.length < 2) return;
    this.cancelStroke();
    const [removed] = this.sessions.splice(i, 1);
    if (removed === this.active) this.active = this.sessions[Math.max(0, i - 1)];
    this.commit();
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
      this.sessions.splice(Math.min(d.index, this.sessions.length), 0, d.session);
      this.active = d.session;
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
      resizeDocument(doc, w, h, o.x, o.y);
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

  duplicateLayer(): void {
    if (this.active.pickedGroup) return this.duplicateGroup(this.active.pickedGroup);
    this.edit((doc) => {
      const copy = cloneLayer(activeLayer(doc), false);
      copy.name = this.labels.copyOf(copy.name);
      doc.layers.splice(doc.activeLayer + 1, 0, copy);
      doc.activeLayer += 1;
    });
  }

  /**
   * Deletes the selected layers (at least one layer stays). Returns how many were deleted; they can be
   * brought back with `restoreDeleted`.
   */
  deleteLayers(): number {
    const picked = this.pickedLayers();
    if (picked.length < 2) return this.deleteLayer() ? 1 : 0;
    if (picked.length >= this.doc.layers.length) return 0;
    this.edit((doc) => {
      const entries = picked.map((layer) => ({ layer, index: doc.layers.indexOf(layer) }));
      const groups = doc.groups?.map((g) => ({ ...g }));
      doc.layers = doc.layers.filter((l) => !picked.includes(l));
      doc.activeLayer = Math.min(doc.layers.length - 1, Math.max(0, entries[0].index - 1));
      normalizeGroups(doc);
      this.deleted = { kind: 'layers', session: this.active, entries, groups };
    });
    return picked.length;
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
   * it would go deeper than two levels.
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
    const height = Math.max(
      ...items.map((it) =>
        it.kind === 'layer' ? 0 : 1 + ((doc.groups ?? []).some((g) => g.parent === it.id) ? 1 : 0),
      ),
    );
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
  private duplicateGroup(id: string): void {
    const doc = this.doc;
    const layers = groupLayers(doc, id);
    if (!layers.length) return;
    this.edit((d) => {
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
    });
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
      mergeLayerInto(doc.layers[i], doc.layers[i - 1]);
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
      for (const layer of rest) mergeLayerInto(layer, bottom);
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

  setPalettePreset(key: string): void {
    const colors = key === 'custom' ? (this.palette.custom ?? []) : presetColors(key);
    this.palette = { ...this.palette, key, colors };
    this.paletteIndex = new PaletteIndex(colors);
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
    this.usePalette(colors);
    this.commit();
  }

  /** Sets the palette (as a custom one) without publishing the change. */
  private usePalette(colors: Color[]): void {
    const unique = [...new Set(colors.map(opaque))];
    this.palette = { key: 'custom', colors: unique, custom: unique };
    this.paletteIndex = new PaletteIndex(unique);
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
    this.active.history.top()!.palette = this.palette.colors;
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
    // The swatch takes the new color, unless the palette has it already.
    if (inPalette) this.usePalette(this.palette.colors.map((c) => (c === a ? b : c)));
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
    this.commit();
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
      palette: this.palette,
      recent: this.recent,
      view: this.view,
      brushes: this.brushes.map((b) => ({ ...b, pixels: [...b.pixels] })),
    };
  }

  setPreferences(p: Partial<Preferences>): void {
    if (p.tool && p.tool in TOOLS) this.tool = p.tool;
    if (p.options) this.options = { ...DEFAULT_TOOL_OPTIONS, ...p.options };
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
    if (Array.isArray(p.brushes))
      this.brushes = p.brushes
        .filter((b) => b && typeof b.id === 'string' && b.width > 0 && b.height > 0)
        .filter((b) => Array.isArray(b.pixels) && b.pixels.length === b.width * b.height)
        .map((b) => ({ ...b, pixels: Uint32Array.from(b.pixels) }));
    if (Array.isArray(p.recent))
      this.recent = p.recent.filter((c) => typeof c === 'number').slice(0, RECENT_COLORS);
    if (p.palette?.colors?.length) {
      this.palette = p.palette;
      this.paletteIndex = new PaletteIndex(p.palette.colors);
    }
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
    const r = clipRect(sel, width, height);
    const block = extractBlock(activeLayer(this.doc).pixels, width, height, r);
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
    this.edit((doc) => fillRect(activeLayer(doc).pixels, doc.width, doc.height, this.targetRect(), 0));
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
      fillRect(activeLayer(doc).pixels, doc.width, doc.height, this.targetRect(), this.primary),
    );
  }

  flip(horizontal: boolean): void {
    if (this.activeLocked()) return;
    const wholeLayer = !this.active.selection;
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
    const hadSelection = this.active.selection !== null;
    this.edit((doc) => {
      const layer = activeLayer(doc);
      const rotated = rotateRect(layer.pixels, doc.width, doc.height, this.targetRect(), clockwise);
      if (hadSelection) this.active.selection = rotated;
      // Rotating the layer turns it within the canvas: what was outside doesn't follow.
      else delete layer.outside;
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
    for (const { id, base } of layers) {
      const layer = this.doc.layers.find((l) => l.id === id);
      if (layer) layer.pixels.set(change ? change(base, width, rect) : base);
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
    if (palette) this.active.history.top()!.palette = base.colors;
    this.writeAdjustment(change);
    this.adjusting = null;
    if (palette) this.usePalette(palette(base.colors));
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
    // A group (several layers) isn't resized by its handles yet: it can be moved.
    if (!this.active.selection && this.state.selectedLayers.length > 1) return null;
    const base = layer.pixels.slice();
    const sel = this.active.selection ? clipRect(this.active.selection, doc.width, doc.height) : null;
    if (sel && sel.w && sel.h) {
      const block = extractBlock(base, doc.width, doc.height, sel);
      const cleared = base.slice();
      fillRect(cleared, doc.width, doc.height, sel, 0);
      this.checkpoint();
      this.scaling = { layer, base, baseOutside: layer.outside, from: sel, block, cleared };
      return { ...sel };
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

  /** Shows the content resized into `rect` (canvas pixels), from the original pixels. */
  previewScale(rect: Rect): void {
    const sc = this.scaling;
    if (!sc) return;
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    this.placeTransformed(scaleBlock(sc.block, w, h), x, y);
  }

  /** Puts the lifted content back, transformed, at (x, y): on the emptied layer, or as the whole layer. */
  private placeTransformed(block: PixelBlock, x: number, y: number): void {
    const sc = this.scaling!;
    const { width, height } = this.doc;
    if (sc.cleared) {
      sc.layer.pixels.set(sc.cleared);
      stampBlock(sc.layer.pixels, width, height, block, x, y);
      this.active.selection = { x, y, w: block.width, h: block.height };
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
    if (from) this.scaling!.rotator = rotator(this.scaling!.block);
    return from;
  }

  /** Shows the content turned by `degrees` (clockwise) around its center. Commit with `endScale`. */
  previewRotate(degrees: number): void {
    const sc = this.scaling;
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
    this.commit();
  }

  /** Puts the content back as it was, without an undo step. */
  cancelScale(): void {
    const sc = this.scaling;
    if (!sc) return;
    sc.layer.pixels.set(sc.base);
    sc.layer.outside = sc.baseOutside;
    if (sc.cleared) this.active.selection = sc.from;
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
      this.commit();
      return;
    }
    if (!isShown(this.doc, activeLayer(this.doc)) || this.activeLocked(true)) return;
    this.active.unframed = false;
    this.checkpoint();
    const s = this.createStroke({ x: 0, y: 0 }, false);
    beginMove(s);
    applyMove(s, dx, dy);
    this.commit();
  }

  copy(): boolean {
    const r = clipRect(this.targetRect(), this.doc.width, this.doc.height);
    if (!r.w || !r.h) return false;
    this.clipboard = extractBlock(activeLayer(this.doc).pixels, this.doc.width, this.doc.height, r);
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
    return this.stroke !== null || this.groupMove !== null;
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
      wrap: this.view.tile,
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
    if (this.adjusting) return false;
    const id = toolOverride ?? this.tool;
    const tool = TOOLS[id];
    // Drawing, or moving pixels, goes back to the active layer.
    if (tool.editsPixels && this.active.referencePicked) {
      this.active.referencePicked = false;
      this.commit(false);
    }
    if (id === 'move' && !this.active.selection) {
      // Beside every layer (and outside the active one's frame), a click just drops the frame.
      if (!mods.keepLayer && !this.pickLayerAt(p)) {
        if (!this.active.unframed) {
          this.active.unframed = true;
          this.commit(false);
        }
        return false;
      }
      this.active.unframed = false;
    }
    // A group (or several layers) selected: the Move tool moves them all.
    if (id === 'move' && !this.active.selection && this.state.selectedLayers.length > 1)
      return this.beginGroupMove(p);
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
    }
    this.stroke = this.createStroke(p, secondary);
    this.strokeTool = id;
    tool.onDown(this.stroke, p, mods);
    this.pixelsChanged();
    return true;
  }

  /**
   * Makes the layer under `p` the active one (see `layerAt`), without an undo step of its own.
   * Returns false when there's nothing to take there: no layer pixel, and not inside the frame of
   * the active layer (a hole in a drawing still moves it).
   */
  private pickLayerAt(p: Point): boolean {
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

  /** Moving every selected layer together (a group), whole layers with what's off the canvas. */
  private beginGroupMove(p: Point): boolean {
    const layers = this.pickedLayers();
    if (layers.some((l) => isLocked(this.doc, l))) {
      this.notice({ type: 'layerLocked' });
      return false;
    }
    this.checkpoint();
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
    if (this.groupMove) {
      this.groupMove = null;
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
    if (tool.paintsColor) {
      const [c1, c2] = strokeColors(s);
      if (s.options.dither) this.remember(c1, c2);
      else this.remember(c1);
    }
    this.commit(tool.editsPixels);
  }

  cancelStroke(): void {
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
