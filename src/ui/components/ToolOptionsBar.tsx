import { RAMP_DIRECTIONS, type RampDirection } from '../../engine/isoRamp';
import { toCss } from '../../engine/color';
import type { ReactNode } from 'react';
import { isBoard } from '../../engine/document';
import { useActions } from '../ActionsContext';
import { ISO_PLANES, type IsoPlane } from '../../engine/isoPlane';
import { TOOLS, type ToolOptions } from '../../engine/tools';
import { CYLINDER_AXES, type CylinderAxis } from '../../engine/tools/types';
import { useT, type MessageKey } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { toolMeta } from '../tools';
import { Checkbox } from './Checkbox';
import { Icon } from './Icon';
import { DITHER_PATTERNS, type DitherPattern } from '../../engine/dither';
import {
  GRADIENT_DITHERS,
  GRADIENT_SHAPES,
  type GradientDither,
  type GradientShape,
} from '../../engine/gradient';
import { GradientEditor } from './GradientEditor';
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
  const view = useEditorState((s) => s.view);
  // The volumes' faces follow the color and the palette when they are shaded from them.
  useEditorState((s) => s.primary);
  useEditorState((s) => s.palette);
  const isoGrid = useEditorState((s) => !!s.doc.isoGrid);
  const actions = useActions();
  const selectedBoards = useEditorState((s) => s.selectedBoards.length);
  const noBoard = useEditorState((s) => !isBoard(s.doc));
  const repeat = useEditorState((s) => s.repeat);
  const extrusion = useEditorState((s) => s.extrude);
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

  // An extrusion being set up takes the bar over too, the same way.
  if (extrusion) {
    return (
      <div className="tool-options" role="toolbar" aria-label={t('extrude.title')}>
        <span className="tool-options-name" data-tip={t('extrude.hint')} tabIndex={0}>
          {t('extrude.title')}
          <Icon name="info" size={14} />
        </span>
        <Row label={t('options.boxHeight')}>
          <NumberField
            value={extrusion.height}
            min={0}
            max={256}
            label="↕"
            suffix="px"
            ariaLabel={t('options.boxHeight')}
            scrubHint={t('common.dragToAdjust')}
            onChange={(v) => editor.setExtrude({ ...extrusion, height: v })}
          />
        </Row>
        <Checkbox
          checked={extrusion.outline}
          onChange={(v) => editor.setExtrude({ ...extrusion, outline: v })}
          label={t('options.boxOutline')}
        />
        <Checkbox
          checked={extrusion.light}
          onChange={(v) => editor.setExtrude({ ...extrusion, light: v })}
          label={t('options.boxLight')}
        />
        <div className="button-row">
          <button type="button" className="btn" data-kbd="Esc" onClick={() => editor.endExtrude(false)}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-kbd="Enter"
            onClick={() => editor.endExtrude(true)}
          >
            {t('common.apply')}
          </button>
        </div>
      </div>
    );
  }

  // A repeat grid being set up takes the bar over until it's applied or canceled.
  if (repeat) {
    const field = (key: keyof typeof repeat, label: string, glyph: string, min: number) => (
      <Row label={label}>
        <NumberField
          value={repeat[key]}
          min={min}
          max={key === 'cols' || key === 'rows' ? 64 : 256}
          label={glyph}
          ariaLabel={label}
          scrubHint={t('common.dragToAdjust')}
          sensitivity={key === 'cols' || key === 'rows' ? 16 : 8}
          onChange={(v) => editor.setRepeat({ ...repeat, [key]: v })}
        />
      </Row>
    );
    return (
      <div className="tool-options" role="toolbar" aria-label={t('repeat.title')}>
        <span className="tool-options-name" data-tip={t('repeat.hint')} tabIndex={0}>
          {t('repeat.title')}
          <Icon name="info" size={14} />
        </span>
        {field('cols', t('repeat.cols'), '⇥', 1)}
        {field('rows', t('repeat.rows'), '⤓', 1)}
        {field('gapX', t('repeat.gapX'), '⇔', -64)}
        {field('gapY', t('repeat.gapY'), '⇕', -64)}
        <div className="button-row">
          <button type="button" className="btn" data-kbd="Esc" onClick={() => editor.endRepeat(false)}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-kbd="Enter"
            onClick={() => editor.endRepeat(true)}
          >
            {t('repeat.apply')}
          </button>
        </div>
      </div>
    );
  }

  const deselect = (
    <button
      type="button"
      className="btn"
      disabled={!hasSelection}
      data-tip={t('menu.deselect')}
      data-kbd="Ctrl+D"
      onClick={() => editor.deselect()}
    >
      {t('menu.deselect')}
    </button>
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
    case 'heart':
      info = !isoGrid ? t('hint.shape') : options.plane !== 'flat' ? t('hint.plane') : t('hint.isoShape');
      body = (
        <>
          {/* On an isometric grid: draw it flat, on a wall, or on the ground. */}
          {isoGrid && (
            <select
              className="select-plain"
              aria-label={t('plane.label')}
              value={options.plane}
              onChange={(e) => editor.setOption('plane', e.target.value as IsoPlane)}
            >
              {ISO_PLANES.map((p) => (
                <option key={p} value={p}>
                  {t(`plane.${p}`)}
                </option>
              ))}
            </select>
          )}
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
          {/* A floor tile: which of its edges get the outline, so tiles side by side share one line. */}
          {isoGrid && tool === 'rect' && (options.plane === 'ground' || options.plane === 'flat') && (
            <div
              className="chips"
              role="group"
              aria-label={t('tileEdges.label')}
              data-tip={t('tileEdges.hint')}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="chip"
                  aria-pressed={options.tileEdges[k]}
                  aria-label={t(`tileEdges.${k}`)}
                  onClick={() =>
                    editor.setOption('tileEdges', { ...options.tileEdges, [k]: !options.tileEdges[k] })
                  }
                >
                  {t(`tileEdges.${k}Short`)}
                </button>
              ))}
            </div>
          )}
        </>
      );
      break;
    case 'box':
    case 'cylinder':
    case 'pyramid':
    case 'ramp': {
      const faces = editor.volumeFaces();
      // Width and depth are in pixels across, two per step of the 2:1 edges. No label in front: the
      // arrow says which, and its tooltip names it, so the faces fit in the bar too.
      const field = (
        key: 'boxWidth' | 'boxDepth' | 'boxHeight',
        glyph: string,
        steps: boolean,
        name: MessageKey = `options.${key}`,
      ) => (
        <NumberField
          value={steps ? options[key] * 2 : options[key]}
          min={0}
          max={steps ? 256 : 128}
          label={glyph}
          suffix={name === 'options.boxLength' ? undefined : 'px'}
          ariaLabel={t(name)}
          scrubHint={`${t(name)} · ${t('common.dragToAdjust')}`}
          onChange={(v) => editor.setOption(key, steps ? Math.round(v / 2) : v)}
        />
      );
      info = t(
        tool === 'box'
          ? 'hint.box'
          : tool === 'cylinder'
            ? 'hint.cylinder'
            : tool === 'ramp'
              ? 'hint.ramp'
              : 'hint.pyramid',
      );
      body = (
        <>
          {/* The box's width and depth, set by the drag; the others take their size from the drag alone. */}
          {(tool === 'box' || tool === 'ramp') && field('boxWidth', '↘', true)}
          {(tool === 'box' || tool === 'ramp') && field('boxDepth', '↙', true)}
          {tool === 'cylinder' && (
            // Standing up, or lying along one of the two axes, for barrels, logs and wheels.
            <select
              className="select-plain"
              aria-label={t('cylinder.axis')}
              data-tip={t('cylinder.axis')}
              value={options.cylinderAxis}
              onChange={(e) => editor.setOption('cylinderAxis', e.target.value as CylinderAxis)}
            >
              {CYLINDER_AXES.map((a) => (
                <option key={a} value={a}>
                  {t(`cylinder.${a}`)}
                </option>
              ))}
            </select>
          )}
          {/* Lying down, the height is the cylinder's length. */}
          {tool === 'cylinder' && options.cylinderAxis !== 'up'
            ? field('boxHeight', '⟷', false, 'options.boxLength')
            : field('boxHeight', '↕', false)}
          {tool === 'ramp' && (
            <>
              {/* Where it rises, and in how many steps (0: a smooth slope). */}
              <select
                className="select-plain"
                aria-label={t('ramp.direction')}
                data-tip={t('ramp.direction')}
                value={options.rampDirection}
                onChange={(e) => editor.setOption('rampDirection', e.target.value as RampDirection)}
              >
                {RAMP_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`ramp.${d}`)}
                  </option>
                ))}
              </select>
              <NumberField
                value={options.rampSteps}
                min={0}
                max={64}
                label="⌗"
                ariaLabel={t('ramp.steps')}
                scrubHint={`${t('ramp.steps')} · ${t('common.dragToAdjust')}`}
                onChange={(v) => editor.setOption('rampSteps', v)}
              />
            </>
          )}
          <Checkbox
            checked={options.boxOutline}
            onChange={set('boxOutline')}
            label={t('options.boxOutline')}
          />
          <Checkbox checked={options.boxLight} onChange={set('boxLight')} label={t('options.boxLight')} />
          <Checkbox checked={options.boxEdges} onChange={set('boxEdges')} label={t('options.boxEdges')} />
          {tool === 'box' && (
            // Bevels, for crates, stone blocks and rounded tiles: along the top, on the front corner.
            <select
              className="select-plain"
              aria-label={t('bevel.label')}
              data-tip={t('bevel.label')}
              value={
                options.boxBevelTop && options.boxBevelSides
                  ? 'both'
                  : options.boxBevelTop
                    ? 'top'
                    : options.boxBevelSides
                      ? 'sides'
                      : 'none'
              }
              onChange={(e) => {
                const v = e.target.value;
                editor.setOption('boxBevelTop', v === 'top' || v === 'both');
                editor.setOption('boxBevelSides', v === 'sides' || v === 'both');
              }}
            >
              {(['none', 'top', 'sides', 'both'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`bevel.${v}`)}
                </option>
              ))}
            </select>
          )}
          <div className="toolbar-divider" />
          {/* The faces: shaded from the color, or picked by hand, one click each with the current color. */}
          <div className="face-colors" role="group" aria-label={t('faces.label')}>
            <span className="muted">{t('faces.label')}</span>
            {(['top', 'left', 'right'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className="face-swatch"
                style={{ background: toCss(faces[f]) }}
                aria-label={t(`faces.${f}`)}
                data-tip={t(`faces.${f}`)}
                data-kbd={t('faces.hint')}
                onClick={() => editor.setVolumeFace(f)}
              />
            ))}
            {options.boxFaces && (
              <IconButton
                icon="rotateLeft"
                label={t('faces.auto')}
                onClick={() => editor.setOption('boxFaces', null)}
              />
            )}
          </div>
        </>
      );
      break;
    }
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
    case 'gradient':
      info = t('hint.gradient');
      body = (
        <>
          <select
            className="select-plain"
            aria-label={t('gradient.shape')}
            value={options.gradientShape}
            onChange={(e) => editor.setOption('gradientShape', e.target.value as GradientShape)}
          >
            {GRADIENT_SHAPES.map((s) => (
              <option key={s} value={s}>
                {t(`gradient.${s}`)}
              </option>
            ))}
          </select>
          <GradientEditor />
          <div className="button-group">
            <IconButton icon="swap" label={t('gradient.reverse')} onClick={() => editor.reverseGradient()} />
            <IconButton icon="rotate" label={t('gradient.rotate')} onClick={() => editor.rotateGradient()} />
          </div>
          <select
            className="select-plain"
            aria-label={t('options.dither')}
            value={options.gradientDither}
            onChange={(e) => editor.setOption('gradientDither', e.target.value as GradientDither)}
          >
            {GRADIENT_DITHERS.map((d) => (
              <option key={d} value={d}>
                {t(`gradient.dither.${d}`)}
              </option>
            ))}
          </select>
          <IconButton
            icon="more"
            className={`icon-btn options-more${options.gradientLayer ? ' has-active' : ''}`}
            label={t('options.more')}
            aria-haspopup="menu"
            onClick={(e) =>
              openMenu(e.currentTarget, [
                {
                  label: t('gradient.wholeLayer'),
                  checked: options.gradientLayer,
                  onSelect: () => editor.setOption('gradientLayer', !options.gradientLayer),
                },
                {
                  label: t('gradient.reset'),
                  disabled: !options.gradientStops,
                  onSelect: () => editor.setOption('gradientStops', null),
                },
              ])
            }
          />
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
    case 'board':
      info = t('hint.board');
      body = (
        <div className="button-row">
          {/* Several boards selected: they line up against the box they fill together. */}
          {selectedBoards > 1 && aligns}
          <button type="button" className="btn" onClick={() => editor.addBoardBeside()}>
            {t('board.new')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={noBoard}
            onClick={() => editor.duplicateBoard(editor.getState().doc.id)}
          >
            {t('board.duplicate')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={noBoard}
            onClick={() => (selectedBoards ? actions.deleteSelectedBoards() : actions.deleteBoard())}
          >
            {t('board.delete')}
          </button>
        </div>
      );
      break;
    case 'select':
    case 'lassoSelect':
    case 'wand':
      info = t(tool === 'select' ? 'hint.select' : tool === 'wand' ? 'hint.wand' : 'hint.lassoSelect');
      body = (
        <>
          {tool === 'wand' && (
            <Checkbox
              checked={options.wandContiguous}
              onChange={set('wandContiguous')}
              label={t('options.wandContiguous')}
            />
          )}
          <div className="button-row">
            <button
              type="button"
              className="btn"
              data-tip={t('menu.selectAll')}
              data-kbd="Ctrl+A"
              onClick={() => editor.selectAll()}
            >
              {t('menu.selectAll')}
            </button>
            {deselect}
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
          {/* Moving a selection: letting go of it is at hand too. */}
          {hasSelection && (
            <>
              {deselect}
              <div className="toolbar-divider" />
            </>
          )}
          {flips}
          <div className="toolbar-divider" />
          {aligns}
        </>
      );
      break;
  }

  if (!body) return null;
  // Tools that paint: symmetry is at hand while drawing, like Aseprite's.
  const paints = TOOLS[tool].editsPixels && tool !== 'move';
  return (
    <div className="tool-options" role="toolbar" aria-label={t(meta.label)}>
      <span className="tool-options-name" data-tip={info} data-kbd={meta.shortcut} tabIndex={info ? 0 : -1}>
        {t(meta.label)}
        {info && <Icon name="info" size={14} />}
      </span>
      {body}
      {paints && (
        <>
          <div className="toolbar-divider" />
          <div className="button-row">
            <IconButton
              icon="mirrorX"
              label={t('display.mirrorX')}
              shortcut="Shift+X"
              pressed={view.mirrorX}
              onClick={() => editor.toggleView('mirrorX')}
            />
            <IconButton
              icon="mirrorY"
              label={t('display.mirrorY')}
              shortcut="Shift+Y"
              pressed={view.mirrorY}
              onClick={() => editor.toggleView('mirrorY')}
            />
          </div>
        </>
      )}
    </div>
  );
}
