import { useEffect } from 'react';
import type { Editor } from '../../engine/editor';
import { getLocale, getLocalePreference, subscribeLocale, t } from '../../i18n';
import type { StorageAdapter } from '../../storage/workspace';
import { refreshTrash } from '../StorageContext';
import { toast, uiStore } from '../uiStore';

const AUTOSAVE_DEBOUNCE_MS = 600;
const HISTORY_SAVE_DEBOUNCE_MS = 2000;

type EditorDocument = ReturnType<Editor['getDocuments']>[number];
type UiState = ReturnType<typeof uiStore.get>;

function getNonFreshDocuments(editor: Editor, documents: EditorDocument[] = editor.getDocuments()) {
  return documents.filter((document) => !editor.isFresh(document.id));
}

function getDocumentsToSave(editor: Editor): EditorDocument[] {
  const documents = editor.getDocuments();
  const nonFreshDocuments = getNonFreshDocuments(editor, documents);
  return nonFreshDocuments.length ? nonFreshDocuments : documents;
}

function getActiveDocumentId(activeDocumentId: EditorDocument['id'], documents: EditorDocument[]) {
  if (documents.some((document) => document.id === activeDocumentId)) return activeDocumentId;

  return [...documents].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0].id;
}

function getWorkspaceUiSettings(uiState: UiState) {
  return {
    panelWidths: uiState.panelWidths,
    layersFolded: uiState.layersFolded,
    homeSort: uiState.homeSort,
    homeOrder: uiState.homeOrder,
    homeView: uiState.homeView,
    home: uiState.home,
    exportFormat: uiState.exportFormat,
    exportCode: uiState.exportCode,
    exportActiveLayer: uiState.exportActiveLayer,
    exportTileWidth: uiState.exportTileWidth,
    exportTileHeight: uiState.exportTileHeight,
    exportTileDrop: uiState.exportTileDrop,
    exportSheetColumns: uiState.exportSheetColumns,
    collapsed: uiState.collapsed,
    exportBackground: uiState.exportBackground,
    hiddenPalettes: uiState.hiddenPalettes,
    preview: uiState.preview,
    locale: getLocale(),
    localePreference: getLocalePreference(),
  };
}

function createWorkspaceSnapshot(editor: Editor, uiState: UiState) {
  const editorState = editor.getState();
  const documents = getDocumentsToSave(editor);

  return {
    documents,
    activeId: getActiveDocumentId(editorState.doc.id, documents),
    preferences: editor.getPreferences(),
    ui: getWorkspaceUiSettings(uiState),
  };
}

function getHistoriesToSave(editor: Editor) {
  const kept = new Set(getNonFreshDocuments(editor).map((document) => document.id));
  return editor.histories().filter((history) => kept.has(history.id));
}

function setupAutosave(editor: Editor, storage: StorageAdapter): () => void {
  let timer = 0;
  let warned = false;
  const save = () => {
    storage
      .save(createWorkspaceSnapshot(editor, uiStore.get()))
      .then(() => refreshTrash(storage))
      .catch(() => {
        if (!warned) toast(t('toast.saveFailed'));
        warned = true;
      });
  };
  // The undo history, apart and less often: it's bigger, and only matters after a reload.
  let historyTimer = 0;
  const saveHistory = () => {
    clearTimeout(historyTimer);
    if (!storage.saveHistory) return;
    storage.saveHistory(getHistoriesToSave(editor)).catch(() => {
      /* the drawing is saved anyway; only the undo steps would be lost */
    });
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
    clearTimeout(historyTimer);
    historyTimer = window.setTimeout(saveHistory, HISTORY_SAVE_DEBOUNCE_MS);
  };
  const leave = () => {
    save();
    saveHistory();
  };
  // Back on this tab: what another tab of Baipix drew or added meanwhile shows here too.
  const sync = () => {
    if (document.visibilityState === 'hidden' || !storage.changedElsewhere) return;
    storage
      .changedElsewhere()
      .then((docs) => docs.length && editor.adoptDocuments(docs))
      .catch(() => {
        /* storage unavailable: nothing to take in */
      });
  };
  const offs = [
    editor.onPersist(schedule),
    editor.subscribe(schedule),
    uiStore.subscribe(schedule),
    subscribeLocale(schedule),
  ];

  schedule();

  window.addEventListener('pagehide', leave);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);

  return () => {
    clearTimeout(timer);
    clearTimeout(historyTimer);
    offs.forEach((off) => off());
    window.removeEventListener('pagehide', leave);
    window.removeEventListener('focus', sync);
    document.removeEventListener('visibilitychange', sync);
  };
}

/** Saves the workspace (debounced) whenever the document, preferences or UI settings change. */
export function useAutosave(editor: Editor, storage: StorageAdapter, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    return setupAutosave(editor, storage);
  }, [editor, storage, ready]);
}
