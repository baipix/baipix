import type { ReactNode } from 'react';
import type { ToolOptions } from '../../engine/tools';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { toolMeta } from '../tools';
import { Checkbox } from './Checkbox';
import { Icon } from './Icon';
import { DITHER_PATTERNS, type DitherPattern } from '../../engine/dither';
import { IconButton } from './IconButton';
import { openMenu, type MenuItem } from './Menu';
import { NumberField } from './NumberField';
import { Row } from './Section';

/** Options of the active tool, in a small bar right above the toolbar. Hidden for tools without any. */
/** Options of the "…" menu, with labels that say what they do on their own. */
/** The six ways to align on the canvas, with Figma's shortcuts. */
export const ALIGNS = [
  { to: 'left', icon: 'alignLeft', label: 'align.left', shortcut: 'Alt+A' },
  { to: 'centerX', icon: 'alignCenterX', label: 'align.centerX', shortcut: 'Alt+H' },
  { to: 'right', icon: 'alignRight', label: 'align.right', shortcut: 'Alt+D' },
  { to: 'top', icon: 'alignTop', label: 'align.top', shortcut: 'Alt+W' },
  { to: 'centerY', icon: 'alignCenterY', label: 'align.centerY', shortcut: 'Alt+V' },
  { to: 'bottom', icon: 'alignBottom', label: 'align.bottom', shortcut: 'Alt+S' },
] as const;

const MORE_LABELS = {
  lassoFill: 'options.lassoFillMenu',
  blend: 'options.blendMenu',
} as const;

export function ToolOptionsBar() {
  const t = useT();
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const options = useEditorState((s) => s.options);
  const hasSelection = useEditorState((s) => s.selection !== null);
  const brushes = useEditorState((s) => s.brushes);
  const meta = toolMeta(tool);
  const set =
    <K extends keyof ToolOptions>(k: K) =>
    (v: ToolOptions[K]) =>
      editor.setOption(k, v);

  const size = (
    <>
      <Row label={t('options.size')}>
        <NumberField
          value={options.size}
          min={1}
          max={16}
          label="⇔"
          suffix="px"
          ariaLabel={t('options.size')}
          scrubHint={t('common.dragToAdjust')}
          sensitivity={8}
          onChange={(v) => editor.setOption('size', v)}
        />
      </Row>
      {/* The tip's shape, next to its size: it only shows from 3px. */}
      <div className="button-group" role="group" aria-label={t('options.tip')}>
        <IconButton
          icon="rect"
          label={t('options.tipSquare')}
          pressed={!options.roundTip}
          onClick={() => editor.setOption('roundTip', false)}
        />
        <IconButton
          icon="ellipse"
          label={t('options.tipRound')}
          pressed={options.roundTip}
          onClick={() => editor.setOption('roundTip', true)}
        />
      </div>
    </>
  );
  const stabilizer = (
    <Row label={t('options.stabilizer')}>
      <NumberField
        value={options.stabilizer}
        min={0}
        max={10}
        label="≈"
        ariaLabel={t('options.stabilizer')}
        scrubHint={t('options.stabilizerHint')}
        sensitivity={10}
        onChange={(v) => editor.setOption('stabilizer', v)}
      />
    </Row>
  );
  /**
   * Less common on/off options go in a "…" menu, to keep the bar short. A dot on the button says
   * one of them is on, so it's never forgotten.
   */
  /** Custom brushes: the normal tip or one of them, make one from the selection, its colors, delete it. */
  const brushItems = (): MenuItem[] => {
    const active = brushes.find((b) => b.id === options.customBrush);
    return [
      {
        label: t('brush.normal'),
        checked: !active,
        onSelect: () => editor.setOption('customBrush', null),
      },
      ...brushes.map((b) => ({
        label: t('brush.item', { name: b.name, w: b.width, h: b.height }),
        checked: b.id === active?.id,
        onSelect: () => editor.setOption('customBrush', b.id),
      })),
      {
        label: t('brush.fromSelection'),
        disabled: !hasSelection,
        onSelect: () => editor.brushFromSelection(),
      },
      ...(active
        ? [
            {
              label: t('brush.ownColors'),
              checked: options.brushOwnColors,
              onSelect: () => editor.setOption('brushOwnColors', !options.brushOwnColors),
            },
            {
              label: t('brush.delete', { name: active.name }),
              onSelect: () => editor.deleteBrush(active.id),
            },
          ]
        : []),
      '-' as const,
    ];
  };
  const ditherItems = (): MenuItem[] => [
    { label: t('dither.none'), checked: !options.dither, onSelect: () => editor.setOption('dither', false) },
    ...DITHER_PATTERNS.map((p) => ({
      label: t(`dither.${p}`),
      checked: options.dither && options.ditherPattern === p,
      onSelect: () => {
        editor.setOption('ditherPattern', p);
        editor.setOption('dither', true);
      },
    })),
    '-' as const,
  ];
  const more = (keys: ('dither' | 'lassoFill' | 'blend')[], withBrushes = false) => {
    const anyOn = keys.some((k) => options[k]) || (withBrushes && !!options.customBrush);
    return (
      <IconButton
        icon="more"
        className={`icon-btn options-more${anyOn ? ' has-active' : ''}`}
        label={t('options.more')}
        aria-haspopup="menu"
        onClick={(e) =>
          openMenu(e.currentTarget, [
            // Dithering: off, or one of the patterns, picked like a radio group.
            ...(withBrushes ? brushItems() : []),
            ...(keys.includes('dither') ? ditherItems() : []),
            ...keys
              .filter((k) => k !== 'dither')
              .map((k) => ({
                label: t(MORE_LABELS[k]),
                checked: options[k],
                onSelect: () => editor.setOption(k, !options[k]),
              })),
          ])
        }
      />
    );
  };
  // Help texts go in a tooltip on the tool name, to keep the bar short.
  let info: string | undefined;
  const flips = (
    <div className="button-group">
      <IconButton
        icon="rotateLeft"
        label={t('menu.rotateLeft')}
        shortcut="Alt+Shift+R"
        className="icon-btn large"
        onClick={() => editor.rotate(false)}
      />
      <IconButton
        icon="rotate"
        label={t('menu.rotate')}
        shortcut="Shift+R"
        className="icon-btn large"
        onClick={() => editor.rotate()}
      />
      <IconButton
        icon="flipH"
        label={t('menu.flipH')}
        className="icon-btn large"
        onClick={() => editor.flip(true)}
      />
      <IconButton
        icon="flipV"
        label={t('menu.flipV')}
        className="icon-btn large"
        onClick={() => editor.flip(false)}
      />
    </div>
  );

  // Against the canvas's edges, or in its middle: the drawn pixels of the selection, or the layer.
  const aligns = (
    <div className="button-group">
      {ALIGNS.map(({ to, icon, label, shortcut }) => (
        <IconButton
          key={to}
          icon={icon}
          label={t(label)}
          shortcut={shortcut}
          className="icon-btn large"
          onClick={() => editor.align(to)}
        />
      ))}
    </div>
  );

  let body: ReactNode;
  switch (tool) {
    case 'pencil':
      info = t('hint.pencil');
      body = (
        <>
          {size}
          {stabilizer}
          <Checkbox
            checked={options.pixelPerfect}
            onChange={set('pixelPerfect')}
            label={t('options.pixelPerfect')}
          />
          {more(['dither', 'lassoFill', 'blend'], true)}
        </>
      );
      break;
    case 'lassoFill':
      info = t('hint.lassoFill');
      body = (
        <>
          {size}
          {stabilizer}
          {more(['dither', 'blend'], true)}
        </>
      );
      break;
    case 'eraser':
      info = t('hint.eraser');
      body = (
        <>
          {size}
          {stabilizer}
        </>
      );
      break;
    case 'line':
      info = t('hint.line');
      body = <>{size}</>;
      break;
    case 'rect':
    case 'roundRect':
    case 'ellipse':
    case 'triangle':
    case 'star':
      info = t('hint.shape');
      body = (
        <>
          {size}
          {tool === 'roundRect' && (
            <Row label={t('options.radius')}>
              <NumberField
                value={options.radius}
                min={1}
                max={32}
                label="◜"
                suffix="px"
                ariaLabel={t('options.radius')}
                scrubHint={t('common.dragToAdjust')}
                sensitivity={8}
                onChange={(v) => editor.setOption('radius', v)}
              />
            </Row>
          )}
          <Checkbox checked={options.filled} onChange={set('filled')} label={t('options.filled')} />
        </>
      );
      break;
    case 'bucket':
      info = options.contiguous ? t('hint.bucketContiguous') : t('hint.bucketGlobal');
      body = (
        <>
          <Checkbox
            checked={options.contiguous}
            onChange={set('contiguous')}
            label={t('options.contiguous')}
          />
          <select
            className="select-plain"
            aria-label={t('options.dither')}
            value={options.dither ? options.ditherPattern : 'none'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'none') return editor.setOption('dither', false);
              editor.setOption('ditherPattern', v as DitherPattern);
              editor.setOption('dither', true);
            }}
          >
            <option value="none">{t('dither.none')}</option>
            {DITHER_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {t(`dither.${p}`)}
              </option>
            ))}
          </select>
          <div className="button-row">
            <button type="button" className="btn" data-kbd="Shift+Del" onClick={() => editor.fill()}>
              {hasSelection ? t('menu.fillSelection') : t('menu.fillLayer')}
            </button>
          </div>
        </>
      );
      break;
    case 'shade':
    case 'lighten': {
      const how = { ramp: 'hint.shadeRamp', palette: 'hint.shadePalette', free: 'hint.shadeFree' } as const;
      info = t(tool === 'shade' ? 'hint.shade' : 'hint.lighten', { how: t(how[options.shadeMode]) });
      body = (
        <>
          {size}
          <label className="field" data-tip={t('options.shadeMode')}>
            <select
              value={options.shadeMode}
              onChange={(e) => editor.setOption('shadeMode', e.target.value as ToolOptions['shadeMode'])}
              aria-label={t('options.shadeMode')}
            >
              <option value="ramp">{t('shade.ramp')}</option>
              <option value="palette">{t('shade.palette')}</option>
              <option value="free">{t('shade.free')}</option>
            </select>
          </label>
          {options.shadeMode === 'free' && (
            <>
              <Row label={t('options.strength')}>
                <NumberField
                  value={options.shadeStrength}
                  min={1}
                  max={3}
                  label="⇔"
                  ariaLabel={t('options.strength')}
                  scrubHint={t('common.dragToAdjust')}
                  sensitivity={14}
                  onChange={(v) => editor.setOption('shadeStrength', v)}
                />
              </Row>
              <Checkbox
                checked={options.shadeHueShift}
                onChange={set('shadeHueShift')}
                label={t('options.hueShift')}
              />
            </>
          )}
        </>
      );
      break;
    }
    case 'blur':
      info = options.blurSnap ? t('hint.blurSnap') : t('hint.blurFree');
      body = (
        <>
          {size}
          <Row label={t('options.strength')}>
            <NumberField
              value={options.blurStrength}
              min={1}
              max={3}
              label="⇔"
              ariaLabel={t('options.strength')}
              scrubHint={t('common.dragToAdjust')}
              sensitivity={14}
              onChange={(v) => editor.setOption('blurStrength', v)}
            />
          </Row>
          <Checkbox checked={options.blurSnap} onChange={set('blurSnap')} label={t('options.blurSnap')} />
        </>
      );
      break;
    case 'spray':
      info = t('hint.spray');
      body = (
        <>
          <Row label={t('options.size')}>
            <NumberField
              value={options.spraySize}
              min={2}
              max={64}
              label="⇔"
              suffix="px"
              ariaLabel={t('options.size')}
              scrubHint={t('common.dragToAdjust')}
              sensitivity={4}
              onChange={(v) => editor.setOption('spraySize', v)}
            />
          </Row>
          <Row label={t('options.density')}>
            <NumberField
              value={options.sprayDensity}
              min={1}
              max={100}
              label="◐"
              suffix="%"
              ariaLabel={t('options.density')}
              scrubHint={t('common.dragToAdjust')}
              sensitivity={2}
              onChange={(v) => editor.setOption('sprayDensity', v)}
            />
          </Row>
          <Checkbox
            checked={options.sprayOpacity}
            onChange={set('sprayOpacity')}
            label={t('options.sprayOpacity')}
          />
          {more(['blend'])}
        </>
      );
      break;
    case 'jumble':
      info = t('hint.jumble');
      body = (
        <>
          <Row label={t('options.size')}>
            <NumberField
              value={options.jumbleSize}
              min={2}
              max={32}
              label="⇔"
              suffix="px"
              ariaLabel={t('options.size')}
              scrubHint={t('common.dragToAdjust')}
              sensitivity={6}
              onChange={(v) => editor.setOption('jumbleSize', v)}
            />
          </Row>
          <Row label={t('options.strength')}>
            <NumberField
              value={options.jumbleStrength}
              min={1}
              max={3}
              label="⇔"
              ariaLabel={t('options.strength')}
              scrubHint={t('common.dragToAdjust')}
              sensitivity={14}
              onChange={(v) => editor.setOption('jumbleStrength', v)}
            />
          </Row>
        </>
      );
      break;
    case 'liquify':
      info = t('hint.liquify');
      body = (
        <>
          <div className="chips" role="radiogroup" aria-label={t('liquify.mode')}>
            {(['push', 'expand', 'shrink'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                role="radio"
                aria-checked={options.liquifyMode === m}
                aria-pressed={options.liquifyMode === m}
                onClick={() => editor.setOption('liquifyMode', m)}
              >
                {t(`liquify.${m}`)}
              </button>
            ))}
          </div>
          <Row label={t('options.size')}>
            <NumberField
              value={options.liquifySize}
              min={2}
              max={64}
              label="⇔"
              suffix="px"
              ariaLabel={t('options.size')}
              scrubHint={t('common.dragToAdjust')}
              sensitivity={4}
              onChange={(v) => editor.setOption('liquifySize', v)}
            />
          </Row>
          <Row label={t('options.strength')}>
            <NumberField
              value={options.liquifyStrength}
              min={1}
              max={100}
              label="◐"
              suffix="%"
              ariaLabel={t('options.strength')}
              scrubHint={t('common.dragToAdjust')}
              sensitivity={2}
              onChange={(v) => editor.setOption('liquifyStrength', v)}
            />
          </Row>
        </>
      );
      break;
    case 'picker':
      info = t('hint.picker');
      body = null;
      break;
    case 'select':
      info = t('hint.select');
      body = (
        <>
          <div className="button-row">
            <button type="button" className="btn" onClick={() => editor.selectAll()}>
              {t('menu.selectAll')}
            </button>
            <button type="button" className="btn" disabled={!hasSelection} onClick={() => editor.deselect()}>
              {t('menu.deselect')}
            </button>
          </div>
          {flips}
          <div className="toolbar-divider" />
          {aligns}
        </>
      );
      break;
    case 'move':
      info = hasSelection ? t('hint.moveSelection') : t('hint.moveLayer');
      body = (
        <>
          {flips}
          <div className="toolbar-divider" />
          {aligns}
        </>
      );
      break;
  }

  if (!body) return null;
  return (
    <div className="tool-options" role="toolbar" aria-label={t(meta.label)}>
      <span className="tool-options-name" data-tip={info} data-kbd={meta.shortcut} tabIndex={info ? 0 : -1}>
        {t(meta.label)}
        {info && <Icon name="info" size={14} />}
      </span>
      {body}
    </div>
  );
}
