import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  adjustColor,
  alpha,
  NO_ADJUSTMENT,
  opaque,
  toCss,
  toHex,
  withAlpha,
  type Color,
  type ColorAdjustment,
} from '../../engine/color';
import { hasBackground } from '../../engine/document';
import { frameCount } from '../../engine/frames';
import type { ColorMap } from '../../engine/editor';
import { outlinePixels, type OutlineOptions } from '../../engine/outline';
import { PALETTE_PRESETS, presetColors, remapTable, type RemapMode } from '../../engine/palette';
import { useT, type MessageKey } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { uiStore, type AdjustTab } from '../uiStore';
import { Checkbox } from './Checkbox';
import { IconButton } from './IconButton';

const close = () => uiStore.set({ adjust: false });

type Tab = AdjustTab;
type Outline = Omit<OutlineOptions, 'color'>;
const NO_OUTLINE: Outline = { place: 'outside', corners: false };

/** Kinds of adjustments, each a tab of the panel. */
const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'colors', label: 'adjust.colors' },
  { id: 'remap', label: 'adjust.remap' },
  { id: 'outline', label: 'adjust.outline' },
];

const SLIDERS: { key: keyof ColorAdjustment; label: MessageKey; min: number; max: number; unit: string }[] = [
  { key: 'hue', label: 'adjust.hue', min: -180, max: 180, unit: '°' },
  { key: 'saturation', label: 'adjust.saturation', min: 0, max: 200, unit: '%' },
  { key: 'brightness', label: 'adjust.brightness', min: 0, max: 200, unit: '%' },
];

/** Remap settings: the target palette ('file' for the file's own), how to match, how many colors. */
interface Remap {
  target: string;
  mode: RemapMode;
  count: number;
  replacePalette: boolean;
  /** The file's background goes to the palette too. */
  background: boolean;
}

const NO_REMAP = { target: 'file', mode: 'nearest', replacePalette: false, background: true } as const;

/**
 * The Adjustments panel, floating: changes to the existing pixels of the active layer or all
 * layers (limited to the selection if any), on every frame of an animation or the shown one, with a
 * live preview on the canvas. Applying makes one undo step. Its tabs are the kinds of adjustments: Colors shifts hue, saturation and brightness,
 * Remap moves the drawing to another palette, Outline draws a 1px line around (or along) it.
 */
export function ColorAdjustPanel() {
  const open = uiStore.use((s) => s.adjust);
  return open ? <Panel /> : null;
}

/** The color change and the palette change (if any) of the current settings. */
function changeFor(
  tab: Tab,
  adj: ColorAdjustment,
  palette: boolean,
  remap: Remap,
  target: Color[],
  used: Map<Color, number>,
): { map: ColorMap; palette: ((colors: Color[]) => Color[]) | null; background: boolean } {
  if (tab === 'colors')
    return {
      map: (c) => adjustColor(c, adj),
      palette: palette ? (colors) => colors.map((c) => adjustColor(c, adj)) : null,
      background: false,
    };
  const { table, colors } = remapTable(used, target, remap.mode, remap.count);
  return {
    map: (c) => (alpha(c) ? withAlpha(table.get(opaque(c)) ?? opaque(c), alpha(c)) : c),
    palette: remap.replacePalette ? () => colors : null,
    background: remap.background,
  };
}

function Panel() {
  const t = useT();
  const editor = useEditor();
  const hasSelection = useEditorState((s) => s.selection !== null);
  // Its color as the panel opened (the remap previews change it), only when it shows.
  const [background] = useState(() => {
    const doc = editor.getState().doc;
    return hasBackground(doc) ? doc.background : 0;
  });
  const filePalette = useEditorState((s) => s.palette.colors);
  const rightWidth = uiStore.use((s) => (s.uiHidden ? 0 : s.panelWidths.right));
  const primary = useEditorState((s) => s.primary);
  const [tab, setTab] = useState<Tab>(() => uiStore.get().adjustTab);
  // Opened again on another tab (Shift+O while it's open): go there.
  const askedTab = uiStore.use((s) => s.adjustTab);
  useEffect(() => setTab(askedTab), [askedTab]);
  const [outline, setOutline] = useState<Outline>(NO_OUTLINE);
  const [adj, setAdj] = useState<ColorAdjustment>(NO_ADJUSTMENT);
  const [allLayers, setAllLayers] = useState(() => uiStore.get().adjustScope === 'all');
  // An animation is adjusted as a whole unless asked otherwise.
  const animated = useEditorState((s) => frameCount(s.doc) > 1);
  const [allFrames, setAllFrames] = useState(true);
  const [palette, setPalette] = useState(false);
  // The file's palette as it was when the panel opened (previews may change the live one).
  const [ownPalette] = useState(filePalette);
  const [remap, setRemap] = useState<Remap>({ ...NO_REMAP, count: ownPalette.length });
  // A selection limits the remap to its pixels: the background stays as it is.
  const remapBackground = remap.background && !!background && !hasSelection;
  const target = useMemo(
    () => (remap.target === 'file' ? ownPalette : presetColors(remap.target)),
    [remap.target, ownPalette],
  );

  // Starts (or restarts on scope change) the adjustment; leaving without applying cancels it.
  useEffect(() => {
    editor.beginAdjust(allLayers, allFrames);
    return () => editor.cancelAdjust();
  }, [editor, allLayers, allFrames]);
  // The outline is in the primary color: picking another one in the palette updates it live.
  const outlineChange = (
    base: Uint32Array,
    width: number,
    rect: { x: number; y: number; w: number; h: number },
  ) => outlinePixels(base, width, rect, { ...outline, color: primary });
  useEffect(() => {
    if (tab === 'outline') return editor.previewChange(outlineChange);
    const change = changeFor(tab, adj, palette, remap, target, editor.adjustedColors(remapBackground));
    editor.previewMap(change.map, change.palette, change.background && remapBackground);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- outlineChange follows outline and primary
  }, [editor, tab, adj, palette, remap, target, allLayers, allFrames, outline, primary, remapBackground]);
  // Switching files cancels the adjustment in the editor: close the panel too.
  useEffect(() => editor.subscribe(() => !editor.isAdjusting && close()), [editor]);

  const apply = () => {
    if (tab === 'outline') editor.applyChange(outlineChange);
    else {
      const change = changeFor(tab, adj, palette, remap, target, editor.adjustedColors(remapBackground));
      editor.applyMap(change.map, change.palette, change.background && remapBackground);
    }
    close();
  };
  const set = (key: keyof ColorAdjustment, value: number) => setAdj((a) => ({ ...a, [key]: value }));
  const reset = () => {
    if (tab === 'colors') setAdj(NO_ADJUSTMENT);
    else if (tab === 'outline') setOutline(NO_OUTLINE);
    else setRemap({ ...NO_REMAP, count: ownPalette.length });
  };

  return (
    <div
      className="popover adjust-panel"
      style={{ right: rightWidth + 12 } as CSSProperties}
      role="dialog"
      aria-label={t('adjust.title')}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) apply();
      }}
    >
      <div className="popover-header">
        <span>{t('adjust.title')}</span>
        <IconButton icon="close" label={t('common.close')} onClick={close} />
      </div>
      <div className="panel-tabs adjust-tabs" role="tablist" aria-label={t('adjust.title')}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className="panel-tab"
            onClick={() => setTab(x.id)}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      <div className="popover-body">
        {tab === 'colors' ? (
          <>
            {SLIDERS.map(({ key, label, min, max, unit }) => (
              <div key={key} className="adjust-row">
                <label className="adjust-label">
                  <span>{t(label)}</span>
                  <span className="adjust-value">
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={adj[key]}
                      aria-label={t(label)}
                      onChange={(e) => set(key, Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
                    />
                    {unit}
                  </span>
                </label>
                <input
                  type="range"
                  className={`adjust-slider adjust-${key}`}
                  min={min}
                  max={max}
                  value={adj[key]}
                  aria-label={t(label)}
                  onChange={(e) => set(key, Number(e.target.value))}
                  onDoubleClick={() => set(key, NO_ADJUSTMENT[key])}
                />
              </div>
            ))}
          </>
        ) : tab === 'outline' ? (
          <>
            <div className="chips" role="radiogroup" aria-label={t('adjust.outline')}>
              {(['outside', 'inside'] as const).map((place) => (
                <button
                  key={place}
                  type="button"
                  className="chip"
                  role="radio"
                  aria-checked={outline.place === place}
                  aria-pressed={outline.place === place}
                  onClick={() => setOutline((o) => ({ ...o, place }))}
                >
                  {t(place === 'outside' ? 'outline.outside' : 'outline.inside')}
                </button>
              ))}
            </div>
            <div className="chips" role="radiogroup" aria-label={t('outline.square')}>
              {[false, true].map((corners) => (
                <button
                  key={String(corners)}
                  type="button"
                  className="chip"
                  role="radio"
                  aria-checked={outline.corners === corners}
                  aria-pressed={outline.corners === corners}
                  data-tip={t(corners ? 'outline.squareHint' : 'outline.roundHint')}
                  onClick={() => setOutline((o) => ({ ...o, corners }))}
                >
                  {t(corners ? 'outline.square' : 'outline.round')}
                </button>
              ))}
            </div>
            <p className="outline-color">
              <i style={{ background: toCss(primary) }} aria-hidden="true" />
              <span>{toHex(primary).slice(1).toUpperCase()}</span>
              <span className="muted">{t('outline.color')}</span>
            </p>
          </>
        ) : (
          <>
            <label className="adjust-label">
              <span>{t('remap.palette')}</span>
              <select
                className="select-plain"
                value={remap.target}
                onChange={(e) => {
                  const key = e.target.value;
                  const size = key === 'file' ? ownPalette.length : presetColors(key).length;
                  setRemap((r) => ({ ...r, target: key, count: size }));
                }}
                aria-label={t('remap.palette')}
              >
                <option value="file">{t('remap.filePalette')}</option>
                {Object.entries(PALETTE_PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="remap-preview" aria-hidden="true">
              {target.map((c) => (
                <i key={c} style={{ background: toCss(c) }} />
              ))}
            </div>
            <div className="chips" role="radiogroup" aria-label={t('remap.match')}>
              {(['nearest', 'lightness'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  role="radio"
                  aria-checked={remap.mode === m}
                  aria-pressed={remap.mode === m}
                  data-tip={t(m === 'nearest' ? 'remap.nearestHint' : 'remap.lightnessHint')}
                  onClick={() => setRemap((r) => ({ ...r, mode: m }))}
                >
                  {t(m === 'nearest' ? 'remap.nearest' : 'remap.lightness')}
                </button>
              ))}
            </div>
            <div className="adjust-row">
              <label className="adjust-label">
                <span>{t('remap.count')}</span>
                <span className="adjust-value">
                  <input
                    type="number"
                    min={1}
                    max={target.length}
                    value={Math.min(remap.count, target.length)}
                    aria-label={t('remap.count')}
                    onChange={(e) =>
                      setRemap((r) => ({
                        ...r,
                        count: Math.max(1, Math.min(target.length, Number(e.target.value) || 1)),
                      }))
                    }
                  />
                </span>
              </label>
              <input
                type="range"
                className="adjust-slider"
                min={1}
                max={target.length}
                value={Math.min(remap.count, target.length)}
                aria-label={t('remap.count')}
                onChange={(e) => setRemap((r) => ({ ...r, count: Number(e.target.value) }))}
              />
            </div>
          </>
        )}
        <div className="chips" role="radiogroup">
          {[false, true].map((all) => (
            <button
              key={String(all)}
              type="button"
              className="chip"
              role="radio"
              aria-checked={allLayers === all}
              aria-pressed={allLayers === all}
              onClick={() => setAllLayers(all)}
            >
              {t(all ? 'adjust.allLayers' : 'adjust.layer')}
            </button>
          ))}
        </div>
        {animated && <Checkbox checked={allFrames} onChange={setAllFrames} label={t('adjust.allFrames')} />}
        {tab === 'colors' ? (
          <Checkbox checked={palette} onChange={setPalette} label={t('adjust.palette')} />
        ) : tab === 'outline' ? null : (
          <>
            <Checkbox
              checked={remap.replacePalette}
              onChange={(v) => setRemap((r) => ({ ...r, replacePalette: v }))}
              label={t('remap.replacePalette')}
            />
            {!!background && !hasSelection && (
              <Checkbox
                checked={remap.background}
                onChange={(v) => setRemap((r) => ({ ...r, background: v }))}
                label={t('remap.background')}
              />
            )}
          </>
        )}
        {hasSelection && <p className="hint">{t('adjust.selectionOnly')}</p>}
        <div className="adjust-actions">
          <button type="button" className="btn" onClick={reset}>
            {t('common.reset')}
          </button>
          <span className="adjust-spacer" />
          <button type="button" className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={apply}>
            {t('common.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
