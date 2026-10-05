import { useState } from 'react';
import { MAX_SIZE } from '../../engine/document';
import { clamp } from '../../engine/math';
import { toCss, type Color } from '../../engine/color';
import { PALETTE_PRESETS, parseHexList, presetColors } from '../../engine/palette';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { IconButton } from '../components/IconButton';
import { loadImage } from '../../io/image';
import { pickFile } from '../../io/pickFile';
import { useActions } from '../ActionsContext';
import { hasUntouchedStarter, leaveHome } from '../home';
import { closeDialog, toast, uiStore } from '../uiStore';
import { Dialog } from './Dialog';
import { UpscaledDialog } from './UpscaledDialog';
import { CanvasSizeDialog } from './CanvasSizeDialog';
import { TemplateCards } from '../components/TemplateCards';
import { createFromTemplate } from '../templates';
import { SHORTCUT_GROUPS } from './shortcuts';

const SIZE_PRESETS = [8, 16, 24, 32, 48, 64, 128, 256];

function NewFileDialog() {
  const t = useT();
  const editor = useEditor();
  const doc = editor.getState().doc;
  const [w, setW] = useState(String(doc.width));
  const [h, setH] = useState(String(doc.height));
  const [reference, setReference] = useState<File | null>(null);
  const actions = useActions();
  /** A reference image gives the canvas its proportions: the height follows the width. */
  const pickReference = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    setReference(file);
    try {
      const img = await loadImage(file);
      const width = clamp(Number(w) || 32, 1, MAX_SIZE);
      setH(String(clamp(Math.round((width * img.naturalHeight) / img.naturalWidth), 1, MAX_SIZE)));
    } catch {
      /* unreadable: addReference says so after creating the file */
    }
  };
  return (
    <Dialog
      title={t('dialog.newFile')}
      submitLabel={t('common.create')}
      onClose={closeDialog}
      onSubmit={() => {
        // The file replacing the blank starter takes its plain "Untitled" name.
        const name = hasUntouchedStarter(editor) ? t('default.untitled') : undefined;
        editor.newFile(clamp(Number(w) || 32, 1, MAX_SIZE), clamp(Number(h) || 32, 1, MAX_SIZE), name);
        leaveHome(editor);
        if (reference) void actions.addReference(reference);
      }}
    >
      <div className="subsection-title">{t('template.title')}</div>
      <TemplateCards
        onPick={(template) => {
          const name = hasUntouchedStarter(editor) ? t('default.untitled') : undefined;
          createFromTemplate(editor, template, name);
          leaveHome(editor);
          if (reference) void actions.addReference(reference);
          closeDialog();
        }}
      />
      <div className="subsection-title">{t('template.custom')}</div>
      <div className="chips">
        {SIZE_PRESETS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            aria-pressed={Number(w) === s && Number(h) === s}
            onClick={() => (setW(String(s)), setH(String(s)))}
          >
            {s} × {s}
          </button>
        ))}
      </div>
      <div className="two-columns">
        <label className="field">
          <span className="field-label">W</span>
          <input
            type="number"
            min={1}
            max={MAX_SIZE}
            value={w}
            onChange={(e) => setW(e.target.value)}
            aria-label={t('canvas.width')}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">H</span>
          <input
            type="number"
            min={1}
            max={MAX_SIZE}
            value={h}
            onChange={(e) => setH(e.target.value)}
            aria-label={t('canvas.height')}
            required
          />
        </label>
      </div>
      <div className="reference-pick">
        <button type="button" className="btn" onClick={() => void pickReference()}>
          {reference ? t('dialog.referenceChange') : t('dialog.reference')}
        </button>
        {reference && (
          <>
            <span className="muted truncate">{reference.name}</span>
            <IconButton icon="close" label={t('reference.remove')} onClick={() => setReference(null)} />
          </>
        )}
      </div>
      <p className="muted">{t('dialog.newFileHint')}</p>
    </Dialog>
  );
}

function PaletteImportDialog() {
  const t = useT();
  const editor = useEditor();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  return (
    <Dialog
      title={t('palette.paste')}
      submitLabel={t('dialog.useColors')}
      onClose={closeDialog}
      onSubmit={() => {
        const colors = parseHexList(text);
        if (!colors.length) return toast(t('toast.noHex'));
        editor.setPaletteColors(
          mode === 'replace' ? colors : [...editor.getState().palette.colors, ...colors],
        );
        toast(t('toast.colorsImported', { count: colors.length }));
      }}
    >
      <p className="muted">{t('dialog.pasteColorsHint')}</p>
      <textarea
        className="textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="1a1c2c 5d275d b13e53 ef7d57"
        spellCheck={false}
      />
      <div className="radios">
        <label>
          <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />{' '}
          {t('dialog.replacePalette')}
        </label>
        <label>
          <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />{' '}
          {t('dialog.appendPalette')}
        </label>
      </div>
    </Dialog>
  );
}

/** A strip of the palette's colors, for the palette list. */
function PaletteStrip({ colors }: { colors: Color[] }) {
  return (
    <span className="palette-strip" aria-hidden="true">
      {colors.slice(0, 32).map((c) => (
        <i key={c} style={{ background: toCss(c) }} />
      ))}
    </span>
  );
}

/** Choose which palettes show in the palette menu. The one in use always stays. */
function PaletteManagerDialog() {
  const t = useT();
  const editor = useEditor();
  const palette = useEditorState((s) => s.palette);
  const hidden = uiStore.use((s) => s.hiddenPalettes);
  const toggle = (key: string, shown: boolean) =>
    uiStore.set((s) => ({
      hiddenPalettes: shown ? s.hiddenPalettes.filter((k) => k !== key) : [...s.hiddenPalettes, key],
    }));
  return (
    <Dialog title={t('palette.manageTitle')} submitLabel={t('common.close')} onClose={closeDialog} hideCancel>
      <p className="muted">{t('palette.manageHint')}</p>
      <div className="palette-list">
        {Object.entries(PALETTE_PRESETS).map(([key, p]) => {
          const inUse = key === palette.key;
          return (
            <label key={key} className="palette-row" data-tip={inUse ? t('palette.inUse') : undefined}>
              <input
                type="checkbox"
                checked={inUse || !hidden.includes(key)}
                disabled={inUse}
                onChange={(e) => toggle(key, e.target.checked)}
              />
              <span className="palette-name">{p.name}</span>
              <PaletteStrip colors={presetColors(key)} />
            </label>
          );
        })}
        {palette.custom && (
          <div className="palette-row">
            <span className="palette-name">{t('palette.custom')}</span>
            <PaletteStrip colors={palette.custom} />
            <IconButton
              icon="trash"
              label={palette.key === 'custom' ? t('palette.inUse') : t('palette.deleteCustom')}
              disabled={palette.key === 'custom'}
              onClick={() => editor.deleteCustomPalette()}
            />
          </div>
        )}
      </div>
      {hidden.length > 0 && (
        <div className="button-row">
          <button type="button" className="btn" onClick={() => uiStore.set({ hiddenPalettes: [] })}>
            {t('palette.showAll')}
          </button>
        </div>
      )}
    </Dialog>
  );
}

function ShortcutsDialog() {
  const t = useT();
  return (
    <Dialog title={t('menu.shortcuts')} submitLabel={t('common.close')} onClose={closeDialog} hideCancel>
      <div className="shortcuts">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title}>
            <h3>{t(group.title)}</h3>
            {group.items.map(([label, keys]) => (
              <div key={label} className="shortcut">
                <span>{t(label)}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** Renders the active dialog from the UI store. */
export function Dialogs() {
  const t = useT();
  const dialog = uiStore.use((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.type) {
    case 'newFile':
      return <NewFileDialog />;
    case 'paletteImport':
      return <PaletteImportDialog />;
    case 'paletteManager':
      return <PaletteManagerDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'canvasSize':
      return <CanvasSizeDialog />;
    case 'upscaled':
      return <UpscaledDialog {...dialog} />;
    case 'confirm':
      return (
        <Dialog
          title={dialog.title}
          submitLabel={dialog.confirmLabel}
          onClose={closeDialog}
          onSubmit={dialog.onConfirm}
        >
          <p className="muted">{dialog.message}</p>
        </Dialog>
      );
    case 'output':
      return (
        <Dialog title={dialog.title} submitLabel={t('common.close')} onClose={closeDialog} hideCancel>
          <p className="muted">{dialog.message}</p>
          {dialog.image && <img className="output-image" src={dialog.image} alt="" />}
          {dialog.text && (
            <textarea
              className="textarea"
              readOnly
              value={dialog.text}
              onFocus={(e) => e.target.select()}
              autoFocus
            />
          )}
        </Dialog>
      );
  }
}
