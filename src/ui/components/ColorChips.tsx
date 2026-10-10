import { alpha, toCss, toHex } from '../../engine/color';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { uiStore } from '../uiStore';
import { Icon } from './Icon';

/**
 * The primary and secondary colors as two overlapping chips, like Photoshop: the one in front is
 * what the tools draw with (click it for its picker), a click on the one behind brings it to the
 * front, and the arrows in the corner swap them (X).
 */
export function ColorChips() {
  const t = useT();
  const editor = useEditor();
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  const editing = uiStore.use((s) => s.picker?.slot === 'primary');
  const chip = (color: number) => ({
    background: alpha(color) ? toCss(color) : undefined,
  });
  return (
    <div className="color-chips">
      <button
        type="button"
        className={`color-chips-back${alpha(secondary) ? '' : ' is-clear'}`}
        style={chip(secondary)}
        aria-label={`${t('color.secondary')} ${toHex(secondary)}. ${t('color.bringFront')}`}
        data-tip={t('color.bringFront')}
        onClick={() => editor.swapColors()}
      />
      <button
        type="button"
        className={`color-chips-front${alpha(primary) ? '' : ' is-clear'}${editing ? ' is-editing' : ''}`}
        style={chip(primary)}
        aria-label={`${t('color.primary')} ${toHex(primary)}. ${t('color.choose')}`}
        data-tip={`${t('color.primary')} · ${toHex(primary).toUpperCase()}`}
        onClick={(e) =>
          uiStore.set((s) => ({
            picker:
              s.picker?.slot === 'primary'
                ? null
                : { slot: 'primary', top: e.currentTarget.getBoundingClientRect().top },
          }))
        }
      />
      <button
        type="button"
        className="color-chips-swap"
        aria-label={t('color.swap')}
        data-tip={t('color.swap')}
        data-kbd="X"
        onClick={() => editor.swapColors()}
      >
        <Icon name="swap" size={12} />
      </button>
    </div>
  );
}
