import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { fileIdOf } from '../../engine/document';
import { flatten, flattenFrame } from '../../engine/composite';
import { frameCount } from '../../engine/frames';
import type { PixelDoc } from '../../engine/document';
import { getLocale, LOCALES, setLocale, useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { EditableName } from '../components/EditableName';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { PresetCard } from '../components/PresetCard';
import { openMenu } from '../components/Menu';
import { Checkbox } from '../components/Checkbox';
import { isUntouchedStarter, leaveHome } from '../home';
import { fileMenu, newIssueUrl } from '../menus';
import { createFromTemplate, TEMPLATES } from '../templates';
import { CHANGELOG_URL, DOCS_URL } from '../links';
import { PALETTE_PRESETS } from '../../engine/palette';
import { openDialog, toast, uiStore } from '../uiStore';
import { refreshTrash, trashStore, useStorage } from '../StorageContext';
import { FILE_MIME } from '../dragTypes';

const DAY = 86_400_000;

const LONG_PRESS_DELAY_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

/** "Just now", "5 minutes ago", "yesterday"… then a plain date after a week. */
function formatUpdated(time: number, justNow: string): string {
  const locale = getLocale();
  const diff = Date.now() - time;
  if (diff < 60_000) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 3_600_000) return rtf.format(-Math.floor(diff / 60_000), 'minute');
  if (diff < DAY) return rtf.format(-Math.floor(diff / 3_600_000), 'hour');
  if (diff < 7 * DAY) return rtf.format(-Math.floor(diff / DAY), 'day');
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(!sameYear && { year: 'numeric' }),
  });
}

/** The drawing at a whole scale, about 320 px on its long side; CSS crops it to the card. */
function HomeThumb({ doc }: { doc: PixelDoc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const k = Math.max(1, Math.floor(320 / Math.max(doc.width, doc.height)));
    const src = document.createElement('canvas');
    src.width = doc.width;
    src.height = doc.height;
    const sctx = src.getContext('2d')!;
    const image = sctx.createImageData(doc.width, doc.height);
    canvas.width = doc.width * k;
    canvas.height = doc.height * k;
    const ctx = canvas.getContext('2d')!;
    const draw = (pixels: Uint32Array) => {
      new Uint32Array(image.data.buffer).set(pixels);
      sctx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    };
    draw(flatten(doc));

    // An animation plays in its card while the pointer is on it, each frame for its own duration.
    const card = canvas.closest('.home-card, tr');
    const count = frameCount(doc);
    if (!card || count < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frames: Uint32Array[] | null = null;
    let timer = 0;
    const play = (f: number) => {
      frames ??= Array.from({ length: count }, (_, i) => flattenFrame(doc, i));
      draw(frames[f]);
      timer = window.setTimeout(() => play((f + 1) % count), doc.frames?.[f]?.duration ?? 100);
    };
    const start = () => {
      clearTimeout(timer);
      play(0);
    };
    const stop = () => {
      clearTimeout(timer);
      draw(flatten(doc));
    };
    card.addEventListener('pointerenter', start);
    card.addEventListener('pointerleave', stop);
    return () => {
      clearTimeout(timer);
      card.removeEventListener('pointerenter', start);
      card.removeEventListener('pointerleave', stop);
    };
  }, [doc, doc.updatedAt]);
  return <canvas ref={ref} className="home-thumb" aria-hidden="true" />;
}

/**
 * What follows the pointer while a drawing is dragged: its thumbnail, small. The whole card would
 * hide the Trash it's headed to.
 */
function dragPreview(source: HTMLElement): HTMLElement | null {
  const thumb = source.querySelector<HTMLCanvasElement>('canvas.home-thumb');
  if (!thumb) return null;
  const copy = document.createElement('canvas');
  copy.width = thumb.width;
  copy.height = thumb.height;
  copy.getContext('2d')?.drawImage(thumb, 0, 0);
  const preview = document.createElement('div');
  preview.className = 'home-drag-preview';
  preview.append(copy);
  document.body.append(preview);
  // The browser takes its picture of it as the drag starts; after that it can go.
  setTimeout(() => preview.remove());
  return preview;
}

export function HomeScreen() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const storage = useStorage();
  const files = useEditorState((s) => s.files);
  const deleted = trashStore.use((s) => s.files);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const selectionAnchor = useRef<string | null>(null);

  const mobileLongPressTimer = useRef<number | null>(null);
  const mobileLongPressStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreMobileLongPressClick = useRef<string | null>(null);

  const [trashActionBusy, setTrashActionBusy] = useState(false);
  const trashActionBusyRef = useRef(false);
  const restore = async (id: string, name: string) => {
    const boards = (await storage.restoreTrashed?.(id)) ?? [];
    if (!boards.length) return;
    editor.adoptDocuments(boards);
    refreshTrash(storage);
    setSelectedIds((ids) => ids.filter((selected) => selected !== id));
    toast(t('toast.fileRestored', { name }));
  };
  const [dropping, setDropping] = useState(false);
  // A drawing dragged to the Trash: its card fades, and the Trash lights up while it's over it.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  // While its name is typed in, a card stays put: a drag in the field selects the text.
  const [typingId, setTypingId] = useState<string | null>(null);
  const dragFile = (id: string) => ({
    draggable: typingId !== id,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData(FILE_MIME, id);
      e.dataTransfer.effectAllowed = 'move';
      const preview = dragPreview(e.currentTarget);
      if (preview) e.dataTransfer.setDragImage(preview, 16, 16);
      setDraggedId(id);
    },
    onDragEnd: () => setDraggedId(null),
  });
  const docs = editor.getDocuments();
  // A file with a board of several frames is an animation: its card says so.
  const animated = (id: string) => docs.some((d) => fileIdOf(d) === id && frameCount(d) > 1);
  const sort = uiStore.use((s) => s.homeSort);
  const order = uiStore.use((s) => s.homeOrder);
  const view = uiStore.use((s) => s.homeView);
  // Neither the blank starter nor a new file left untouched: they'd be empty cards.
  const shown = files
    .filter((f) => !isUntouchedStarter(f) && !editor.isFresh(f.id))
    .sort((a, b) => {
      const by = sort === 'name' ? a.name.localeCompare(b.name) : a.updatedAt - b.updatedAt;
      return order === 'asc' ? by : -by;
    });

  const sectionItems = showDeleted ? deleted : shown;
  const sectionIds = sectionItems.map((f) => f.id);
  const sectionKey = sectionIds.join('|');

  useEffect(() => {
    const validIds = new Set(sectionKey ? sectionKey.split('|') : []);

    setSelectedIds((ids) => {
      const stillValid = ids.filter((id) => validIds.has(id));
      const nothingRemoved = stillValid.length === ids.length;

      return nothingRemoved ? ids : stillValid;
    });
  }, [sectionKey]);

  const selectFile = (id: string, checked: boolean) => {
    selectionAnchor.current = id;

    setSelectedIds((ids) => {
      if (!checked) {
        return ids.filter((selected) => selected !== id);
      }

      const alreadySelected = ids.includes(id);

      return alreadySelected ? ids : [...ids, id];
    });
  };

  const toggleFileSelection = (id: string) => {
    selectionAnchor.current = id;

    setSelectedIds((ids) => {
      if (ids.includes(id)) {
        return ids.filter((selected) => selected !== id);
      }

      return [...ids, id];
    });
  };

  const selectRange = (id: string) => {
    const targetIndex = sectionIds.indexOf(id);

    if (targetIndex === -1) {
      return;
    }

    const anchorIndex = sectionIds.indexOf(selectionAnchor.current ?? id);
    const hasAnchor = anchorIndex !== -1;

    const start = hasAnchor ? Math.min(anchorIndex, targetIndex) : targetIndex;
    const end = hasAnchor ? Math.max(anchorIndex, targetIndex) : targetIndex;
    const range = sectionIds.slice(start, end + 1);

    setSelectedIds((ids) => {
      const merged = new Set([...ids, ...range]);
      return [...merged];
    });
  };

  const selectAll = () => setSelectedIds(sectionIds);

  const cancelMobileLongPress = () => {
    if (mobileLongPressTimer.current !== null) {
      window.clearTimeout(mobileLongPressTimer.current);
      mobileLongPressTimer.current = null;
    }

    mobileLongPressStart.current = null;
  };

  const startMobileLongPress = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    const isTouch = e.pointerType === 'touch';
    const isMobileViewport = window.matchMedia('(max-width: 820px)').matches;

    if (!isTouch || !isMobileViewport || mobileSelectionMode) {
      return;
    }

    if ((e.target as Element).closest('input, button, a, .checkbox')) {
      return;
    }

    cancelMobileLongPress();
    ignoreMobileLongPressClick.current = null;
    mobileLongPressStart.current = { x: e.clientX, y: e.clientY };

    mobileLongPressTimer.current = window.setTimeout(() => {
      mobileLongPressTimer.current = null;
      mobileLongPressStart.current = null;
      ignoreMobileLongPressClick.current = id;

      selectionAnchor.current = id;
      setMobileSelectionMode(true);
      setSelectedIds([id]);
    }, LONG_PRESS_DELAY_MS);
  };

  const moveMobileLongPress = (e: ReactPointerEvent<HTMLElement>) => {
    const start = mobileLongPressStart.current;

    if (!start) {
      return;
    }

    const movedX = Math.abs(e.clientX - start.x);
    const movedY = Math.abs(e.clientY - start.y);
    const movedTooFar = movedX > LONG_PRESS_MOVE_TOLERANCE_PX || movedY > LONG_PRESS_MOVE_TOLERANCE_PX;

    if (movedTooFar) {
      cancelMobileLongPress();
    }
  };

  const endMobileLongPress = () => {
    cancelMobileLongPress();

    const id = ignoreMobileLongPressClick.current;

    if (id === null) {
      return;
    }

    window.setTimeout(() => {
      if (ignoreMobileLongPressClick.current === id) {
        ignoreMobileLongPressClick.current = null;
      }
    }, 0);
  };

  const cancelMobilePointer = () => {
    cancelMobileLongPress();
    ignoreMobileLongPressClick.current = null;
  };

  const mobileSelectionPointerHandlers = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => startMobileLongPress(e, id),
    onPointerMove: moveMobileLongPress,
    onPointerUp: endMobileLongPress,
    onPointerCancel: cancelMobilePointer,
    onPointerLeave: cancelMobileLongPress,
  });

  const clearSelection = () => {
    cancelMobileLongPress();
    ignoreMobileLongPressClick.current = null;
    selectionAnchor.current = null;
    setMobileSelectionMode(false);
    setSelectedIds([]);
  };

  const startMobileSelection = () => {
    cancelMobileLongPress();
    ignoreMobileLongPressClick.current = null;
    selectionAnchor.current = null;
    setSelectedIds([]);
    setMobileSelectionMode(true);
  };

  const deleteSingle = (id: string, name: string) => {
    clearSelection();
    actions.deleteFile(id, name);
  };

  const restoreSelected = async (ids: string[]) => {
    if (trashActionBusyRef.current) {
      return;
    }

    trashActionBusyRef.current = true;
    setTrashActionBusy(true);

    try {
      const restoredBoards = (await storage.restoreTrashedFiles?.(ids)) ?? [];

      if (restoredBoards.length === 0) {
        return;
      }

      editor.adoptDocuments(restoredBoards);
      refreshTrash(storage);
      clearSelection();

      const fileIds = restoredBoards.map((board) => fileIdOf(board));
      const restoredFileCount = new Set(fileIds).size;

      toast(t('toast.filesRestored', { count: restoredFileCount }));
    } catch {
      toast(t('toast.trashOperationFailed'));
    } finally {
      trashActionBusyRef.current = false;
      setTrashActionBusy(false);
    }
  };

  const discardSelected = async (ids: string[]) => {
    const isBusy = trashActionBusyRef.current;

    if (!storage.discardTrashedFiles || isBusy) {
      return;
    }

    trashActionBusyRef.current = true;
    setTrashActionBusy(true);

    try {
      await storage.discardTrashedFiles(ids);
    } catch {
      toast(t('toast.trashOperationFailed'));
      return;
    } finally {
      trashActionBusyRef.current = false;
      setTrashActionBusy(false);
    }

    refreshTrash(storage);
    clearSelection();

    toast(t('toast.filesDeletedForGood', { count: ids.length }));
  };

  const confirmDiscard = (ids: string[], empty = false) => {
    const title = empty ? t('home.emptyTrash') : t('file.deleteForGood');

    const message = empty
      ? t('home.confirmEmptyTrash')
      : t('home.confirmDeleteSelectedForGood', { count: ids.length });

    return openDialog({
      type: 'confirm',
      title,
      message,
      confirmLabel: title,
      onConfirm: () => void discardSelected(ids),
    });
  };

  /** The name of a file's palette: a preset's, Custom, or the drawing's colors. */
  const paletteName = (doc: PixelDoc | undefined) => {
    const key = doc?.palette?.key;
    if (!key || key === 'drawing') return t('palette.drawing');
    return PALETTE_PRESETS[key]?.name ?? t('palette.custom');
  };
  const format = (f: { width: number; height: number; boards: number }) =>
    `${f.width} × ${f.height}${f.boards > 1 ? ` · ${t('home.boards', { count: f.boards })}` : ''}`;
  const bugMenu = (anchor: HTMLElement) =>
    openMenu(anchor, [
      { label: t('menu.reportBug'), onSelect: () => window.open(newIssueUrl('bug'), '_blank', 'noopener') },
      {
        label: t('menu.suggestIdea'),
        onSelect: () => window.open(newIssueUrl('idea'), '_blank', 'noopener'),
      },
    ]);
  const sortMenu = (anchor: HTMLElement) =>
    openMenu(anchor, [
      { label: t('home.sort'), disabled: true, onSelect: () => {} },
      {
        label: t('home.sortName'),
        checked: sort === 'name',
        onSelect: () => uiStore.set({ homeSort: 'name' }),
      },
      {
        label: t('home.sortModified'),
        checked: sort === 'modified',
        onSelect: () => uiStore.set({ homeSort: 'modified' }),
      },
      '-',
      { label: t('home.order'), disabled: true, onSelect: () => {} },
      {
        label: t('home.oldestFirst'),
        checked: order === 'asc',
        onSelect: () => uiStore.set({ homeOrder: 'asc' }),
      },
      {
        label: t('home.newestFirst'),
        checked: order === 'desc',
        onSelect: () => uiStore.set({ homeOrder: 'desc' }),
      },
    ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isEscape = e.key === 'Escape';
      const hasOpenDialog = document.querySelector('dialog[open]') !== null;

      if (!isEscape || hasOpenDialog) {
        return;
      }

      if (selectedIds.length > 0 || mobileSelectionMode) {
        selectionAnchor.current = null;
        setMobileSelectionMode(false);
        setSelectedIds([]);

        return;
      }

      leaveHome(editor);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [editor, selectedIds.length, mobileSelectionMode]);

  const open = (id: string) => {
    editor.switchFile(id);
    leaveHome(editor);
  };
  // A double click on a drawing's name renames it in place: a single click on the name opens the
  // drawing a moment later, unless a second click comes. The field being typed in opens nothing.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const openTimer = useRef(0);
  useEffect(() => () => clearTimeout(openTimer.current), []);

  const clickCard = (e: MouseEvent, id: string, openWhenUnselected = true) => {
    if (ignoreMobileLongPressClick.current === id) {
      ignoreMobileLongPressClick.current = null;
      return;
    }

    const target = e.target as Element;

    if (target.closest('input, button, a, .checkbox')) {
      return;
    }

    clearTimeout(openTimer.current);
    const hasSelection = selectedIds.length > 0 || mobileSelectionMode;

    if (e.shiftKey && hasSelection) {
      selectRange(id);
      return;
    }

    if (e.metaKey || e.ctrlKey || hasSelection) {
      toggleFileSelection(id);
      return;
    }

    if (!openWhenUnselected) {
      return;
    }

    const isNameClick = target.closest('.home-file-name') !== null;

    if (!isNameClick) {
      return open(id);
    }

    const isSingleClick = e.detail === 1;

    if (isSingleClick) {
      openTimer.current = window.setTimeout(() => open(id), 300);
    }
  };

  const fileName = (f: { id: string; name: string }, className = '') => (
    <EditableName
      className={`home-file-name truncate ${className}`}
      value={f.name}
      onRename={(name) => editor.renameFile(f.id, name)}
      startEditing={renamingId === f.id}
      onEditingStarted={() => setRenamingId(null)}
      onEditingChange={(editing) => setTypingId((id) => (editing ? f.id : id === f.id ? null : id))}
    />
  );

  const importFile = async (file?: File | null) => {
    if (await actions.openFile(file)) leaveHome(editor);
  };

  return (
    <div
      className={`home${dropping ? ' is-dropping' : ''}${mobileSelectionMode ? ' is-mobile-selecting' : ''}`}
      data-drop-label={t('home.drop')}
      onDragOver={(e) => {
        // Only files from outside open here: a drawing's own card is dragged to the Trash.
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      // Leaving the window or cancelling the drag fires on the card or menu under the pointer, not on
      // the screen itself: the label goes away unless the pointer moved to another part of the screen.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const file = e.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <header className="home-top">
        {/* The logo and the name: the pixel hops when they're hovered, not the whole bar. */}
        <span className="home-logo">
          <Icon name="logo" size={16} />
          <span className="home-brand">Baipix</span>
        </span>
        {/* With drawings, Import and Create up here on the logo's line; the welcome has its own. On a
            phone, Download all and Import keep only their icon, so Create fits in every language. */}
        {
          <div className="home-top-actions">
            {shown.length > 0 && (
              <button
                type="button"
                className="btn is-compact"
                aria-label={t('home.downloadAll')}
                data-tip={t('home.downloadAllTip')}
                onClick={() => void actions.downloadAllFiles(shown.map((f) => f.id))}
              >
                <Icon name="download" size={16} />
                <span className="btn-label">{t('home.downloadAll')}</span>
              </button>
            )}
            <button
              type="button"
              className="btn is-compact"
              aria-label={t('home.import')}
              onClick={() => void importFile()}
            >
              <Icon name="upload" size={16} />
              <span className="btn-label">{t('home.import')}</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openDialog({ type: 'newFile' })}>
              <Icon name="plus" size={16} />
              {t('common.create')}
            </button>
          </div>
        }
      </header>
      <div className="home-inner">
        {/* Under the welcome: where to learn more, and where to say something is wrong. */}
        {
          <div className="home-body">
            {/* A sidebar like a files app's: the sections, and at the bottom where to get help. */}
            <nav className="home-nav" aria-label={t('home.drawings')}>
              <button
                type="button"
                className={`home-nav-item${showDeleted ? '' : ' is-active'}`}
                onClick={() => {
                  setShowDeleted(false);
                  clearSelection();
                }}
              >
                <Icon name="image" size={16} />
                {t('home.drawings')}
              </button>
              <button
                type="button"
                className={`home-nav-item${showDeleted ? ' is-active' : ''}${overTrash ? ' drop-into' : ''}`}
                onClick={() => {
                  setShowDeleted(true);
                  clearSelection();
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(FILE_MIME)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setOverTrash(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverTrash(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverTrash(false);
                  const file = files.find((f) => f.id === e.dataTransfer.getData(FILE_MIME));
                  if (file) {
                    clearSelection();
                    actions.deleteFile(file.id, file.name);
                  }
                }}
              >
                <Icon name="trash" size={16} />
                {t('home.deleted')}
                {deleted.length > 0 && <span className="home-nav-count">{deleted.length}</span>}
              </button>
              <div className="home-nav-bottom">
                <a className="home-nav-link" href={DOCS_URL} target="_blank" rel="noopener">
                  <Icon name="docs" size={14} />
                  {t('home.docsTitle')}
                  <Icon name="external" size={12} />
                </a>
                <button
                  type="button"
                  className="home-nav-link"
                  aria-haspopup="menu"
                  onClick={(e) => bugMenu(e.currentTarget)}
                >
                  <Icon name="bug" size={14} />
                  {t('home.bugTitle')}
                  <Icon name="external" size={12} />
                </button>
                <a className="home-nav-link" href={CHANGELOG_URL} target="_blank" rel="noopener">
                  <Icon name="news" size={14} />
                  {t('home.newsTitle', { version: __APP_VERSION__ })}
                  <Icon name="external" size={12} />
                </a>
                <button
                  type="button"
                  className="home-nav-link"
                  aria-haspopup="menu"
                  aria-label={t('menu.language')}
                  onClick={(e) =>
                    openMenu(
                      e.currentTarget,
                      LOCALES.map((l) => ({
                        label: l.label,
                        checked: getLocale() === l.id,
                        onSelect: () => setLocale(l.id, 'manual'),
                      })),
                    )
                  }
                >
                  <Icon name="language" size={14} />
                  {LOCALES.find((l) => l.id === getLocale())?.label}
                  <Icon name="caret" size={12} />
                </button>
              </div>
            </nav>
            <main className="home-main">
              {/* A toolbar like a files app's: the section's title, how to sort and how to show. */}
              {(shown.length > 0 || showDeleted) && (
                <div className="home-toolbar">
                  <h2 className="home-toolbar-title home-toolbar-title-desktop">
                    {showDeleted ? t('home.deleted') : t('home.drawings')}
                  </h2>
                  <div className="home-toolbar-tools home-toolbar-tools-desktop">
                    {selectedIds.length > 0 ? (
                      <div
                        className="home-selection-toolbar"
                        role="group"
                        aria-label={t('home.selected', { count: selectedIds.length })}
                      >
                        <IconButton icon="close" label={t('home.clearSelection')} onClick={clearSelection} />

                        <span className="home-selection-count" aria-live="polite">
                          {t('home.selected', { count: selectedIds.length })}
                        </span>

                        <button
                          type="button"
                          className="btn is-compact"
                          disabled={selectedIds.length === sectionItems.length}
                          onClick={selectAll}
                        >
                          {t('home.selectAll')}
                        </button>

                        <span className="home-selection-separator" aria-hidden="true" />

                        {showDeleted ? (
                          <>
                            <button
                              type="button"
                              className="btn is-compact"
                              disabled={trashActionBusy}
                              onClick={() => void restoreSelected(selectedIds)}
                            >
                              <Icon name="undo" size={14} />
                              {t('file.restore')}
                            </button>

                            <button
                              type="button"
                              className="btn is-compact is-danger"
                              disabled={trashActionBusy}
                              onClick={() => confirmDiscard(selectedIds)}
                            >
                              <Icon name="trash" size={14} />
                              {t('file.deleteForGood')}…
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn is-compact is-danger"
                            onClick={() => {
                              const ids = selectedIds;
                              clearSelection();
                              actions.deleteFiles(ids);
                            }}
                          >
                            <Icon name="trash" size={14} />
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {!showDeleted ? (
                          <button
                            type="button"
                            className="field field-menu home-sort"
                            aria-haspopup="menu"
                            onClick={(e) => sortMenu(e.currentTarget)}
                          >
                            <span className="truncate">
                              {sort === 'name' ? t('home.sortName') : t('home.sortModified')}
                            </span>
                            <Icon name="caret" size={12} />
                          </button>
                        ) : (
                          deleted.length > 0 && (
                            <button
                              type="button"
                              className="btn is-compact is-danger"
                              disabled={trashActionBusy}
                              onClick={() => confirmDiscard(sectionIds, true)}
                            >
                              <Icon name="trash" size={14} />
                              {t('home.emptyTrash')}…
                            </button>
                          )
                        )}

                        <div className="home-view" role="group">
                          <IconButton
                            icon="gridView"
                            label={t('home.viewGrid')}
                            pressed={view === 'grid'}
                            onClick={() => uiStore.set({ homeView: 'grid' })}
                          />
                          <IconButton
                            icon="list"
                            label={t('home.viewList')}
                            pressed={view === 'list'}
                            onClick={() => uiStore.set({ homeView: 'list' })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="home-mobile-toolbar">
                    {mobileSelectionMode ? (
                      <div className="home-mobile-selection-head">
                        <IconButton icon="close" label={t('home.clearSelection')} onClick={clearSelection} />

                        <span className="home-mobile-selection-count" aria-live="polite">
                          {selectedIds.length > 0
                            ? t('home.selected', { count: selectedIds.length })
                            : t('home.selectFiles')}
                        </span>

                        <button
                          type="button"
                          className="btn"
                          disabled={selectedIds.length === sectionItems.length}
                          onClick={selectAll}
                        >
                          <span className="home-mobile-action-label">{t('home.selectAll')}</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="home-mobile-toolbar-head">
                          <h2 className="home-toolbar-title">
                            {showDeleted ? t('home.deleted') : t('home.drawings')}
                          </h2>

                          {sectionItems.length > 0 && (
                            <button type="button" className="btn" onClick={startMobileSelection}>
                              {t('home.select')}
                            </button>
                          )}
                        </div>

                        <div className="home-mobile-toolbar-tools">
                          {!showDeleted ? (
                            <button
                              type="button"
                              className="field field-menu home-sort"
                              aria-haspopup="menu"
                              onClick={(e) => sortMenu(e.currentTarget)}
                            >
                              <span className="truncate">
                                {sort === 'name' ? t('home.sortName') : t('home.sortModified')}
                              </span>
                              <Icon name="caret" size={12} />
                            </button>
                          ) : deleted.length > 0 ? (
                            <button
                              type="button"
                              className="btn is-danger home-mobile-empty"
                              disabled={trashActionBusy}
                              onClick={() => confirmDiscard(sectionIds, true)}
                            >
                              <Icon name="trash" size={14} />
                              <span className="home-mobile-action-label">{t('home.emptyTrash')}…</span>
                            </button>
                          ) : (
                            <span className="home-mobile-toolbar-spacer" />
                          )}

                          <div className="home-view" role="group">
                            <IconButton
                              icon="gridView"
                              label={t('home.viewGrid')}
                              pressed={view === 'grid'}
                              onClick={() => uiStore.set({ homeView: 'grid' })}
                            />

                            <IconButton
                              icon="list"
                              label={t('home.viewList')}
                              pressed={view === 'list'}
                              onClick={() => uiStore.set({ homeView: 'list' })}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {/* The deleted files, kept a while: a click on Delete is never the end of a drawing. */}
              {/* No drawing yet: a welcome, and the templates to start from in one click. */}
              {shown.length === 0 && !showDeleted && (
                <section className="home-welcome">
                  <span className="home-mark">
                    <Icon name="logo" size={48} />
                  </span>
                  <h1>{t('home.title')}</h1>
                  <p className="home-tagline">{t('home.tagline')}</p>
                  {/* The three ways in: from scratch, from a file, or from a template below. */}
                  <div className="home-welcome-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openDialog({ type: 'newFile' })}
                    >
                      <Icon name="plus" size={16} />
                      {t('common.create')}
                    </button>
                    <button type="button" className="btn" onClick={() => void importFile()}>
                      <Icon name="upload" size={16} />
                      {t('home.import')}
                    </button>
                  </div>
                  <p className="home-formats muted">{t('home.formats')}</p>
                  <h2 className="home-welcome-title">{t('template.startTitle')}</h2>
                  <div className="home-templates-grid">
                    {TEMPLATES.map((tpl) => (
                      <PresetCard
                        key={tpl.id}
                        template={tpl}
                        onClick={() => {
                          createFromTemplate(editor, tpl, t('default.untitled'));
                          leaveHome(editor);
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
              {showDeleted && (
                <section className="home-files">
                  {deleted.length === 0 && <p className="home-empty muted">{t('home.trashEmpty')}</p>}
                  {view === 'list' ? (
                    <table
                      className={`home-table${selectedIds.length > 0 || mobileSelectionMode ? ' is-selecting' : ''}`}
                    >
                      <thead>
                        <tr>
                          <th />
                          <th>{t('home.colName')}</th>
                          <th>{t('home.colFormat')}</th>
                          <th>{t('home.colPalette')}</th>
                          <th>{t('home.colDeleted')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {deleted.map((f) => (
                          <tr
                            key={f.id}
                            className={selectedIds.includes(f.id) ? 'is-selected' : undefined}
                            {...mobileSelectionPointerHandlers(f.id)}
                            onClick={(e) => clickCard(e, f.id, false)}
                          >
                            <td className="home-td-select">
                              <Checkbox
                                checked={selectedIds.includes(f.id)}
                                onChange={(checked) => selectFile(f.id, checked)}
                                variant="selection"
                                ariaLabel={t('home.selectFile', { name: f.name })}
                              />
                            </td>
                            <td className="home-td-name">
                              <span>
                                <HomeThumb doc={f.boards[0]} />
                                <span className="truncate">{f.name}</span>
                              </span>
                            </td>
                            <td>{format({ ...f.boards[0], boards: f.boards.length })}</td>
                            <td>{paletteName(f.boards[0])}</td>
                            <td>{formatUpdated(f.deletedAt, t('home.justNow'))}</td>
                            <td>
                              <span className="home-td-actions">
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => void restore(f.id, f.name)}
                                >
                                  {t('file.restore')}
                                </button>
                                <IconButton
                                  icon="trash"
                                  className="icon-btn is-danger"
                                  label={t('file.deleteForGood')}
                                  onClick={() => void discardSelected([f.id])}
                                />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div
                      className={`home-grid${selectedIds.length > 0 || mobileSelectionMode ? ' is-selecting' : ''}`}
                    >
                      {deleted.map((f) => (
                        <div
                          key={f.id}
                          className={`home-card is-deleted${selectedIds.includes(f.id) ? ' is-selected' : ''}`}
                          {...mobileSelectionPointerHandlers(f.id)}
                          onClick={(e) => clickCard(e, f.id, false)}
                        >
                          <Checkbox
                            checked={selectedIds.includes(f.id)}
                            onChange={(checked) => selectFile(f.id, checked)}
                            variant="selection"
                            ariaLabel={t('home.selectFile', { name: f.name })}
                          />
                          <HomeThumb doc={f.boards[0]} />
                          <span className="home-card-info">
                            <span className="home-card-name truncate">{f.name}</span>
                            <span className="home-card-meta muted truncate">
                              {formatUpdated(f.deletedAt, t('home.justNow'))} · {f.boards[0].width} ×{' '}
                              {f.boards[0].height}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="btn home-card-restore"
                            onClick={() => void restore(f.id, f.name)}
                          >
                            {t('file.restore')}
                          </button>
                          <IconButton
                            icon="more"
                            className="icon-btn home-card-action"
                            label={t('file.actions')}
                            aria-haspopup="menu"
                            onClick={(e) =>
                              openMenu(e.currentTarget, [
                                {
                                  label: t('file.deleteForGood'),
                                  onSelect: () => void discardSelected([f.id]),
                                },
                              ])
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {shown.length > 0 && !showDeleted && view === 'list' && (
                <section className="home-files">
                  <table
                    className={`home-table${selectedIds.length > 0 || mobileSelectionMode ? ' is-selecting' : ''}`}
                  >
                    <thead>
                      <tr>
                        <th />
                        <th>{t('home.colName')}</th>
                        <th>{t('home.colFormat')}</th>
                        <th>{t('home.colPalette')}</th>
                        <th>{t('home.sortModified')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((f) => {
                        const doc = docs.find((d) => fileIdOf(d) === f.id);
                        if (!doc) return null;
                        return (
                          <tr
                            key={f.id}
                            className={`${draggedId === f.id ? 'is-dragging' : ''}${selectedIds.includes(f.id) ? ' is-selected' : ''}`}
                            {...dragFile(f.id)}
                            {...mobileSelectionPointerHandlers(f.id)}
                            tabIndex={0}
                            onClick={(e) => clickCard(e, f.id)}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' '))
                                return;
                              e.preventDefault();
                              open(f.id);
                            }}
                          >
                            <td className="home-td-select">
                              <Checkbox
                                checked={selectedIds.includes(f.id)}
                                onChange={(checked) => selectFile(f.id, checked)}
                                variant="selection"
                                ariaLabel={t('home.selectFile', { name: f.name })}
                              />
                            </td>
                            <td className="home-td-name">
                              <span>
                                <HomeThumb doc={doc} />
                                {fileName(f)}
                                {animated(f.id) && (
                                  <span className="home-animated-inline" data-tip={t('home.animated')}>
                                    <Icon name="timeline" size={14} />
                                  </span>
                                )}
                              </span>
                            </td>
                            <td>{format(f)}</td>
                            <td>{paletteName(doc)}</td>
                            <td>{formatUpdated(f.updatedAt, t('home.justNow'))}</td>
                            <td>
                              <span className="home-td-actions" onClick={(e) => e.stopPropagation()}>
                                <IconButton
                                  icon="duplicate"
                                  label={t('file.duplicate')}
                                  onClick={() => editor.duplicateFile(f.id)}
                                />
                                <IconButton
                                  icon="download"
                                  label={t('file.download')}
                                  onClick={() => (editor.switchFile(f.id), void actions.saveDocument())}
                                />
                                <IconButton
                                  icon="trash"
                                  className="icon-btn is-danger"
                                  label={t('common.delete')}
                                  onClick={() => deleteSingle(f.id, f.name)}
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              )}
              {shown.length > 0 && !showDeleted && view !== 'list' && (
                <section className="home-files">
                  <div
                    className={`home-grid${selectedIds.length > 0 || mobileSelectionMode ? ' is-selecting' : ''}`}
                  >
                    {shown.map((f) => {
                      // The file's first board as its thumbnail.
                      const doc = docs.find((d) => fileIdOf(d) === f.id);
                      if (!doc) return null;
                      return (
                        <div
                          key={f.id}
                          className={`home-card${draggedId === f.id ? ' is-dragging' : ''}${selectedIds.includes(f.id) ? ' is-selected' : ''}`}
                          {...dragFile(f.id)}
                          {...mobileSelectionPointerHandlers(f.id)}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => clickCard(e, f.id)}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                            e.preventDefault();
                            open(f.id);
                          }}
                        >
                          <Checkbox
                            checked={selectedIds.includes(f.id)}
                            onChange={(checked) => selectFile(f.id, checked)}
                            variant="selection"
                            ariaLabel={t('home.selectFile', { name: f.name })}
                          />
                          <HomeThumb doc={doc} />
                          {animated(f.id) && (
                            <span className="home-animated" data-tip={t('home.animated')}>
                              <Icon name="timeline" size={14} />
                            </span>
                          )}
                          <span className="home-card-info">
                            {fileName(f, 'home-card-name')}
                            <span className="home-card-meta muted truncate">
                              {formatUpdated(f.updatedAt, t('home.justNow'))} · {f.width} × {f.height}
                            </span>
                          </span>
                          <IconButton
                            icon="more"
                            className="icon-btn home-card-action"
                            label={t('file.actions')}
                            aria-haspopup="menu"
                            onClick={(e) => {
                              e.stopPropagation();
                              openMenu(
                                e.currentTarget,
                                fileMenu(editor, actions, f, () => setRenamingId(f.id), clearSelection),
                              );
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </main>
          </div>
        }
      </div>
      {mobileSelectionMode && (
        <div
          className="home-mobile-actions"
          role="group"
          aria-label={t('home.selected', { count: selectedIds.length })}
        >
          {showDeleted ? (
            <>
              <button
                type="button"
                className="btn home-mobile-action"
                disabled={selectedIds.length === 0 || trashActionBusy}
                onClick={() => void restoreSelected(selectedIds)}
              >
                <Icon name="undo" size={18} />
                <span className="home-mobile-action-label">{t('file.restore')}</span>
              </button>

              <button
                type="button"
                className="btn is-danger home-mobile-action"
                disabled={selectedIds.length === 0 || trashActionBusy}
                onClick={() => confirmDiscard(selectedIds)}
              >
                <Icon name="trash" size={18} />
                <span className="home-mobile-action-label">{t('file.deleteForGood')}…</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn is-danger home-mobile-action"
              disabled={selectedIds.length === 0}
              onClick={() => {
                const ids = selectedIds;
                clearSelection();
                actions.deleteFiles(ids);
              }}
            >
              <Icon name="trash" size={18} />
              <span className="home-mobile-action-label">{t('common.delete')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
