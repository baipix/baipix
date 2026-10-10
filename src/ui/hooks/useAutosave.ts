import { useEffect } from 'react';
import type { Editor } from '../../engine/editor';
import { getLocale, t } from '../../i18n';
import type { StorageAdapter } from '../../storage/workspace';
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
      const activeId = documents.some((d) => d.id === s.activeId)
        ? s.activeId
        : [...documents].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0].id;
      storage
        .save({
          documents,
          activeId,
          preferences: editor.getPreferences(),
          ui: {
            panelWidths: ui.panelWidths,
            exportFormat: ui.exportFormat,
            exportActiveLayer: ui.exportActiveLayer,
            collapsed: ui.collapsed,
            exportBackground: ui.exportBackground,
            hiddenPalettes: ui.hiddenPalettes,
            preview: ui.preview,
            locale: getLocale(),
          },
        })
        .catch(() => {
          if (!warned) toast(t('toast.saveFailed'));
          warned = true;
        });
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(save, 600);
    };
    const offs = [editor.onPersist(schedule), editor.subscribe(schedule), uiStore.subscribe(schedule)];
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(timer);
      offs.forEach((off) => off());
      window.removeEventListener('pagehide', save);
    };
  }, [editor, storage, ready]);
}
