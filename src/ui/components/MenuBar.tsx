import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fileNameOf, isBoard } from '../../engine/document';
import { useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { MENU_BAR, filesMenu, mainMenu, zoomMenu } from '../menus';
import { DisplayOptions } from '../panels/RightPanel';
import { openDialog, uiStore } from '../uiStore';
import { viewport } from '../viewport';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { menuAnchor, openMenu } from './Menu';

/** The file's name, renamed in place, with the files menu and the canvas size beside it. */
function FileTitle() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const doc = useEditorState((s) => s.doc);
  // The file's name (the name of its only board, or of the file holding several). Renames mutate
  // the document in place, so select the name itself to re-render on change.
  const docName = useEditorState((s) => fileNameOf(s.doc));
  const fileId = useEditorState((s) => s.activeId);
  // Resizes change the document in place: select the numbers to follow them.
  const width = useEditorState((s) => s.doc.width);
  const height = useEditorState((s) => s.doc.height);
  const noBoard = useEditorState((s) => !isBoard(s.doc));
  const [name, setName] = useState(docName);
  useEffect(() => setName(docName), [docName, doc.id]);
  return (
    <div className="menubar-file">
      <input
        value={name}
        aria-label={t('file.name')}
        spellCheck={false}
        size={Math.max(4, name.length)}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => {
          // Back to the start of a long name, which stays scrolled to its end after typing.
          e.currentTarget.scrollLeft = 0;
          if (name.trim()) editor.renameFile(fileId, name);
          else setName(docName);
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
      />
      <IconButton
        icon="caret"
        className="icon-btn files-button"
        label={t('file.recent')}
        aria-haspopup="menu"
        onClick={(e) => openMenu(e.currentTarget, filesMenu(editor, actions))}
      />
      {!noBoard && <span className="muted">{t('file.size', { w: width, h: height })}</span>}
    </div>
  );
}

/**
 * The display options (grid, tile preview, symmetry, rulers, isometric grid) in a popover under
 * their button, like Figma's view settings. Closes on a click elsewhere or Escape.
 */
function DisplayButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!pop.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const r = open ? button.current?.getBoundingClientRect() : null;
  return (
    <>
      <IconButton
        icon="grid"
        label={t('section.display')}
        pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          button.current = e.currentTarget;
          setOpen((o) => !o);
        }}
      />
      {open && r && (
        <div
          ref={pop}
          className="popover display-popover"
          role="dialog"
          aria-label={t('section.display')}
          style={{ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right - 8) }}
        >
          <div className="popover-header">{t('section.display')}</div>
          <div className="popover-body">
            <DisplayOptions />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The app's menu bar, across the top on larger screens: Fichier, Édition, Image… with the file
 * name in the middle and the zoom on the right. On narrow windows the menus fold into ☰.
 */
export function MenuBar() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const zoom = useSyncExternalStore(viewport.subscribe, () => viewport.pixelZoom);
  const board = useEditorState((s) => isBoard(s.doc));
  const titles = useRef<(HTMLButtonElement | null)[]>([]);

  const open = (i: number) => {
    const n = MENU_BAR.length;
    const button = titles.current[i];
    if (!button) return;
    openMenu(button, MENU_BAR[i].items(editor, actions), {
      onSwitch: (d) => {
        const next = (i + d + n) % n;
        titles.current[next]?.focus();
        open(next);
      },
    });
  };
  // Once a menu is open, moving over another title opens that one.
  const hoveredAt = useRef(0);
  const hover = (i: number) => {
    const anchor = menuAnchor();
    if (anchor && anchor !== titles.current[i] && titles.current.includes(anchor as HTMLButtonElement)) {
      hoveredAt.current = Date.now();
      open(i);
    }
  };
  // A click right after the hover opened the menu (a tap, a quick move) keeps it open.
  const click = (i: number) => {
    if (menuAnchor() === titles.current[i] && Date.now() - hoveredAt.current < 400) return;
    open(i);
  };

  return (
    <header className="menubar">
      <div className="menubar-start">
        <button
          type="button"
          className="menubar-logo"
          aria-label={t('file.allFiles')}
          data-tip={t('file.allFiles')}
          onClick={() => uiStore.set({ home: true })}
        >
          <Icon name="logo" size={16} />
        </button>
        <IconButton
          icon="menu"
          className="icon-btn menubar-burger"
          label={t('menu.main')}
          aria-haspopup="menu"
          onClick={(e) => openMenu(e.currentTarget, mainMenu(editor, actions))}
        />
        <nav className="menubar-menus" role="menubar" aria-label={t('menu.main')}>
          {MENU_BAR.map((m, i) => (
            <button
              key={m.id}
              ref={(el) => {
                titles.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className="menubar-title"
              aria-haspopup="menu"
              aria-expanded="false"
              onClick={() => click(i)}
              onPointerEnter={() => hover(i)}
            >
              {t(`menu.${m.id}`)}
            </button>
          ))}
        </nav>
      </div>
      <FileTitle />
      <div className="menubar-end">
        <DisplayButton />
        <button
          type="button"
          className="zoom-button"
          aria-haspopup="menu"
          onClick={(e) => openMenu(e.currentTarget, zoomMenu(editor))}
          onDoubleClick={() => viewport.fit(editor.getState().doc)}
        >
          {Math.round(zoom * 100)} %<span className="caret">▾</span>
        </button>
        <IconButton
          icon="search"
          className="icon-btn"
          label={t('menu.commandPalette')}
          shortcut="Ctrl+K"
          onClick={() => uiStore.set({ commandPalette: true })}
        />
        {/* The drawing as code (React, SVG, CSS…), next to the export: for developers. */}
        {board && (
          <IconButton
            icon="code"
            className="icon-btn"
            label={t('menu.code')}
            onClick={() => openDialog({ type: 'code' })}
          />
        )}
        {board && (
          <button
            type="button"
            className="btn btn-primary menubar-export"
            onClick={() => openDialog({ type: 'export' })}
          >
            <Icon name="download" size={16} />
            <span>{t('panel.export')}</span>
          </button>
        )}
      </div>
    </header>
  );
}
