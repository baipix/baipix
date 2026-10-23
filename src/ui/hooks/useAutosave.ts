import { useEffect } from 'react';
import type { Editor } from '../../engine/editor';
import { getLocale, t } from '../../i18n';
import type { StorageAdapter } from '../../storage/workspace';
import { refreshTrash } from '../StorageContext';
import { toast, uiStore } from '../uiStore';

/** Saves the workspace (debounced) whenever the document, preferences or UI settings change. */
export function useAutosave(editor: Editor, storage: StorageAdapter, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let timer = 0;
    let warned = false;
    const save = () => {
      const s = editor.getState();
      const ui = uiStore.get();
      // New files left untouched aren't kept (unless there's nothing else).
      const all = editor.getDocuments();
      const kept = all.filter((d) => !editor.isFresh(d.id));
      const documents = kept.length ? kept : all;
      // The active board, to open again on it.
      const activeId = documents.some((d) => d.id === s.doc.id)
        ? s.doc.id
        : [...documents].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0].id;
      storage
        .save({
          documents,
          activeId,
          preferences: editor.getPreferences(),
          ui: {
            panelWidths: ui.panelWidths,
            layersFolded: ui.layersFolded,
            exportFormat: ui.exportFormat,
            exportCode: ui.exportCode,
            exportActiveLayer: ui.exportActiveLayer,
            collapsed: ui.collapsed,
            exportBackground: ui.exportBackground,
            hiddenPalettes: ui.hiddenPalettes,
            preview: ui.preview,
            locale: getLocale(),
          },
        })
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
      const kept = new Set(
        editor
          .getDocuments()
          .filter((d) => !editor.isFresh(d.id))
          .map((d) => d.id),
      );
      storage.saveHistory(editor.histories().filter((h) => kept.has(h.id))).catch(() => {
        /* the drawing is saved anyway; only the undo steps would be lost */
      });
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(save, 600);
      clearTimeout(historyTimer);
      historyTimer = window.setTimeout(saveHistory, 2000);
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
    const offs = [editor.onPersist(schedule), editor.subscribe(schedule), uiStore.subscribe(schedule)];
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
  }, [editor, storage, ready]);
}
