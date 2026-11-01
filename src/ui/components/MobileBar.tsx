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
  const sheet = uiStore.use((s) => s.sheet);
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
      {/* The file name opens the files menu, like the ▾ next to it on larger screens. */}
      <button
        type="button"
        className="mobile-name"
        aria-haspopup="menu"
        onClick={(e) => openMenu(e.currentTarget, filesMenu(editor, actions))}
      >
        {name} ▾
      </button>
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
