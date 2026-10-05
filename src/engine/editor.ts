import { adjustColor, alpha, opaque, withAlpha, type Color, type ColorAdjustment } from './color';
import { flatten, mergeLayerInto, type BlendMode, type FlattenOptions } from './composite';
import {
  activeLayer,
  cloneDocument,
  cloneLayer,
  createDocument,
  createLayer,
  MAX_SIZE,
  newId,
  resizeDocument,
  type Layer,
  type PixelDoc,
  type ReferenceImage,
  type RenderSettings,
} from './document';
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
  | { type: 'merged' };

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
  /** A click beside every layer with the Move tool: the active layer stays active, without its frame. */
  unframed?: boolean;
}

/** What the last delete removed, so it can be brought back (the toast's Undo button). */
type Deleted =
  | { kind: 'file'; session: Session; index: number }
  | { kind: 'layer'; session: Session; layer: Layer; index: number }
  | { kind: 'layers'; session: Session; entries: { layer: Layer; index: number }[] };

type Listener = () => void;

/** How many recent colors are kept. */
export const RECENT_COLORS = 8;

const DEFAULT_LABELS: EditorLabels = {
  layer: (n) => `Layer ${n}`,
  copyOf: (name) => `${name} copy`,
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
  /** The active layer's blend mode while another one is previewed. */
  private blendPreview: { layer: Layer; mode: BlendMode | undefined } | null = null;
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
      referenceSelected: !!s.referencePicked && !!s.doc.reference,
      layerFramed: !s.unframed,
      canUndo: s.history.canUndo,
      canRedo: s.history.canRedo,
      revision: this.revision,
    };
  }

  /** Publishes a change. `persist` is false for pure UI changes that don't need saving. */
  private commit(persist = true): void {
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
      doc.activeLayer = doc.layers.indexOf(entries[entries.length - 1].layer);
      this.active.picked = entries.map((x) => x.layer.id);
    });
    return true;
  }

  /* ------------------------------------------------------------------ document */

  resize(width: number, height: number): void {
    const w = clamp(Math.round(width) || this.doc.width, 1, MAX_SIZE);
    const h = clamp(Math.round(height) || this.doc.height, 1, MAX_SIZE);
    if (w === this.doc.width && h === this.doc.height) return;
    this.edit((doc) => {
      resizeDocument(doc, w, h);
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
      if (l.visible && !l.locked && l.opacity > 0 && l.pixels[i] >>> 24) return k;
    }
    return -1;
  }

  setActiveLayer(index: number): void {
    if (index < 0 || index >= this.doc.layers.length) return;
    const id = this.doc.layers[index].id;
    const s = this.active;
    if (index === this.doc.activeLayer && s.picked?.length === 1 && !s.referencePicked && !s.unframed) return;
    s.referencePicked = false;
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
      doc.layers.splice(
        doc.activeLayer + 1,
        0,
        createLayer(this.labels.layer(doc.layerCounter), doc.width, doc.height),
      );
      doc.activeLayer += 1;
    });
  }

  duplicateLayer(): void {
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
      doc.layers = doc.layers.filter((l) => !picked.includes(l));
      doc.activeLayer = Math.min(doc.layers.length - 1, Math.max(0, entries[0].index - 1));
      this.deleted = { kind: 'layers', session: this.active, entries };
    });
    return picked.length;
  }

  /** Returns false when nothing was deleted. The layer can be brought back with `restoreDeleted`. */
  deleteLayer(): boolean {
    if (this.doc.layers.length < 2) return false;
    this.edit((doc) => {
      const index = doc.activeLayer;
      const [layer] = doc.layers.splice(index, 1);
      doc.activeLayer = Math.max(0, index - 1);
      this.deleted = { kind: 'layer', session: this.active, layer, index };
    });
    return true;
  }

  moveLayer(direction: 1 | -1): void {
    const i = this.doc.activeLayer;
    const j = i + direction;
    if (j < 0 || j >= this.doc.layers.length) return;
    this.edit((doc) => {
      [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]];
      doc.activeLayer = j;
    });
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

  mergeDown(): void {
    const i = this.doc.activeLayer;
    if (i <= 0) return;
    if (this.doc.layers[i].locked || this.doc.layers[i - 1].locked) {
      this.notice({ type: 'layerLocked' });
      return;
    }
    this.edit((doc) => {
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
    const visible = this.doc.layers.filter((l) => l.visible);
    if (!visible.length || (visible.length === 1 && visible.length === this.doc.layers.length)) return;
    if (visible.some((l) => l.locked)) {
      this.notice({ type: 'layerLocked' });
      return;
    }
    this.edit((doc) => {
      const [bottom, ...rest] = visible;
      for (const layer of rest) mergeLayerInto(layer, bottom);
      doc.layers = [bottom];
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
      for (const layer of rest) mergeLayerInto(layer, bottom);
      doc.layers = doc.layers.filter((l) => !rest.includes(l));
      doc.activeLayer = doc.layers.indexOf(bottom);
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
    });
  }

  /** Merges every visible layer into the lowest visible one, as one undo step. */
  mergeVisible(): void {
    this.mergeInto(this.doc.layers.filter((l) => l.visible));
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

  /** Paint on a locked layer: tells the user why nothing happens. */
  private activeLocked(): boolean {
    if (!activeLayer(this.doc).locked) return false;
    this.notice({ type: 'layerLocked' });
    return true;
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
    const layer = activeLayer(this.doc);
    if (!this.blendPreview) this.blendPreview = { layer, mode: layer.blendMode };
    const next = mode ?? this.blendPreview.mode ?? 'normal';
    if ((layer.blendMode ?? 'normal') === next) return;
    if (next === 'normal') delete layer.blendMode;
    else layer.blendMode = next;
    this.pixelsChanged();
  }

  endBlendPreview(): void {
    const p = this.blendPreview;
    if (!p) return;
    this.blendPreview = null;
    if (p.mode) p.layer.blendMode = p.mode;
    else delete p.layer.blendMode;
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

  /** Rotates the selection (or the layer) by 90° clockwise; the selection follows the new shape. */
  rotate(): void {
    if (this.activeLocked()) return;
    const hadSelection = this.active.selection !== null;
    this.edit((doc) => {
      const layer = activeLayer(doc);
      const rotated = rotateRect(layer.pixels, doc.width, doc.height, this.targetRect());
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
    if (!layer.visible || this.activeLocked()) return null;
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
    const { width, height } = this.doc;
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const scaled = scaleBlock(sc.block, w, h);
    if (sc.cleared) {
      sc.layer.pixels.set(sc.cleared);
      stampBlock(sc.layer.pixels, width, height, scaled, x, y);
      this.active.selection = { x, y, w, h };
    } else {
      // A whole layer: what lands outside the canvas is kept, like a move.
      const r = reframe(scaled.pixels, w, h, undefined, x, y, width, height);
      sc.layer.pixels.set(r.pixels);
      sc.layer.outside = r.outside;
    }
    this.pixelsChanged();
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
  nudge(dx: number, dy: number): void {
    const r = this.doc.reference;
    if (this.state.referenceSelected && r) {
      if (!r.locked) this.updateReference({ x: r.x + dx, y: r.y + dy });
      return;
    }
    if (this.stroke || !activeLayer(this.doc).visible || this.activeLocked()) return;
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
    return true;
  }

  cut(): boolean {
    if (this.activeLocked() || !this.copy()) return false;
    if (!this.active.selection) this.selectAll();
    this.clearSelection();
    return true;
  }

  hasClipboard(): boolean {
    return this.clipboard !== null;
  }

  /** Pastes the clipboard (or a given block) on a new layer, selected, with the move tool active. */
  paste(block: PixelBlock | null = this.clipboard, name = this.labels.pasted): void {
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
    return this.stroke !== null;
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
    if (tool.editsPixels && this.activeLocked()) return false;
    if (tool.editsPixels && !activeLayer(this.doc).visible) {
      this.notice({ type: 'layerHidden' });
      return false;
    }
    if (tool.editsPixels) this.checkpoint();
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
    if (k === this.doc.activeLayer) return true;
    const id = this.doc.layers[k].id;
    this.doc.activeLayer = k;
    this.active.picked = [id];
    this.active.anchor = id;
    this.commit(false);
    return true;
  }

  moveStroke(p: Point, mods: Modifiers): void {
    if (!this.stroke || !this.strokeTool) return;
    TOOLS[this.strokeTool].onMove(this.stroke, this.stabilized(p), mods);
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
    if (tool.paintsColor) {
      const [c1, c2] = strokeColors(s);
      if (s.options.dither) this.remember(c1, c2);
      else this.remember(c1);
    }
    this.commit(tool.editsPixels);
  }

  cancelStroke(): void {
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
