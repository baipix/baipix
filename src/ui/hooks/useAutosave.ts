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

/**
 * Returns documents that are no longer untouched fresh files.
 */
function getNonFreshDocuments(editor: Editor, documents: EditorDocument[] = editor.getDocuments()) {
  return documents.filter((document) => !editor.isFresh(document.id));
}

/**
 * Selects the UI settings that belong in the persisted workspace metadata.
 */
function getWorkspaceUiSettings(uiState: UiState) {
  return {
    panelWidths: uiState.panelWidths,
    layersFolded: uiState.layersFolded,
    timeline: uiState.timeline,
    onion: uiState.onion,
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

/**
 * Builds the workspace payload from the latest editor and UI state.
 */
function createWorkspaceSnapshot(editor: Editor, uiState: UiState) {
  const editorState = editor.getState();

  // New files left untouched aren't kept (unless there's nothing else).
  const allDocuments = editor.getDocuments();
  const nonFreshDocuments = getNonFreshDocuments(editor, allDocuments);
  const documents = nonFreshDocuments.length ? nonFreshDocuments : allDocuments;

  // The active board, to open again on it.
  const activeId = documents.some((document) => document.id === editorState.doc.id)
    ? editorState.doc.id
    : [...documents].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0].id;

  return {
    documents,
    activeId,
    preferences: editor.getPreferences(),
    ui: getWorkspaceUiSettings(uiState),
  };
}

/**
 * Keeps undo histories only for documents that will remain persisted.
 */
function getHistoriesToSave(editor: Editor) {
  const keptDocumentIds = new Set(getNonFreshDocuments(editor).map((document) => document.id));
  return editor.histories().filter((history) => keptDocumentIds.has(history.id));
}

/**
 * Installs autosave timers and browser subscriptions, and returns their cleanup.
 */
function setupAutosave(editor: Editor, storage: StorageAdapter): () => void {
  // Workspace and history persistence.
  let workspaceSaveTimer = 0;
  let hasShownSaveFailureToast = false;

  const saveWorkspace = () => {
    storage
      .save(createWorkspaceSnapshot(editor, uiStore.get()))
      .then(() => refreshTrash(storage))
      .catch(() => {
        if (!hasShownSaveFailureToast) {
          toast(t('toast.saveFailed'));
        }

        hasShownSaveFailureToast = true;
      });
  };

  // The undo history, apart and less often: it's bigger, and only matters after a reload.
  let historySaveTimer = 0;

  const saveHistory = () => {
    clearTimeout(historySaveTimer);

    if (!storage.saveHistory) {
      return;
    }

    storage.saveHistory(getHistoriesToSave(editor)).catch(() => {
      /* the drawing is saved anyway; only the undo steps would be lost */
    });
  };

  // Coalesce frequent workspace changes into one delayed save.
  const scheduleWorkspaceSave = () => {
    clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = window.setTimeout(saveWorkspace, AUTOSAVE_DEBOUNCE_MS);
  };

  // History is larger and changes less often, so it uses a separate delay.
  const scheduleHistorySave = () => {
    clearTimeout(historySaveTimer);
    historySaveTimer = window.setTimeout(saveHistory, HISTORY_SAVE_DEBOUNCE_MS);
  };

  // Every observed change postpones both independent persistence operations.
  const scheduleSaves = () => {
    scheduleWorkspaceSave();
    scheduleHistorySave();
  };

  // Flush both saves immediately instead of waiting for their debounce timers.
  const saveBeforePageHide = () => {
    saveWorkspace();
    saveHistory();
  };

  // When this tab becomes active, adopt documents changed by another tab.
  const syncDocumentsFromOtherTabs = () => {
    if (document.visibilityState === 'hidden' || !storage.changedElsewhere) {
      return;
    }

    storage
      .changedElsewhere()
      .then((docs) => {
        if (docs.length) {
          editor.adoptDocuments(docs);
        }
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

/**
 * Saves the workspace (debounced) whenever the document, preferences or UI settings change.
 */
export function useAutosave(editor: Editor, storage: StorageAdapter, ready: boolean) {
  useEffect(() => {
    if (!ready) {
      return;
    }

    return setupAutosave(editor, storage);
  }, [editor, storage, ready]);
}
