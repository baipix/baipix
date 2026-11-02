import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Editor } from '../src/engine/editor';
import type { PixelDoc } from '../src/engine/document';
import type { StorageAdapter } from '../src/storage/workspace';

type Effect = () => void | (() => void);

const harness = vi.hoisted(() => ({
  effect: undefined as Effect | undefined,
  ui: {
    panelWidths: { left: 240, right: 248 },
    layersFolded: false,
    homeSort: 'modified' as const,
    homeOrder: 'desc' as const,
    homeView: 'grid' as const,
    home: false,
    exportFormat: 'png' as const,
    exportCode: 'react' as const,
    exportActiveLayer: false,
    exportTileWidth: 16,
    exportTileHeight: 16,
    exportTileDrop: true,
    exportSheetColumns: null,
    collapsed: [] as string[],
    exportBackground: true,
    hiddenPalettes: [] as string[],
    preview: { open: true, collapsed: false, x: null, y: null, w: 208, h: 168, zoom: null },
  },
  locale: 'en' as const,
  localePreference: 'auto' as const,
  uiListeners: new Set<() => void>(),
  localeListeners: new Set<() => void>(),
  refreshTrash: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('react', () => ({
  useEffect: (effect: Effect) => {
    harness.effect = effect;
  },
}));

vi.mock('../src/i18n', () => ({
  getLocale: () => harness.locale,
  getLocalePreference: () => harness.localePreference,
  subscribeLocale: (listener: () => void) => {
    harness.localeListeners.add(listener);
    return () => harness.localeListeners.delete(listener);
  },
  t: (key: string) => key,
}));

vi.mock('../src/ui/uiStore', () => ({
  uiStore: {
    get: () => harness.ui,
    subscribe: (listener: () => void) => {
      harness.uiListeners.add(listener);
      return () => harness.uiListeners.delete(listener);
    },
  },
  toast: harness.toast,
}));

vi.mock('../src/ui/StorageContext', () => ({
  refreshTrash: harness.refreshTrash,
}));

const { useAutosave } = await import('../src/ui/hooks/useAutosave');

class EventTargetStub {
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

interface TestDocument extends Pick<PixelDoc, 'id' | 'updatedAt'> {
  name: string;
}

interface TestEditor {
  active: TestDocument;
  documents: TestDocument[];
  fresh: Set<string>;
  preferences: Record<string, unknown>;
  historyData: { id: string; undo: unknown[]; redo: unknown[] }[];

  onPersist: (listener: () => void) => () => void;
  subscribe: (listener: () => void) => () => void;
  getState: () => { doc: TestDocument };
  getDocuments: () => TestDocument[];
  isFresh: (id: string) => boolean;
  getPreferences: () => Record<string, unknown>;
  histories: () => TestEditor['historyData'];
  adoptDocuments: (documents: TestDocument[]) => void;
}

function makeEditor(overrides: Partial<TestEditor> = {}): TestEditor {
  const first = { id: 'first', name: 'First', updatedAt: 1 };
  const listeners = new Set<() => void>();
  const persistListeners = new Set<() => void>();

  const editor: TestEditor = {
    active: first,
    documents: [first],
    fresh: new Set(),
    preferences: { tool: 'pencil' },
    historyData: [{ id: first.id, undo: [], redo: [] }],
    onPersist: (listener) => {
      persistListeners.add(listener);
      return () => persistListeners.delete(listener);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => ({ doc: editor.active }),
    getDocuments: () => editor.documents,
    isFresh: (id) => editor.fresh.has(id),
    getPreferences: () => editor.preferences,
    histories: () => editor.historyData,
    adoptDocuments: vi.fn(),
    ...overrides,
  };
  return editor;
}

function makeStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    ...overrides,
  };
}

function useAutosaveForTest(editor: TestEditor, storage: StorageAdapter, ready = true): () => void {
  harness.effect = undefined;
  useAutosave(editor as unknown as Editor, storage, ready);

  const registeredEffect = harness.effect as Effect | undefined;

  if (!registeredEffect) throw new Error('useAutosave did not register an effect');
  return registeredEffect() ?? (() => undefined);
}

let windowStub: EventTargetStub;
let documentStub: EventTargetStub & { visibilityState: DocumentVisibilityState };
let documentGlobal: { visibilityState: DocumentVisibilityState };

beforeEach(() => {
  vi.useFakeTimers();
  windowStub = new EventTargetStub();

  documentStub = Object.assign(new EventTargetStub(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });

  documentGlobal = { visibilityState: documentStub.visibilityState };

  vi.stubGlobal('window', {
    addEventListener: windowStub.addEventListener.bind(windowStub),
    removeEventListener: windowStub.removeEventListener.bind(windowStub),
    setTimeout,
    clearTimeout,
  });

  vi.stubGlobal('document', {
    get visibilityState() {
      return documentGlobal.visibilityState;
    },
    addEventListener: documentStub.addEventListener.bind(documentStub),
    removeEventListener: documentStub.removeEventListener.bind(documentStub),
  });

  harness.refreshTrash.mockReset();
  harness.toast.mockReset();
  harness.uiListeners.clear();
  harness.localeListeners.clear();
  harness.locale = 'en';
  harness.localePreference = 'auto';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useAutosave', () => {
  it('does not activate before the workspace is ready', () => {
    const editor = makeEditor();
    const storage = makeStorage();

    const cleanup = useAutosaveForTest(editor, storage, false);
    vi.advanceTimersByTime(2_000);

    expect(storage.save).not.toHaveBeenCalled();
    expect(cleanup).toBeTypeOf('function');
  });

  it('saves the current workspace after the debounce with fresh-document filtering', async () => {
    const persisted = { id: 'persisted', name: 'Persisted', updatedAt: 20 };
    const fresh = { id: 'fresh', name: 'Fresh', updatedAt: 30 };
    const editor = makeEditor({ active: fresh, documents: [persisted, fresh], fresh: new Set(['fresh']) });
    const storage = makeStorage();

    useAutosaveForTest(editor, storage);

    vi.advanceTimersByTime(599);
    expect(storage.save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(storage.save).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(harness.refreshTrash).toHaveBeenCalledWith(storage));

    expect(storage.save).toHaveBeenCalledWith({
      documents: [persisted],
      activeId: 'persisted',
      preferences: editor.preferences,
      ui: {
        ...harness.ui,
        locale: 'en',
        localePreference: 'auto',
      },
    });
  });

  it('saves history separately and includes only non-fresh documents', async () => {
    const kept = { id: 'kept', name: 'Kept', updatedAt: 1 };
    const fresh = { id: 'fresh', name: 'Fresh', updatedAt: 2 };
    const editor = makeEditor({
      active: kept,
      documents: [kept, fresh],
      fresh: new Set(['fresh']),
      historyData: [
        { id: 'kept', undo: ['undo'], redo: [] },
        { id: 'fresh', undo: ['fresh'], redo: [] },
      ],
    });
    const saveHistory = vi.fn(async () => undefined);
    const storage = makeStorage({ saveHistory });

    useAutosaveForTest(editor, storage);

    vi.advanceTimersByTime(2_000);
    await vi.waitFor(() => expect(saveHistory).toHaveBeenCalledTimes(1));

    expect(saveHistory).toHaveBeenCalledWith([{ id: 'kept', undo: ['undo'], redo: [] }]);
  });

  it('keeps all documents when every document is fresh', async () => {
    const first = { id: 'first', name: 'First', updatedAt: 1 };
    const second = { id: 'second', name: 'Second', updatedAt: 2 };
    const editor = makeEditor({
      active: second,
      documents: [first, second],
      fresh: new Set(['first', 'second']),
    });
    const storage = makeStorage();

    useAutosaveForTest(editor, storage);

    vi.advanceTimersByTime(600);
    await vi.waitFor(() => expect(storage.save).toHaveBeenCalledTimes(1));

    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ documents: [first, second], activeId: 'second' }),
    );
  });

  it('reschedules both saves when an observed UI change occurs', async () => {
    const saveHistory = vi.fn(async () => undefined);
    const storage = makeStorage({ saveHistory });

    useAutosaveForTest(makeEditor(), storage);

    vi.advanceTimersByTime(500);
    harness.uiListeners.forEach((listener) => listener());

    vi.advanceTimersByTime(599);
    expect(storage.save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(storage.save).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_399);
    expect(saveHistory).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(saveHistory).toHaveBeenCalledTimes(1));
  });

  it('reports a workspace save failure only once during one effect lifecycle', async () => {
    const storage = makeStorage({ save: vi.fn(async () => Promise.reject(new Error('save failed'))) });

    useAutosaveForTest(makeEditor(), storage);

    vi.advanceTimersByTime(600);
    await vi.waitFor(() => expect(harness.toast).toHaveBeenCalledTimes(1));

    harness.localeListeners.forEach((listener) => listener());

    vi.advanceTimersByTime(600);
    await Promise.resolve();

    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(harness.toast).toHaveBeenCalledTimes(1);
  });

  it('flushes workspace and history immediately on pagehide', async () => {
    const saveHistory = vi.fn(async () => undefined);
    const storage = makeStorage({ saveHistory });

    useAutosaveForTest(makeEditor(), storage);
    windowStub.dispatch('pagehide');

    await vi.waitFor(() => {
      expect(storage.save).toHaveBeenCalledTimes(1);
      expect(saveHistory).toHaveBeenCalledTimes(1);
    });
  });

  it('adopts changed documents only when the page is visible', async () => {
    const changed = [{ id: 'other', name: 'Other', updatedAt: 4 }] as unknown as PixelDoc[];
    const editor = makeEditor();
    const changedElsewhere = vi.fn(async () => changed);
    const storage = makeStorage({ changedElsewhere });

    useAutosaveForTest(editor, storage);
    windowStub.dispatch('focus');
    await vi.waitFor(() => expect(editor.adoptDocuments).toHaveBeenCalledWith(changed));

    changedElsewhere.mockClear();
    documentGlobal.visibilityState = 'hidden';
    windowStub.dispatch('focus');
    documentStub.dispatch('visibilitychange');

    expect(changedElsewhere).not.toHaveBeenCalled();
  });

  it('cleans up timers and event subscriptions on unmount', () => {
    const editor = makeEditor();
    const storage = makeStorage();
    const cleanup = useAutosaveForTest(editor, storage);

    cleanup();
    vi.advanceTimersByTime(2_000);
    windowStub.dispatch('pagehide');
    windowStub.dispatch('focus');
    documentStub.dispatch('visibilitychange');
    harness.uiListeners.forEach((listener) => listener());
    harness.localeListeners.forEach((listener) => listener());

    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.saveHistory).toBeUndefined();
  });
});
