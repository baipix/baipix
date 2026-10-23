import { CODE_LANGUAGES, type CodeLanguage } from '../engine/export/code';
import { openFromUrl } from './openFromUrl';
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { isBoard } from '../engine/document';
import type { Editor } from '../engine/editor';
import { setLocale, t, useT, type Locale } from '../i18n';
import { importLegacyWorkspace } from '../io/legacy';
import type { StorageAdapter } from '../storage/workspace';
import { ActionsContext } from './ActionsContext';
import { createActions } from './actions';
import { CanvasView } from './components/CanvasView';
import { ColorPicker } from './components/ColorPicker';
import { CommandPalette } from './components/CommandPalette';
import { startTourOnce, Tour } from './components/Tour';
import { FloatingPreview } from './components/FloatingPreview';
import { ColorAdjustPanel } from './components/ColorAdjustPanel';
import { Coordinates } from './components/Coordinates';
import { IconButton } from './components/IconButton';
import { MenuBar } from './components/MenuBar';
import { MenuHost, openMenu } from './components/Menu';
import { MobileBar } from './components/MobileBar';
import { MobileColors } from './components/MobileColors';
import { PanelResizer } from './components/PanelResizer';
import { ToolOptionsBar } from './components/ToolOptionsBar';
import { Toasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { Tooltips } from './components/Tooltips';
import { Dialogs } from './dialogs/Dialogs';
import { EditorContext } from './EditorContext';
import { refreshTrash, StorageContext } from './StorageContext';
import { CHANGELOG_URL } from './links';
import { helpMenu } from './menus';
import { useAutosave } from './hooks/useAutosave';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useNotices } from './hooks/useNotices';
import { leaveHome, showEmptyHome } from './home';
import { HomeScreen } from './panels/HomeScreen';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import { PANEL_LIMITS, toast, uiStore, type PreviewWindow, type UiState } from './uiStore';

const editorLabels = () => ({
  layer: (n: number) => t('default.layer', { n }),
  copyOf: (name: string) => t('default.copyOf', { name }),
  untitled: (n: number) => (n > 1 ? t('default.untitledN', { n }) : t('default.untitled')),
  pasted: t('default.pasted'),
  brush: (n: number) => t('default.brush', { n }),
  palette: (n: number) => t('default.myPalette', { n }),
  group: (n: number) => t('default.group', { n }),
  board: (n: number) => t('default.board', { n }),
});

/** The saved preview window, checked field by field (older saves don't have it). */
function readPreview(p: Partial<PreviewWindow>): PreviewWindow {
  const d = uiStore.get().preview;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const opt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    open: p.open !== false,
    collapsed: p.collapsed === true,
    x: opt(p.x),
    y: opt(p.y),
    w: Math.max(140, num(p.w, d.w)),
    h: Math.max(100, num(p.h, d.h)),
    zoom: opt(p.zoom),
  };
}

/** A tile side from a save: 1 to 512 pixels, 16 when missing. */
const tileSide = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(512, Math.max(1, Math.round(n))) : 16;

/** Restores the saved workspace (or imports the prototype's drawings) before enabling autosave. */
function useRestore(editor: Editor, storage: StorageAdapter): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let firstRun = true;
      try {
        const saved = await storage.load();
        if (cancelled) return;
        if (saved) {
          firstRun = false;
          const ui = saved.ui as Partial<UiState> & { locale?: Locale };
          if (ui.locale) setLocale(ui.locale);
          editor.setLabels(editorLabels());
          const widths = ui.panelWidths;
          uiStore.set({
            exportFormat:
              ui.exportFormat === 'svg' || ui.exportFormat === 'aseprite' || ui.exportFormat === 'tileset'
                ? ui.exportFormat
                : 'png',
            exportCode: CODE_LANGUAGES.includes(ui.exportCode as CodeLanguage)
              ? (ui.exportCode as CodeLanguage)
              : 'react',
            exportActiveLayer: !!ui.exportActiveLayer,
            layersFolded: !!ui.layersFolded,
            homeSort: ui.homeSort === 'name' ? 'name' : 'modified',
            homeOrder: ui.homeOrder === 'asc' ? 'asc' : 'desc',
            homeView: ui.homeView === 'list' ? 'list' : 'grid',
            exportTileWidth: tileSide(ui.exportTileWidth),
            exportTileHeight: tileSide(ui.exportTileHeight),
            exportTileDrop: ui.exportTileDrop !== false,
            collapsed: Array.isArray(ui.collapsed) ? ui.collapsed.filter((x) => typeof x === 'string') : [],
            exportBackground: ui.exportBackground !== false,
            hiddenPalettes: Array.isArray(ui.hiddenPalettes)
              ? ui.hiddenPalettes.filter((x) => typeof x === 'string')
              : [],
            ...(ui.preview && typeof ui.preview === 'object' && { preview: readPreview(ui.preview) }),
            ...(widths && {
              panelWidths: {
                left: Math.min(Math.max(widths.left, PANEL_LIMITS.left.min), PANEL_LIMITS.left.max),
                right: Math.min(Math.max(widths.right, PANEL_LIMITS.right.min), PANEL_LIMITS.right.max),
              },
            }),
          });
          editor.setPreferences(saved.preferences);
          editor.loadDocuments(saved.documents, saved.activeId);
          // The undo history, as it was: a failed read only loses the undo steps.
          try {
            const history = await storage.loadHistory?.();
            if (history?.length && !cancelled) editor.restoreHistories(history);
          } catch {
            /* no history to restore */
          }
          toast(
            saved.documents.length > 1
              ? t('toast.filesRestored', { count: saved.documents.length })
              : t('toast.restored'),
          );
        } else {
          const legacy = await importLegacyWorkspace();
          if (legacy.length && !cancelled) {
            firstRun = false;
            editor.loadDocuments(legacy);
            toast(t('toast.legacyImported', { count: legacy.length }));
          }
        }
      } catch {
        /* first run or storage unavailable: start fresh */
      }
      if (cancelled) return;
      if (firstRun) showEmptyHome(editor);
      refreshTrash(storage);
      setReady(true);
      // A link from the site with a drawing to open (?open=…): straight into the editor with it. After
      // ready, so that autosave keeps it; on a first run, the blank starter file makes way for it, as for
      // any file opened from the home screen.
      if (await openFromUrl(editor)) leaveHome(editor);
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, storage]);
  return ready;
}

export function App({ editor, storage }: { editor: Editor; storage: StorageAdapter }) {
  useT();
  const actions = useMemo(() => createActions(editor), [editor]);
  const ready = useRestore(editor, storage);
  const { uiHidden, sheet, panelWidths, home } = uiStore.use((s) => s);
  // A file with no board: no size, coordinates or preview to show.
  const noBoard = useSyncExternalStore(editor.subscribe, () => !isBoard(editor.getState().doc));
  useKeyboardShortcuts(editor, actions);
  // The first time the editor itself shows (not the home screen), a few tips.
  useEffect(() => {
    if (ready && !home) startTourOnce();
  }, [ready, home]);
  useNotices(editor);
  useAutosave(editor, storage, ready);

  const style = {
    '--left-width': `${panelWidths.left}px`,
    '--right-width': `${panelWidths.right}px`,
  } as CSSProperties;
  // Rulers run along the workspace's top and left edges: the panels make room for them.
  const rulers = useSyncExternalStore(editor.subscribe, () => editor.getState().view.rulers);
  const classes = ['app', uiHidden && 'ui-hidden', sheet && `sheet-${sheet}`, rulers && 'has-rulers']
    .filter(Boolean)
    .join(' ');

  return (
    <EditorContext.Provider value={editor}>
      <StorageContext.Provider value={storage}>
        <ActionsContext.Provider value={actions}>
          <div className={classes} style={style}>
            <MenuBar />
            <LeftPanel />
            <main className="workspace">
              <CanvasView />
              <PanelResizer side="left" />
              <PanelResizer side="right" />
              <MobileBar />
              <MobileColors />
              {!noBoard && <Coordinates />}
              {/* The window's bottom right corner: the version, which opens what's new, and the Help menu. */}
              <div className="help-corner">
                <button
                  type="button"
                  className="app-version"
                  data-tip={t('menu.version', { version: __APP_VERSION__ })}
                  onClick={() => window.open(CHANGELOG_URL, '_blank', 'noopener')}
                >
                  v{__APP_VERSION__}
                </button>
                <IconButton
                  className="icon-btn large help-button"
                  icon="help"
                  iconSize={18}
                  label={t('menu.help')}
                  onClick={(e) => openMenu(e.currentTarget, helpMenu(editor, actions))}
                />
              </div>
              {!noBoard && <FloatingPreview />}
              <ToolOptionsBar />
              <Toolbar />
            </main>
            <RightPanel />
          </div>
          {home && <HomeScreen />}
          <ColorPicker />
          <ColorAdjustPanel />
          <MenuHost />
          <CommandPalette />
          <Tour />
          <Dialogs />
          <Tooltips />
          <Toasts />
        </ActionsContext.Provider>
      </StorageContext.Provider>
    </EditorContext.Provider>
  );
}

export { editorLabels };
