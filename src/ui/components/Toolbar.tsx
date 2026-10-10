import { Fragment, useEffect, useState } from 'react';
import type { ToolId } from '../../engine/tools';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { SHAPES, TOOL_GROUPS, toolMeta, type ToolMeta } from '../tools';
import { IconButton } from './IconButton';
import { openMenu } from './Menu';

/** One button for a family of tools (shapes, selections): it picks the last one used, the caret opens the list. */
function SplitToolButton({ tools, label }: { tools: ToolMeta[]; label: string }) {
  const t = useT();
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const ids = tools.map((x) => x.id);
  const [last, setLast] = useState<ToolId>(tools[0].id);
  useEffect(() => {
    if (tools.some((x) => x.id === tool)) setLast(tool);
  }, [tool, tools]);
  const meta = toolMeta(last);
  return (
    <div className="tool-split">
      <IconButton
        className="tool-btn"
        icon={meta.icon}
        iconSize={24}
        label={t(meta.label)}
        shortcut={meta.shortcut || undefined}
        pressed={ids.includes(tool)}
        data-tool={meta.id}
        onClick={() => editor.setTool(last)}
      />
      <IconButton
        className="tool-caret"
        icon="caret"
        iconSize={12}
        label={label}
        aria-haspopup="menu"
        onClick={(e) =>
          openMenu(
            e.currentTarget,
            tools.map((s) => ({
              label: t(s.label),
              icon: s.icon,
              shortcut: s.shortcut || undefined,
              checked: tool === s.id,
              onSelect: () => editor.setTool(s.id),
            })),
          )
        }
      />
    </div>
  );
}

/** Floating bottom toolbar. */
export function Toolbar() {
  const t = useT();
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const canUndo = useEditorState((s) => s.canUndo);
  const canRedo = useEditorState((s) => s.canRedo);
  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      {TOOL_GROUPS.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="toolbar-divider" />}
          {group.map((meta) =>
            Array.isArray(meta) ? (
              <SplitToolButton
                key={meta[0].id}
                tools={meta}
                label={t(meta === SHAPES ? 'toolbar.shapes' : 'toolbar.selections')}
              />
            ) : (
              <IconButton
                key={meta.id}
                className="tool-btn"
                icon={meta.icon}
                iconSize={24}
                label={t(meta.label)}
                shortcut={meta.shortcut}
                pressed={tool === meta.id}
                data-tool={meta.id}
                onClick={() => editor.setTool(meta.id)}
              />
            ),
          )}
        </Fragment>
      ))}
      <div className="toolbar-divider" />
      <IconButton
        className="tool-btn"
        icon="undo"
        iconSize={24}
        label={t('menu.undo')}
        shortcut="Ctrl+Z"
        disabled={!canUndo}
        onClick={() => editor.undo()}
      />
      <IconButton
        className="tool-btn"
        icon="redo"
        iconSize={24}
        label={t('menu.redo')}
        shortcut="Ctrl+Shift+Z"
        disabled={!canRedo}
        onClick={() => editor.redo()}
      />
    </div>
  );
}
