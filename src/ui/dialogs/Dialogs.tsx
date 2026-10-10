import { useState } from 'react';
import { MAX_SIZE } from '../../engine/document';
import { clamp } from '../../engine/math';
import { toCss, type Color } from '../../engine/color';
import { PALETTE_PRESETS, parseHexList, presetColors } from '../../engine/palette';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { IconButton } from '../components/IconButton';
import { openMenu } from '../components/Menu';
import { loadImage } from '../../io/image';
import { pickFile } from '../../io/pickFile';
import { useActions } from '../ActionsContext';
import { hasUntouchedStarter, leaveHome } from '../home';
import { closeDialog, toast, uiStore } from '../uiStore';
import { Dialog } from './Dialog';
import { UpscaledDialog } from './UpscaledDialog';
import { CanvasSizeDialog } from './CanvasSizeDialog';
import { SizeList, type SizeChoice } from '../components/SizeList';
import { Icon } from '../components/Icon';
import { createFromTemplate, type Template } from '../templates';
import { SHORTCUT_GROUPS } from './shortcuts';

/** The sizes of the files changed last, different ones only, newest first. */
function recentSizes(files: { width: number; height: number; updatedAt: number }[], count = 3) {
  const sizes: { width: number; height: number }[] = [];
  for (const f of [...files].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (sizes.some((s) => s.width === f.width && s.height === f.height)) continue;
    sizes.push({ width: f.width, height: f.height });
    if (sizes.length === count) break;
  }
  return sizes;
}

/**
 * A new file, kept small: its size on top (the last one used, ready for Enter), then the last
 * sizes used and the templates as plain rows. A click picks one, a double-click starts with it.
 */
function NewFileDialog() {
  const t = useT();
  const editor = useEditor();
  const files = useEditorState((s) => s.files);
  const recent = recentSizes(files);
  const start = recent[0] ?? { width: 32, height: 32 };
  const [w, setW] = useState(String(start.width));
  const [h, setH] = useState(String(start.height));
  const [template, setTemplate] = useState<Template | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const actions = useActions();
  const size = () => [clamp(Number(w) || 32, 1, MAX_SIZE), clamp(Number(h) || 32, 1, MAX_SIZE)] as const;
  /** A reference image gives the canvas its proportions: the height follows the width. */
  const pickReference = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    setReference(file);
    try {
      const img = await loadImage(file);
      const [width] = size();
      setH(String(clamp(Math.round((width * img.naturalHeight) / img.naturalWidth), 1, MAX_SIZE)));
      setTemplate(null);
    } catch {
      /* unreadable: addReference says so after creating the file */
    }
  };
  const create = (width: number, height: number, tpl: Template | null) => {
    // The file replacing the blank starter takes its plain "Untitled" name.
    const name = hasUntouchedStarter(editor) ? t('default.untitled') : undefined;
    // A template, as long as its size wasn't changed: its palette and views come with it.
    if (tpl && tpl.width === width && tpl.height === height) createFromTemplate(editor, tpl, name);
    else editor.newFile(width, height, name);
    leaveHome(editor);
    if (reference) void actions.addReference(reference);
  };
  const pick = (choice: SizeChoice) => {
    setW(String(choice.width));
    setH(String(choice.height));
    setTemplate(choice.template ?? null);
  };
  const typed = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setTemplate(null);
  };
  const selected = template ? template.id : `${Number(w)}×${Number(h)}`;
  return (
    <Dialog
      title={t('dialog.newFile')}
      className="new-file-dialog"
      submitLabel={t('common.create')}
      onClose={closeDialog}
      onSubmit={() => create(...size(), template)}
      footer={
        <button type="button" className="link-btn" onClick={() => void pickReference()}>
          <Icon name="image" size={14} />
          <span className="truncate">{reference ? reference.name : t('dialog.reference')}</span>
        </button>
      }
    >
      <div className="size-fields">
        <label className="field">
          <span className="field-label">W</span>
          <input
            type="number"
            min={1}
            max={MAX_SIZE}
            value={w}
            onChange={typed(setW)}
            aria-label={t('canvas.width')}
            autoFocus
            required
          />
        </label>
        <IconButton
          icon="swap"
          label={t('dialog.swapSize')}
          onClick={() => {
            setW(h);
            setH(w);
            setTemplate(null);
          }}
        />
        <label className="field">
          <span className="field-label">H</span>
          <input
            type="number"
            min={1}
            max={MAX_SIZE}
            value={h}
            onChange={typed(setH)}
            aria-label={t('canvas.height')}
            required
          />
        </label>
      </div>
      <SizeList
        recent={recent}
        selected={selected}
        onPick={pick}
        onCreate={(choice) => {
          create(choice.width, choice.height, choice.template ?? null);
          closeDialog();
        }}
      />
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
  const actions = useActions();
  const myPalettes = useEditorState((s) => s.myPalettes);
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
      {/* The user's own, in every file: from this file's palette or from a palette file. */}
      <div className="subsection-title palette-mine-title">
        <span>{t('palette.mine')}</span>
        <button
          type="button"
          className="btn"
          aria-haspopup="menu"
          onClick={(e) =>
            openMenu(e.currentTarget, [
              { label: t('palette.newFromFile'), onSelect: () => editor.savePalette('') },
              { label: t('palette.newFromImport'), onSelect: () => void actions.newPaletteFromFile() },
            ])
          }
        >
          {t('palette.new')}
        </button>
      </div>
      {myPalettes.length ? (
        <div className="palette-list">
          {myPalettes.map((m) => (
            <div key={m.id} className="palette-row">
              <input
                className="palette-name-input"
                defaultValue={m.name}
                aria-label={t('palette.rename')}
                spellCheck={false}
                onBlur={(e) => editor.renamePalette(m.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <PaletteStrip colors={m.colors} />
              <IconButton
                icon="down"
                label={t('palette.updateFromFile')}
                onClick={() => editor.updatePalette(m.id)}
              />
              <IconButton
                icon="trash"
                label={t('palette.deleteMine')}
                onClick={() => editor.deletePalette(m.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t('palette.mineEmpty')}</p>
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
