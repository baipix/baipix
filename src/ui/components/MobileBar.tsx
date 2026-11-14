import { fileNameOf } from '../../engine/document';
import { useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { filesMenu, mainMenu } from '../menus';
import { openDialog, uiStore } from '../uiStore';
import { IconButton } from './IconButton';
import { openMenu } from './Menu';

/** Compact top bar shown on small screens; panels become bottom sheets. */
export function MobileBar() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const name = useEditorState((s) => s.doc.name);
  const fileName = useEditorState((s) => fileNameOf(s.doc));
  const fileId = useEditorState((s) => s.activeId);
  const sheet = uiStore.use((s) => s.sheet);
  const renaming = uiStore.use((s) => s.renamingFile);
  const toggle = (which: 'left' | 'right') =>
    uiStore.set((s) => ({ sheet: s.sheet === which ? null : which }));
  return (
    <div className="mobile-bar">
      <IconButton
        className="icon-btn large"
        icon="menu"
        iconSize={24}
        label={t('menu.main')}
        onClick={(e) => openMenu(e.currentTarget, mainMenu(editor, actions))}
      />
      {/* The file name opens the files menu, like the ▾ next to it on larger screens. Rename, in
          that menu or in File, turns it into a field. */}
      {renaming ? (
        <input
          className="mobile-name is-editing"
          defaultValue={fileName}
          aria-label={t('file.name')}
          spellCheck={false}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            const value = e.currentTarget.value.trim();
            if (value) editor.renameFile(fileId, value);
            uiStore.set({ renamingFile: false });
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            // Escape leaves the name as it was.
            if (e.key === 'Escape') e.currentTarget.value = '';
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      ) : (
        <button
          type="button"
          className="mobile-name"
          aria-haspopup="menu"
          onClick={(e) => openMenu(e.currentTarget, filesMenu(editor, actions))}
        >
          {name} ▾
        </button>
      )}
      <IconButton
        className="icon-btn large"
        icon="layers"
        iconSize={24}
        label={t('panel.left')}
        pressed={sheet === 'left'}
        onClick={() => toggle('left')}
      />
      <IconButton
        className="icon-btn large"
        icon="panel"
        iconSize={24}
        label={t('panel.right')}
        pressed={sheet === 'right'}
        onClick={() => toggle('right')}
      />
      <button type="button" className="btn btn-primary" onClick={() => openDialog({ type: 'export' })}>
        {t('export.button')}
      </button>
    </div>
  );
}
