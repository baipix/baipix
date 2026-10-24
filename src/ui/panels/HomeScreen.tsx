import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fileIdOf } from '../../engine/document';
import { flatten } from '../../engine/composite';
import type { PixelDoc } from '../../engine/document';
import { getLocale, useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { openMenu } from '../components/Menu';
import { isUntouchedStarter, leaveHome } from '../home';
import { fileMenu, newIssueUrl } from '../menus';
import { createFromTemplate, TEMPLATES, type Template } from '../templates';
import { CHANGELOG_URL, DOCS_URL } from '../links';
import { PALETTE_PRESETS, presetColors } from '../../engine/palette';
import { toCss } from '../../engine/color';
import { openDialog, toast, uiStore } from '../uiStore';
import { refreshTrash, trashStore, useStorage } from '../StorageContext';

const DAY = 86_400_000;

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

/** A template as a board of its shape, striped with its palette's colors. */
function TemplatePreview({ template }: { template: Template }) {
  const colors = presetColors(template.palette).slice(0, 8);
  // Fitted in the 16:9 picture, at most 80% of its width and 64% of its height.
  const k = Math.min(80 / template.width, (0.64 * 56.25) / template.height);
  const size = { width: `${template.width * k}%`, height: `${((template.height * k) / 56.25) * 100}%` };
  return (
    <span className="home-thumb home-template-preview" aria-hidden="true">
      <span className="home-template-board" style={size}>
        {colors.map((c, i) => (
          <span key={i} style={{ background: toCss(c) }} />
        ))}
      </span>
    </span>
  );
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
    new Uint32Array(image.data.buffer).set(flatten(doc));
    sctx.putImageData(image, 0, 0);
    canvas.width = doc.width * k;
    canvas.height = doc.height * k;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  }, [doc, doc.updatedAt]);
  return <canvas ref={ref} className="home-thumb" aria-hidden="true" />;
}

export function HomeScreen() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const storage = useStorage();
  const files = useEditorState((s) => s.files);
  const deleted = trashStore.use((s) => s.files);
  const [showDeleted, setShowDeleted] = useState(false);
  const restore = async (id: string, name: string) => {
    const boards = (await storage.restoreTrashed?.(id)) ?? [];
    if (!boards.length) return;
    editor.adoptDocuments(boards);
    refreshTrash(storage);
    toast(t('toast.fileRestored', { name }));
  };
  const [dropping, setDropping] = useState(false);
  const docs = editor.getDocuments();
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
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) leaveHome(editor);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const open = (id: string) => {
    editor.switchFile(id);
    leaveHome(editor);
  };

  const importFile = async (file?: File | null) => {
    if (await actions.openFile(file)) leaveHome(editor);
  };

  return (
    <div
      className={`home${dropping ? ' is-dropping' : ''}`}
      data-drop-label={t('home.drop')}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
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
        {/* With drawings, Import and Create up here on the logo's line; the welcome has its own. */}
        {
          <div className="home-top-actions">
            <button type="button" className="btn" onClick={() => void importFile()}>
              <Icon name="upload" size={16} />
              {t('home.import')}
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
                onClick={() => setShowDeleted(false)}
              >
                <Icon name="image" size={16} />
                {t('home.drawings')}
              </button>
              <button
                type="button"
                className={`home-nav-item${showDeleted ? ' is-active' : ''}`}
                onClick={() => setShowDeleted(true)}
              >
                <Icon name="trash" size={16} />
                {t('home.deleted')}
                {deleted.length > 0 && <span className="home-nav-count">{deleted.length}</span>}
              </button>
              <div className="home-nav-bottom">
                <a className="home-nav-link" href={DOCS_URL} target="_blank" rel="noopener">
                  <Icon name="docs" size={14} />
                  {t('home.docsTitle')}
                </a>
                <button
                  type="button"
                  className="home-nav-link"
                  aria-haspopup="menu"
                  onClick={(e) => bugMenu(e.currentTarget)}
                >
                  <Icon name="bug" size={14} />
                  {t('home.bugTitle')}
                </button>
                <a className="home-nav-link" href={CHANGELOG_URL} target="_blank" rel="noopener">
                  <Icon name="news" size={14} />
                  {t('home.newsTitle', { version: __APP_VERSION__ })}
                </a>
              </div>
            </nav>
            <main className="home-main">
              {/* A toolbar like a files app's: the section's title, how to sort and how to show. */}
              {(shown.length > 0 || showDeleted) && (
                <div className="home-toolbar">
                  <h2 className="home-toolbar-title">
                    {showDeleted ? t('home.deleted') : t('home.drawings')}
                  </h2>
                  <div className="home-toolbar-tools">
                    {!showDeleted && (
                      <button
                        type="button"
                        className="field field-menu home-sort"
                        aria-haspopup="menu"
                        onClick={(e) => sortMenu(e.currentTarget)}
                      >
                        {sort === 'name' ? t('home.sortName') : t('home.sortModified')}
                        <Icon name="caret" size={12} />
                      </button>
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
                      <button
                        key={tpl.id}
                        type="button"
                        className="home-card home-template"
                        onClick={() => {
                          createFromTemplate(editor, tpl, t('default.untitled'));
                          leaveHome(editor);
                        }}
                      >
                        <TemplatePreview template={tpl} />
                        <span className="home-card-info">
                          <span className="home-card-name truncate">{t(tpl.label)}</span>
                          <span className="home-card-meta muted truncate">
                            {tpl.width} × {tpl.height}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {showDeleted && (
                <section className="home-files">
                  {deleted.length === 0 && <p className="home-empty muted">{t('home.trashEmpty')}</p>}
                  {view === 'list' ? (
                    <table className="home-table">
                      <thead>
                        <tr>
                          <th>{t('home.colName')}</th>
                          <th>{t('home.colFormat')}</th>
                          <th>{t('home.colPalette')}</th>
                          <th>{t('home.colDeleted')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {deleted.map((f) => (
                          <tr key={f.id}>
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
                                  onClick={() =>
                                    void storage.discardTrashed?.(f.id).then(() => refreshTrash(storage))
                                  }
                                />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="home-grid">
                      {deleted.map((f) => (
                        <div key={f.id} className="home-card is-deleted">
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
                                  onSelect: () =>
                                    void storage.discardTrashed?.(f.id).then(() => refreshTrash(storage)),
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
                  <table className="home-table">
                    <thead>
                      <tr>
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
                            tabIndex={0}
                            onClick={() => open(f.id)}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' '))
                                return;
                              e.preventDefault();
                              open(f.id);
                            }}
                          >
                            <td className="home-td-name">
                              <span>
                                <HomeThumb doc={doc} />
                                <span className="truncate">{f.name}</span>
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
                                  onClick={() => actions.deleteFile(f.id, f.name)}
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
                  <div className="home-grid">
                    {shown.map((f) => {
                      // The file's first board as its thumbnail.
                      const doc = docs.find((d) => fileIdOf(d) === f.id);
                      if (!doc) return null;
                      return (
                        <div
                          key={f.id}
                          className="home-card"
                          role="button"
                          tabIndex={0}
                          onClick={() => open(f.id)}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                            e.preventDefault();
                            open(f.id);
                          }}
                        >
                          <HomeThumb doc={doc} />
                          <span className="home-card-info">
                            <span className="home-card-name truncate">{f.name}</span>
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
                              openMenu(e.currentTarget, fileMenu(editor, actions, f));
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
    </div>
  );
}
