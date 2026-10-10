import { useRef } from 'react';
import { ColorChips } from '../components/ColorChips';
import { MY_PALETTE } from '../../engine/editor';
import { ColorRow } from './ColorRow';
import { EffectsSection } from './EffectsSection';
import { alpha, opaque, pack, toCss, toHex } from '../../engine/color';
import { BLEND_MODE_GROUPS } from '../../engine/composite';
import type { GroupBlendMode } from '../../engine/groups';
import { hasBackground, MAX_SIZE } from '../../engine/document';
import { PALETTE_PRESETS, presetColors, sortByLightness } from '../../engine/palette';
import { uniqueColors } from '../../engine/region';
import { useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { openMenu, type MenuItem } from '../components/Menu';
import { Icon } from '../components/Icon';
import { NumberField } from '../components/NumberField';
import { PaletteGrid } from '../components/PaletteGrid';
import { Row, Section } from '../components/Section';
import { openAdjust, openDialog, toast, uiStore } from '../uiStore';
import { copyText } from '../../io/clipboard';
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

function PaletteSection() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const palette = useEditorState((s) => s.palette);
  const myPalettes = useEditorState((s) => s.myPalettes);
  const mine = palette.key.startsWith(MY_PALETTE)
    ? myPalettes.find((m) => MY_PALETTE + m.id === palette.key)
    : undefined;
  const hidden = uiStore.use((s) => s.hiddenPalettes);
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  return (
    <Section
      id="colors"
      title={t('section.colors')}
      aside={
        <>
          {/* The palettes with their colors, not just their names. */}
          <button
            type="button"
            className="select-plain palette-picker"
            aria-haspopup="menu"
            aria-label={t('palette.preset')}
            data-tip={t('palette.preset')}
            onClick={(e) => {
              const presetItem = (key: string) => {
                const colors = presetColors(key);
                return {
                  label: PALETTE_PRESETS[key].name,
                  shortcut: String(colors.length),
                  checked: key === palette.key,
                  swatches: colors.map(toCss),
                  onSelect: () => editor.setPalettePreset(key),
                };
              };
              const drawing = sortByLightness(uniqueColors(editor.flatten({ includeBackground: false })));
              const current = palette.key in PALETTE_PRESETS ? [presetItem(palette.key)] : [];
              // The file's palettes first, the one in use on top; then the other presets.
              openMenu(e.currentTarget, [
                ...current,
                {
                  label: t('palette.drawing'),
                  shortcut: String(drawing.length),
                  checked: palette.key === 'drawing',
                  swatches: drawing.slice(0, 32).map(toCss),
                  onSelect: () => editor.setPalettePreset('drawing'),
                },
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
                // The user's own palettes, from every file: picking one copies it into this one.
                ...(myPalettes.length ? (['-'] as const) : []),
                ...myPalettes.map((m) => ({
                  label: m.name,
                  shortcut: String(m.colors.length),
                  checked: palette.key === MY_PALETTE + m.id,
                  swatches: m.colors.map(toCss),
                  onSelect: () => editor.useMyPalette(m.id),
                })),
                '-',
                ...Object.keys(PALETTE_PRESETS)
                  .filter((key) => key !== palette.key && !hidden.includes(key))
                  .map(presetItem),
                '-',
                { label: t('palette.manage'), onSelect: () => openDialog({ type: 'paletteManager' }) },
              ]);
            }}
          >
            <span className="truncate">
              {mine
                ? mine.name
                : palette.key === 'drawing'
                  ? t('palette.drawing')
                  : (PALETTE_PRESETS[palette.key]?.name ?? t('palette.custom'))}
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
      {/* The two colors on the left, like Photoshop, the palette next to them. */}
      <div className="colors-row">
        <ColorChips />
        <div className="colors-palette">
          {palette.key === 'drawing' && !palette.colors.length && (
            <p className="hint">{t('palette.drawingEmpty')}</p>
          )}
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
        </div>
      </div>
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

/** A group selected in the Layers panel: its blend mode (pass-through by default) and opacity. */
function GroupSection({ id }: { id: string }) {
  const t = useT();
  const editor = useEditor();
  const group = useEditorState((s) => s.doc.groups?.find((g) => g.id === id));
  useEditorState((s) => s.revision);
  if (!group) return null;
  return (
    <Section
      id="layer"
      title={t('group.title')}
      aside={
        <>
          <span className="muted truncate">{group.name}</span>
          <IconButton
            icon={group.visible ? 'eye' : 'eyeOff'}
            label={group.visible ? t('layer.hide') : t('layer.show')}
            onClick={() => editor.setGroupVisible(id, !group.visible)}
          />
        </>
      }
    >
      <div className="two-columns">
        {/* Hovering a mode shows it on the canvas; only a click keeps it. */}
        <button
          type="button"
          className="field field-menu"
          aria-haspopup="menu"
          aria-label={t('blend.mode')}
          data-tip={t('blend.mode')}
          onClick={(e) => {
            const item = (m: GroupBlendMode): MenuItem => ({
              label: t(`blend.${m}`),
              checked: (group.blendMode ?? 'pass-through') === m,
              onHover: () => editor.previewGroupBlendMode(id, m),
              onSelect: () => editor.setGroupBlendMode(id, m),
            });
            openMenu(
              e.currentTarget,
              [
                item('pass-through'),
                ...BLEND_MODE_GROUPS.flatMap((modes): MenuItem[] => ['-', ...modes.map(item)]),
              ],
              {
                onHoverEnd: () => editor.previewGroupBlendMode(id, null),
                onClose: () => editor.endBlendPreview(),
              },
            );
          }}
        >
          <span className="truncate">{t(`blend.${group.blendMode ?? 'pass-through'}`)}</span>
          <Icon name="caret" size={12} />
        </button>
        <NumberField
          value={Math.round(group.opacity * 100)}
          min={0}
          max={100}
          label="◐"
          suffix="%"
          ariaLabel={t('common.opacity')}
          scrubHint={t('common.dragToAdjust')}
          sensitivity={2}
          onChange={(v, final) => editor.setGroupOpacity(id, v / 100, final)}
        />
      </div>
    </Section>
  );
}

function LayerSection() {
  const t = useT();
  const editor = useEditor();
  const layer = useEditorState((s) => s.doc.layers[s.doc.activeLayer]);
  const index = useEditorState((s) => s.doc.activeLayer);
  const referenceSelected = useEditorState((s) => s.referenceSelected);
  const selectedGroup = useEditorState((s) => s.selectedGroup);
  useEditorState((s) => s.revision);
  if (referenceSelected) return <ReferenceSection />;
  if (selectedGroup) return <GroupSection id={selectedGroup} />;
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
        {/* Hovering a mode shows it on the canvas; only a click keeps it. */}
        <button
          type="button"
          className="field field-menu"
          aria-haspopup="menu"
          aria-label={t('blend.mode')}
          data-tip={t('blend.mode')}
          onClick={(e) =>
            openMenu(
              e.currentTarget,
              BLEND_MODE_GROUPS.flatMap((group, i): MenuItem[] => [
                ...(i > 0 ? (['-'] as const) : []),
                ...group.map((mode) => ({
                  label: t(`blend.${mode}`),
                  checked: (layer.blendMode ?? 'normal') === mode,
                  onHover: () => editor.previewLayerBlendMode(mode),
                  onSelect: () => editor.setLayerBlendMode(mode),
                })),
              ]),
              {
                onHoverEnd: () => editor.previewLayerBlendMode(null),
                onClose: () => editor.endBlendPreview(),
              },
            )
          }
        >
          <span className="truncate">{t(`blend.${layer.blendMode ?? 'normal'}`)}</span>
          <Icon name="caret" size={12} />
        </button>
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
            onChange={(e) => uiStore.set({ exportFormat: e.target.value as 'png' | 'svg' | 'aseprite' })}
            aria-label={t('export.format')}
          >
            <option value="png">PNG</option>
            <option value="svg">SVG</option>
            <option value="aseprite">Aseprite</option>
          </select>
        </label>
      </Row>
      {/* Aseprite keeps every layer, as layers: that's what it's for. */}
      {format !== 'aseprite' && (
        <Checkbox
          checked={onlyLayer}
          onChange={(v) => uiStore.set({ exportActiveLayer: v })}
          label={t('export.activeLayerOnly')}
        />
      )}
      {format === 'aseprite' && <p className="hint">{t('export.asepriteHint')}</p>}
      {hasBackground(doc) && (!onlyLayer || format === 'aseprite') && (
        <Checkbox
          checked={includeBackground}
          onChange={(v) => uiStore.set({ exportBackground: v })}
          label={t('export.includeBackground')}
        />
      )}
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => void actions.exportImage(format, onlyLayer && format !== 'aseprite')}
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
            <PaletteSection />
            <LayerSection />
            <EffectsSection />
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
