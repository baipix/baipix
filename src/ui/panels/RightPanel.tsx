import { Fragment, useRef } from 'react';
import { alpha, opaque, pack, toCss, toHex } from '../../engine/color';
import { BLEND_MODE_GROUPS, type BlendMode } from '../../engine/composite';
import { hasBackground, MAX_SIZE } from '../../engine/document';
import { PALETTE_PRESETS, presetColors } from '../../engine/palette';
import { useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { openMenu } from '../components/Menu';
import { NumberField } from '../components/NumberField';
import { PaletteGrid } from '../components/PaletteGrid';
import { Row, Section } from '../components/Section';
import { openAdjust, openDialog, toast, uiStore } from '../uiStore';
import { copyText } from '../../io/clipboard';
import { ColorRow } from './ColorRow';
import { ExportPreview } from './ExportPreview';

const PIXEL_SIZES = [1, 2, 4, 8, 16, 32];

function RenderSection() {
  const t = useT();
  const editor = useEditor();
  const render = useEditorState((s) => s.doc.render);
  return (
    <Section id="render" title={t('section.render')}>
      <div className="segmented" role="group" aria-label={t('render.pixelSizeHint')}>
        {PIXEL_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={render.pixelSize === s}
            data-tip={t('render.scaleTip', { size: s })}
            onClick={() => editor.setRender({ pixelSize: s })}
          >
            {s}×
          </button>
        ))}
      </div>
    </Section>
  );
}

function ColorsSection() {
  const t = useT();
  const editor = useEditor();
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  const recent = useEditorState((s) => s.recent);
  return (
    <Section
      id="colors"
      title={t('section.colors')}
      aside={
        <IconButton icon="swap" label={t('color.swap')} shortcut="X" onClick={() => editor.swapColors()} />
      }
    >
      <ColorRow
        slot="primary"
        color={primary}
        onChange={(c) => editor.setColor('primary', c)}
        role={`${t('color.primary')} · ${t('color.leftClick')}`}
      />
      <ColorRow
        slot="secondary"
        color={secondary}
        onChange={(c) => editor.setColor('secondary', c)}
        role={`${t('color.secondary')} · ${t('color.rightClick')}`}
      />
      {recent.length > 0 && (
        <div className="recent-colors" role="group" aria-label={t('color.recent')}>
          <PaletteGrid
            colors={recent}
            primary={primary}
            secondary={secondary}
            onPick={(c, isSecondary) => editor.setColor(isSecondary ? 'secondary' : 'primary', c)}
          />
        </div>
      )}
    </Section>
  );
}

function PaletteSection() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const palette = useEditorState((s) => s.palette);
  const hidden = uiStore.use((s) => s.hiddenPalettes);
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  return (
    <Section
      id="palette"
      title={t('section.palette')}
      aside={
        <>
          {/* The palettes with their colors, not just their names. */}
          <button
            type="button"
            className="select-plain palette-picker"
            aria-haspopup="menu"
            aria-label={t('palette.preset')}
            data-tip={t('palette.preset')}
            onClick={(e) =>
              openMenu(e.currentTarget, [
                ...Object.entries(PALETTE_PRESETS)
                  .filter(([key]) => key === palette.key || !hidden.includes(key))
                  .map(([key, p]) => {
                    const colors = presetColors(key);
                    return {
                      label: p.name,
                      shortcut: String(colors.length),
                      checked: key === palette.key,
                      swatches: colors.map(toCss),
                      onSelect: () => editor.setPalettePreset(key),
                    };
                  }),
                ...(palette.custom
                  ? [
                      {
                        label: t('palette.custom'),
                        shortcut: String(palette.custom.length),
                        checked: palette.key === 'custom',
                        swatches: palette.custom.map(toCss),
                        onSelect: () => editor.setPalettePreset('custom'),
                      },
                    ]
                  : []),
                '-',
                { label: t('palette.manage'), onSelect: () => openDialog({ type: 'paletteManager' }) },
              ])
            }
          >
            <span className="truncate">
              {palette.key === 'custom' ? t('palette.custom') : PALETTE_PRESETS[palette.key]?.name}
            </span>
            <span className="caret">▾</span>
          </button>
          <IconButton
            icon="more"
            label={t('palette.actions')}
            aria-haspopup="menu"
            onClick={(e) =>
              openMenu(e.currentTarget, [
                // Only the action that applies: add the primary color, or remove it if it's there.
                palette.colors.includes(opaque(primary))
                  ? { label: t('palette.remove'), onSelect: () => editor.removeFromPalette() }
                  : { label: t('palette.add'), onSelect: () => editor.addToPalette() },
                { label: t('palette.ramp'), onSelect: () => editor.addRamp() },
                { label: t('palette.sort'), onSelect: () => editor.sortPalette() },
                '-',
                { label: t('palette.fromDrawing'), onSelect: () => editor.paletteFromDrawing() },
                { label: t('palette.openFile'), onSelect: () => void actions.importPalette() },
                { label: t('palette.paste'), onSelect: () => openDialog({ type: 'paletteImport' }) },
                '-',
                { label: t('palette.manage'), onSelect: () => openDialog({ type: 'paletteManager' }) },
                '-',
                { label: t('palette.exportHex'), onSelect: () => void actions.exportPalette('hex') },
                { label: t('palette.exportGpl'), onSelect: () => void actions.exportPalette('gpl') },
              ])
            }
          />
        </>
      }
    >
      <PaletteGrid
        colors={palette.colors}
        primary={primary}
        secondary={secondary}
        onPick={(c, second) => editor.setColor(second ? 'secondary' : 'primary', c)}
        onMove={(from, to) => editor.movePaletteColor(from, to)}
        menu={(c) => {
          const hex = toHex(c).slice(1).toUpperCase();
          return [
            { label: t('swatch.secondary'), onSelect: () => editor.setColor('secondary', c) },
            '-',
            {
              label: t('swatch.replace'),
              disabled: !alpha(primary) || opaque(primary) === c,
              onSelect: () => toast(t('toast.colorReplaced', { count: editor.replaceColor(c, primary) })),
            },
            {
              label: t('swatch.copyHex', { hex }),
              onSelect: () => void copyText(hex).then((ok) => ok && toast(t('toast.hexCopied', { hex }))),
            },
            '-',
            { label: t('swatch.remove'), onSelect: () => editor.removeFromPalette(c) },
          ];
        }}
      />
      <div className="button-row">
        <button
          type="button"
          className="btn"
          data-tip={t('palette.addHint')}
          onClick={() => editor.addToPalette()}
        >
          {t('palette.addShort')}
        </button>
        <button
          type="button"
          className="btn"
          data-tip={t('palette.rampHint')}
          onClick={() => editor.addRamp()}
        >
          {t('palette.rampShort')}
        </button>
        <button
          type="button"
          className="btn"
          data-tip={t('palette.exportHint')}
          onClick={() => void actions.exportPalette()}
        >
          {t('palette.exportShort')}
        </button>
      </div>
    </Section>
  );
}

/** The selected reference image, in the place of the layer's settings. */
function ReferenceSection() {
  const t = useT();
  const editor = useEditor();
  const reference = useEditorState((s) => s.doc.reference);
  if (!reference) return null;
  return (
    <Section
      id="layer"
      title={t('section.layer')}
      aside={<span className="muted">{t('reference.title')}</span>}
    >
      <div className="two-columns">
        <NumberField
          value={Math.round(reference.opacity * 100)}
          min={0}
          max={100}
          label="◐"
          suffix="%"
          ariaLabel={t('common.opacity')}
          scrubHint={t('common.dragToAdjust')}
          sensitivity={2}
          onChange={(v, final) => editor.updateReference({ opacity: v / 100 }, final)}
        />
        <button
          type="button"
          className="btn"
          onClick={() => editor.updateReference({ visible: !reference.visible })}
        >
          {reference.visible ? t('layer.hide') : t('layer.show')}
        </button>
      </div>
      <p className="muted section-note">{t('reference.hint')}</p>
    </Section>
  );
}

function LayerSection() {
  const t = useT();
  const editor = useEditor();
  const layer = useEditorState((s) => s.doc.layers[s.doc.activeLayer]);
  const index = useEditorState((s) => s.doc.activeLayer);
  const referenceSelected = useEditorState((s) => s.referenceSelected);
  useEditorState((s) => s.revision);
  if (referenceSelected) return <ReferenceSection />;
  return (
    <Section
      id="layer"
      title={t('section.layer')}
      aside={
        <>
          <span className="muted truncate">{layer.name}</span>
          <IconButton
            icon={layer.visible ? 'eye' : 'eyeOff'}
            label={layer.visible ? t('layer.hide') : t('layer.show')}
            onClick={() => editor.setLayerVisible(index, !layer.visible)}
          />
          <IconButton icon="panel" label={t('adjust.open')} onClick={() => openAdjust('layer')} />
        </>
      }
    >
      <div className="two-columns">
        <label className="field">
          <select
            value={layer.blendMode ?? 'normal'}
            aria-label={t('blend.mode')}
            data-tip={t('blend.mode')}
            onChange={(e) => editor.setLayerBlendMode(e.target.value as BlendMode)}
          >
            {BLEND_MODE_GROUPS.map((group, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <option disabled aria-hidden="true">
                    ──────────
                  </option>
                )}
                {group.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`blend.${mode}`)}
                  </option>
                ))}
              </Fragment>
            ))}
          </select>
        </label>
        <NumberField
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          label="◐"
          suffix="%"
          ariaLabel={t('common.opacity')}
          scrubHint={t('common.dragToAdjust')}
          sensitivity={2}
          onChange={(v, final) => editor.setLayerOpacity(v / 100, final)}
        />
      </div>
    </Section>
  );
}

function CanvasSection() {
  const t = useT();
  const editor = useEditor();
  const doc = useEditorState((s) => s.doc);
  useEditorState((s) => s.revision);
  const hasBg = doc.background !== 0;
  const scrubbingBackground = useRef(false);
  return (
    <Section
      id="canvas"
      title={t('section.canvas')}
      info={t('canvas.resizeHint')}
      aside={<IconButton icon="plus" label={t('file.new')} onClick={() => openDialog({ type: 'newFile' })} />}
    >
      <div className="canvas-size-row">
        <NumberField
          value={doc.width}
          min={1}
          max={MAX_SIZE}
          label="W"
          ariaLabel={t('canvas.width')}
          sensitivity={3}
          onChange={(v, final) => final && editor.resize(v, doc.height)}
        />
        <NumberField
          value={doc.height}
          min={1}
          max={MAX_SIZE}
          label="H"
          ariaLabel={t('canvas.height')}
          sensitivity={3}
          onChange={(v, final) => final && editor.resize(doc.width, v)}
        />
        <IconButton icon="crop" label={t('resize.open')} onClick={() => openDialog({ type: 'canvasSize' })} />
      </div>
      {/* The gap is part of the drawing's look: shown on the canvas, used by exports. In px at the export size. */}
      <Row label={t('render.gap')}>
        <NumberField
          value={doc.render.gap}
          min={0}
          max={64}
          label="⇔"
          suffix={t('canvas.gapAt', { size: doc.render.pixelSize })}
          ariaLabel={t('render.gap')}
          scrubHint={t('common.dragToAdjust')}
          sensitivity={6}
          onChange={(v) => editor.setRender({ gap: v })}
        />
      </Row>
      <div className="subsection-title">
        <span>{t('canvas.background')}</span>
        {!hasBg && (
          <IconButton
            icon="plus"
            label={t('canvas.addBackground')}
            onClick={(e) => {
              const secondary = editor.getState().secondary;
              editor.setBackground(alpha(secondary) ? secondary : pack(255, 255, 255), true);
              uiStore.set({
                picker: { slot: 'background', top: e.currentTarget.getBoundingClientRect().top },
              });
            }}
          />
        )}
      </div>
      {hasBg ? (
        <ColorRow
          slot="background"
          color={doc.background}
          dimmed={!doc.backgroundVisible}
          onChange={(c, done = true) => {
            // One undo step per gesture: the first change records it, the rest of a scrub previews.
            if (!scrubbingBackground.current) editor.setBackground(c, doc.backgroundVisible);
            else editor.previewBackground(c);
            scrubbingBackground.current = !done;
          }}
          trailing={
            <>
              <IconButton
                icon={doc.backgroundVisible ? 'eye' : 'eyeOff'}
                label={doc.backgroundVisible ? t('canvas.hideBackground') : t('canvas.showBackground')}
                onClick={() => editor.setBackground(doc.background, !doc.backgroundVisible)}
              />
              <IconButton
                icon="minus"
                label={t('canvas.removeBackground')}
                onClick={() => {
                  if (uiStore.get().picker?.slot === 'background') uiStore.set({ picker: null });
                  editor.setBackground(0, true);
                }}
              />
            </>
          }
        />
      ) : null}
    </Section>
  );
}

function DisplaySection() {
  const t = useT();
  const editor = useEditor();
  const view = useEditorState((s) => s.view);
  return (
    <Section id="display" title={t('section.display')}>
      <Checkbox checked={view.grid} onChange={(v) => editor.setView('grid', v)} label={t('display.grid')} />
      <Checkbox checked={view.tile} onChange={(v) => editor.setView('tile', v)} label={t('display.tile')} />
      {view.tile && (
        // How visible the copies are: 100% shows the pattern as it will repeat.
        <Row label={t('display.tileOpacity')}>
          <NumberField
            value={Math.round(view.tileOpacity * 100)}
            min={0}
            max={100}
            label="◐"
            suffix="%"
            ariaLabel={t('display.tileOpacity')}
            scrubHint={t('common.dragToAdjust')}
            sensitivity={2}
            onChange={(v) => editor.setView('tileOpacity', v / 100)}
          />
        </Row>
      )}
      <Checkbox
        checked={view.mirrorX}
        onChange={(v) => editor.setView('mirrorX', v)}
        label={t('display.mirrorX')}
      />
      <Checkbox
        checked={view.mirrorY}
        onChange={(v) => editor.setView('mirrorY', v)}
        label={t('display.mirrorY')}
      />
      <Checkbox
        checked={view.rulers}
        onChange={(v) => editor.setView('rulers', v)}
        label={t('display.rulers')}
      />
      {view.rulers && <p className="muted section-note">{t('display.rulersHint')}</p>}
    </Section>
  );
}

function ExportSection() {
  const t = useT();
  const actions = useActions();
  const doc = useEditorState((s) => s.doc);
  useEditorState((s) => s.revision);
  const format = uiStore.use((s) => s.exportFormat);
  const onlyLayer = uiStore.use((s) => s.exportActiveLayer);
  const includeBackground = uiStore.use((s) => s.exportBackground);
  const editor = useEditor();
  return (
    <Section id="export" title={t('section.exportFile')}>
      <Row label={t('export.name')}>
        <label className="field">
          <input
            key={doc.id}
            defaultValue={doc.name}
            aria-label={t('export.name')}
            spellCheck={false}
            onBlur={(e) => editor.renameFile(doc.id, e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.currentTarget.value = doc.name;
                e.currentTarget.blur();
              }
            }}
          />
          <span className="field-suffix">.{format}</span>
        </label>
      </Row>
      <Row label={t('export.format')}>
        <label className="field">
          <select
            value={format}
            onChange={(e) => uiStore.set({ exportFormat: e.target.value as 'png' | 'svg' })}
            aria-label={t('export.format')}
          >
            <option value="png">PNG</option>
            <option value="svg">SVG</option>
          </select>
        </label>
      </Row>
      <Checkbox
        checked={onlyLayer}
        onChange={(v) => uiStore.set({ exportActiveLayer: v })}
        label={t('export.activeLayerOnly')}
      />
      {hasBackground(doc) && !onlyLayer && (
        <Checkbox
          checked={includeBackground}
          onChange={(v) => uiStore.set({ exportBackground: v })}
          label={t('export.includeBackground')}
        />
      )}
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => void actions.exportImage(format, onlyLayer)}
      >
        {t('export.button')}
      </button>
      <div className="two-columns">
        <button
          type="button"
          className="btn"
          data-tip={t('export.copySvgHint')}
          data-kbd="Ctrl+Shift+C"
          onClick={() => void actions.copySvg(onlyLayer)}
        >
          {t('export.copySvg')}
        </button>
        <button
          type="button"
          className="btn"
          data-tip={t('export.copyPngHint')}
          onClick={() => void actions.copyPng(onlyLayer)}
        >
          {t('export.copyPng')}
        </button>
      </div>
    </Section>
  );
}

const TABS = ['design', 'export'] as const;

/** Design (what you touch while drawing) and Export (the output file) tabs. The choice is remembered. */
function PanelTabs() {
  const t = useT();
  const tab = uiStore.use((s) => s.rightTab);
  return (
    <div className="panel-tabs" role="tablist" aria-label={t('panel.right')}>
      {TABS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`panel-tab-${id}`}
          aria-selected={tab === id}
          aria-controls="panel-tab-body"
          className="panel-tab"
          onClick={() => uiStore.set({ rightTab: id })}
        >
          {t(id === 'design' ? 'panel.design' : 'panel.export')}
        </button>
      ))}
    </div>
  );
}

export function RightPanel() {
  const t = useT();
  const tab = uiStore.use((s) => s.rightTab);
  return (
    <aside className="panel panel-right" aria-label={t('panel.right')}>
      <PanelTabs />
      <div
        id="panel-tab-body"
        role="tabpanel"
        aria-labelledby={`panel-tab-${tab}`}
        className="panel-tab-body"
      >
        {tab === 'design' ? (
          <>
            <CanvasSection />
            <ColorsSection />
            <PaletteSection />
            <LayerSection />
            <DisplaySection />
          </>
        ) : (
          <>
            <ExportPreview />
            <RenderSection />
            <ExportSection />
          </>
        )}
      </div>
    </aside>
  );
}
