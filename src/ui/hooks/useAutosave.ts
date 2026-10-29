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
  const keptDocumentIds = new Set(getNonFreshDocuments(editor).map((document) => document.id));
  return editor.histories().filter((history) => keptDocumentIds.has(history.id));
}

function setupAutosave(editor: Editor, storage: StorageAdapter): () => void {
  // Workspace and history persistence.
  let workspaceSaveTimer = 0;
  let hasShownSaveFailureToast = false;
  const saveWorkspace = () => {
    storage
      .save(createWorkspaceSnapshot(editor, uiStore.get()))
      .then(() => refreshTrash(storage))
      .catch(() => {
        if (!hasShownSaveFailureToast) toast(t('toast.saveFailed'));
        hasShownSaveFailureToast = true;
      });
  };
  let historySaveTimer = 0;
  const saveHistory = () => {
    clearTimeout(historySaveTimer);
    if (!storage.saveHistory) return;
    storage.saveHistory(getHistoriesToSave(editor)).catch(() => {
      /* the drawing is saved anyway; only the undo steps would be lost */
    });
  };

  // Debouncing and browser lifecycle events.
  const scheduleSaves = () => {
    clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = window.setTimeout(saveWorkspace, AUTOSAVE_DEBOUNCE_MS);
    clearTimeout(historySaveTimer);
    historySaveTimer = window.setTimeout(saveHistory, HISTORY_SAVE_DEBOUNCE_MS);
  };
  const saveBeforePageHide = () => {
    saveWorkspace();
    saveHistory();
  };
  // Back on this tab: what another tab of Baipix drew or added meanwhile shows here too.
  const syncDocumentsFromOtherTabs = () => {
    if (document.visibilityState === 'hidden' || !storage.changedElsewhere) return;
    storage
      .changedElsewhere()
      .then((docs) => {
        if (docs.length) editor.adoptDocuments(docs);
      })
      .catch(() => {
        /* storage unavailable: nothing to take in */
      });
  };

  // Subscriptions and cleanup.
  const unsubscribe = [
    editor.onPersist(scheduleSaves),
    editor.subscribe(scheduleSaves),
    uiStore.subscribe(scheduleSaves),
    subscribeLocale(scheduleSaves),
  ];

  scheduleSaves();

  window.addEventListener('pagehide', saveBeforePageHide);
  window.addEventListener('focus', syncDocumentsFromOtherTabs);
  document.addEventListener('visibilitychange', syncDocumentsFromOtherTabs);

  return () => {
    clearTimeout(workspaceSaveTimer);
    clearTimeout(historySaveTimer);
    unsubscribe.forEach((removeSubscription) => removeSubscription());
    window.removeEventListener('pagehide', saveBeforePageHide);
    window.removeEventListener('focus', syncDocumentsFromOtherTabs);
    document.removeEventListener('visibilitychange', syncDocumentsFromOtherTabs);
  };
}

/** Saves the workspace (debounced) whenever the document, preferences or UI settings change. */
export function useAutosave(editor: Editor, storage: StorageAdapter, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    return setupAutosave(editor, storage);
  }, [editor, storage, ready]);
}
