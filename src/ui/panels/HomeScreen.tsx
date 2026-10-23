import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fileIdOf } from '../../engine/document';
import { flatten } from '../../engine/composite';
import type { PixelDoc } from '../../engine/document';
import { getLocale, useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { Icon } from '../components/Icon';
import { HomeGlow } from '../components/HomeGlow';
import { IconButton } from '../components/IconButton';
import { openMenu } from '../components/Menu';
import { isUntouchedStarter, leaveHome } from '../home';
import { fileMenu, newIssueUrl } from '../menus';
import { SizeList } from '../components/SizeList';
import { createFromTemplate } from '../templates';
import { DOCS_URL } from '../links';
import { openDialog, toast } from '../uiStore';
import { refreshTrash, trashStore, useStorage } from '../StorageContext';
import { TRASH_DAYS } from '../../storage/indexedDb';

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
  const restore = async (id: string, name: string) => {
    const boards = (await storage.restoreTrashed?.(id)) ?? [];
    if (!boards.length) return;
    editor.adoptDocuments(boards);
    refreshTrash(storage);
    toast(t('toast.fileRestored', { name }));
  };
  const [dropping, setDropping] = useState(false);
  const docs = editor.getDocuments();
  // Neither the blank starter nor a new file left untouched: they'd be empty cards.
  const shown = files
    .filter((f) => !isUntouchedStarter(f) && !editor.isFresh(f.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);

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
      className={`home${shown.length ? '' : ' is-empty'}${dropping ? ' is-dropping' : ''}`}
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
      <HomeGlow />
      <header className="home-top">
        <Icon name="logo" size={16} />
        <span className="home-brand">Baipix</span>
      </header>
      <div className="home-inner">
        <section className="home-hero">
          {/* The logo, its pixel hopping like a loader: waiting for you to start a file. */}
          <span className="home-mark">
            <Icon name="logo" size={72} />
          </span>
          <h1>{t('home.title')}</h1>
          <p className="home-tagline">{shown.length ? t('home.taglineBack') : t('home.tagline')}</p>
          <div className="home-actions">
            <button
              type="button"
              className="action-btn is-primary"
              onClick={() => openDialog({ type: 'newFile' })}
            >
              <Icon name="plus" size={12} />
              {t('common.create')}
            </button>
            <button type="button" className="action-btn" onClick={() => void importFile()}>
              {t('home.import')}
            </button>
          </div>
          <p className="home-formats muted">{t('home.formats')}</p>
          {/* First launch: a click on a template and the canvas is ready, palette and all. */}
          {shown.length === 0 && (
            <div className="home-templates">
              <p className="muted">{t('template.start')}</p>
              <SizeList
                onPick={(choice) => {
                  if (choice.template) createFromTemplate(editor, choice.template, t('default.untitled'));
                  leaveHome(editor);
                }}
                onCreate={(choice) => {
                  if (choice.template) createFromTemplate(editor, choice.template, t('default.untitled'));
                  leaveHome(editor);
                }}
              />
            </div>
          )}
        </section>

        {shown.length > 0 && (
          <section className="home-files">
            <h2>{t('home.recent')}</h2>
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
        {/* Deleted files, kept a while: a click on Delete is never the end of a drawing. */}
        {deleted.length > 0 && (
          <section className="home-files home-deleted">
            <h2>
              {t('home.deleted')} <span className="muted">{t('home.deletedHint', { days: TRASH_DAYS })}</span>
            </h2>
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
                </div>
              ))}
            </div>
          </section>
        )}
        {/* Under the drawings: where to learn more, and where to say something is wrong. */}
        <section className="home-help" aria-label={t('home.helpTitle')}>
          <a className="home-help-card" href={DOCS_URL} target="_blank" rel="noopener">
            <span className="home-help-icon">
              <Icon name="docs" size={18} />
            </span>
            <span className="home-help-text">
              <span className="home-help-title">{t('home.docsTitle')}</span>
              <span className="muted">{t('home.docsText')}</span>
            </span>
          </a>
          <a className="home-help-card" href={newIssueUrl('bug')} target="_blank" rel="noopener">
            <span className="home-help-icon">
              <Icon name="bug" size={18} />
            </span>
            <span className="home-help-text">
              <span className="home-help-title">{t('home.bugTitle')}</span>
              <span className="muted">{t('home.bugText')}</span>
            </span>
          </a>
        </section>
      </div>
    </div>
  );
}
