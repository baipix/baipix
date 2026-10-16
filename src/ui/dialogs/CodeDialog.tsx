import { useMemo } from 'react';
import { CODE_EXTENSIONS, CODE_LANGUAGES, type CodeLanguage } from '../../engine/export/code';
import { useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditorState } from '../EditorContext';
import { Checkbox } from '../components/Checkbox';
import { closeDialog, uiStore } from '../uiStore';
import { Dialog } from './Dialog';

const LABELS: Record<CodeLanguage, string> = {
  react: 'React',
  svg: 'SVG',
  css: 'CSS',
  json: 'JSON',
  ascii: 'ASCII',
};

const HINTS = {
  react: 'code.hint.react',
  svg: 'code.hint.svg',
  css: 'code.hint.css',
  json: 'code.hint.json',
  ascii: 'code.hint.ascii',
} as const;

/** Past this many lines the preview stops; Copy and Download still give everything. */
const PREVIEW_LINES = 400;

/**
 * The drawing as code, from the top bar's code button: a React component, the SVG, CSS, JSON or
 * ASCII, to read, copy or download. It follows the drawing's pixel size and gap, like the export.
 */
export function CodeDialog() {
  const t = useT();
  const actions = useActions();
  const revision = useEditorState((s) => s.revision);
  const doc = useEditorState((s) => s.doc);
  const language = uiStore.use((s) => s.exportCode);
  const onlyLayer = uiStore.use((s) => s.exportActiveLayer);
  const code = useMemo(
    () => actions.codePreview(language, onlyLayer),
    // The drawing changes with the revision, and the board with the doc: the code follows them.
    [actions, language, onlyLayer, revision, doc],
  );
  const lines = code.split('\n');
  const cut = lines.length > PREVIEW_LINES;
  return (
    <Dialog title={t('code.title')} onClose={closeDialog} className="code-dialog">
      <div className="code-tabs" role="tablist" aria-label={t('code.language')}>
        {CODE_LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={language === l}
            onClick={() => uiStore.set({ exportCode: l })}
          >
            {LABELS[l]}
          </button>
        ))}
      </div>
      <pre
        className="code-preview"
        tabIndex={0}
        aria-label={t('code.preview', { language: LABELS[language] })}
      >
        <code>{cut ? lines.slice(0, PREVIEW_LINES).join('\n') : code}</code>
      </pre>
      {cut && <p className="hint">{t('code.cut', { shown: PREVIEW_LINES, total: lines.length })}</p>}
      <p className="hint">{t(HINTS[language])}</p>
      <div className="code-footer">
        <Checkbox
          checked={onlyLayer}
          onChange={(v) => uiStore.set({ exportActiveLayer: v })}
          label={t('export.activeLayerOnly')}
        />
        <div className="code-buttons">
          <button
            type="button"
            className="btn"
            onClick={() => void actions.downloadCode(language, onlyLayer)}
          >
            {t('code.download', { ext: CODE_EXTENSIONS[language] })}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void actions.copyCode(language, onlyLayer)}
          >
            {t('code.copy')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
