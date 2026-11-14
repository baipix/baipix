import { useEffect, useState } from 'react';
import { toCss } from '../../engine/color';
import type { ToolId } from '../../engine/tools';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { MOBILE_PINNED_TOOLS, toolMeta } from '../tools';
import { uiStore } from '../uiStore';
import { IconButton } from './IconButton';

/**
 * A phone's toolbar, under the thumb: the colors, the tools used all the time, the last other tool
 * taken, and a button for all the tools. Nothing scrolls. Undo and Redo float above it.
 */
export function MobileToolbar() {
  const t = useT();
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  const canUndo = useEditorState((s) => s.canUndo);
  const canRedo = useEditorState((s) => s.canRedo);
  const sheet = uiStore.use((s) => s.sheet);
  // The last place keeps the tool taken from the sheet, so going back to it is one tap.
  const [last, setLast] = useState<ToolId>('move');
  useEffect(() => {
    if (!MOBILE_PINNED_TOOLS.includes(tool)) setLast(tool);
  }, [tool]);
  const toggle = (which: 'tools' | 'colors') =>
    uiStore.set((s) => ({ sheet: s.sheet === which ? null : which }));
  const button = (id: ToolId) => {
    const meta = toolMeta(id);
    return (
      <IconButton
        key={id}
        className="tool-btn"
        icon={meta.icon}
        iconSize={20}
        label={t(meta.label)}
        pressed={tool === id}
        data-tool={id}
        onClick={() => editor.setTool(id)}
      />
    );
  };
  return (
    <>
      <div className="mobile-history">
        <IconButton
          className="tool-btn"
          icon="undo"
          iconSize={20}
          label={t('menu.undo')}
          disabled={!canUndo}
          onClick={() => editor.undo()}
        />
        <IconButton
          className="tool-btn"
          icon="redo"
          iconSize={20}
          label={t('menu.redo')}
          disabled={!canRedo}
          onClick={() => editor.redo()}
        />
      </div>
      <div className="mobile-toolbar" role="toolbar" aria-label={t('toolbar.label')}>
        <button
          type="button"
          className="mobile-chips"
          aria-label={t('section.colors')}
          aria-pressed={sheet === 'colors'}
          aria-haspopup="dialog"
          onClick={() => toggle('colors')}
        >
          <i className="mobile-chip is-secondary" style={{ background: toCss(secondary) }} />
          <i className="mobile-chip is-primary" style={{ background: toCss(primary) }} />
        </button>
        <div className="toolbar-divider" />
        {MOBILE_PINNED_TOOLS.map(button)}
        {button(last)}
        <div className="toolbar-divider" />
        <IconButton
          className="tool-btn"
          icon="more"
          iconSize={20}
          label={t('mobile.allTools')}
          pressed={sheet === 'tools'}
          aria-haspopup="dialog"
          onClick={() => toggle('tools')}
        />
      </div>
    </>
  );
}
