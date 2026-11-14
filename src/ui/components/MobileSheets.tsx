import { useRef, type ReactNode } from 'react';
import { alpha, opaque, toCss, toHex, type Color } from '../../engine/color';
import { MY_PALETTE } from '../../engine/editor';
import { PALETTE_PRESETS } from '../../engine/palette';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { MOBILE_TOOL_GROUPS, toolMeta } from '../tools';
import { uiStore, type ColorSlot } from '../uiStore';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

/** How long a press lasts before it picks the secondary color, in ms. */
const LONG_PRESS = 450;

const close = () => uiStore.set({ sheet: null });

/** A sheet that comes up from the bottom of a phone, over the toolbar. A tap on the canvas closes it. */
function Sheet({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className={`mobile-sheet mobile-sheet-${id}`} role="dialog" aria-label={title}>
      <div className="mobile-sheet-header">
        <h2>{title}</h2>
        {aside}
        <IconButton icon="close" label={t('common.close')} onClick={close} />
      </div>
      {children}
    </div>
  );
}

/** Every tool, by what it's for and with its name: what the phone's toolbar has no room for. */
function ToolsSheet() {
  const t = useT();
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  return (
    <Sheet id="tools" title={t('toolbar.label')}>
      {MOBILE_TOOL_GROUPS.map((group) => (
        <div key={group.label} className="mobile-tools-group">
          <h3>{t(group.label)}</h3>
          <div className="mobile-tools">
            {group.tools.map((id) => (
              <button
                key={id}
                type="button"
                className="mobile-tool"
                aria-pressed={tool === id}
                data-tool={id}
                onClick={() => {
                  editor.setTool(id);
                  close();
                }}
              >
                <Icon name={toolMeta(id).icon} size={22} />
                <span>{t(toolMeta(id).label)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/**
 * The file's palette, with swatches a finger can land on: a tap picks the primary color and closes
 * the sheet, a long press picks the secondary one. The two chips open the color picker.
 */
function ColorsSheet() {
  const t = useT();
  const editor = useEditor();
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  const palette = useEditorState((s) => s.palette);
  const myPalettes = useEditorState((s) => s.myPalettes);
  const press = useRef<{ timer: number; long: boolean } | null>(null);

  const mine = myPalettes.find((m) => MY_PALETTE + m.id === palette.key);
  const name = mine
    ? mine.name
    : palette.key === 'drawing'
      ? t('palette.drawing')
      : (PALETTE_PRESETS[palette.key]?.name ?? t('palette.custom'));
  const edit = (slot: ColorSlot) => uiStore.set({ sheet: null, picker: { slot, top: 120 } });
  const chip = (slot: ColorSlot, color: Color, label: string) => (
    <button type="button" className={`mobile-chip is-${slot}`} aria-label={label} onClick={() => edit(slot)}>
      <i style={{ background: toCss(color) }} />
    </button>
  );
  const current = (c: Color, of: Color) => alpha(of) > 0 && opaque(of) === c;

  return (
    <Sheet id="colors" title={t('section.colors')} aside={<span className="muted truncate">{name}</span>}>
      <div className="mobile-swatches">
        {palette.colors.map((c) => (
          <button
            key={c}
            type="button"
            className={`mobile-swatch${current(c, primary) ? ' is-primary' : ''}${
              current(c, secondary) ? ' is-secondary' : ''
            }`}
            style={{ background: toCss(c) }}
            aria-label={toHex(c).slice(1).toUpperCase()}
            onPointerDown={() => {
              const p = { timer: 0, long: false };
              p.timer = window.setTimeout(() => {
                p.long = true;
                editor.setColor('secondary', c);
              }, LONG_PRESS);
              press.current = p;
            }}
            onPointerUp={() => clearTimeout(press.current?.timer)}
            onPointerLeave={() => clearTimeout(press.current?.timer)}
            onPointerCancel={() => clearTimeout(press.current?.timer)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (!press.current?.long) {
                editor.setColor('primary', c);
                close();
              }
              press.current = null;
            }}
          />
        ))}
      </div>
      <div className="mobile-color-edit">
        <div className="mobile-chips">
          {chip('primary', primary, t('color.primary'))}
          {chip('secondary', secondary, t('color.secondary'))}
        </div>
        <span className="mobile-hex">{toHex(primary).toUpperCase()}</span>
        <button type="button" className="btn" onClick={() => edit('primary')}>
          {t('mobile.editColor')}
        </button>
      </div>
      <p className="mobile-sheet-hint muted">
        <Icon name="picker" size={16} />
        {t('mobile.pickHint')}
      </p>
    </Sheet>
  );
}

/** The phone's sheets for the tools and the colors, one at a time, opened from its toolbar. */
export function MobileSheets() {
  const sheet = uiStore.use((s) => s.sheet);
  if (sheet === 'tools') return <ToolsSheet />;
  if (sheet === 'colors') return <ColorsSheet />;
  return null;
}
