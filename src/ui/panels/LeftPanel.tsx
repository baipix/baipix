import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LayerGroup, PixelDoc } from '../../engine/document';
import {
  groupChain,
  groupLayers,
  isLocked,
  isShown,
  layerTree,
  type LayerItem,
  type LayerNode,
} from '../../engine/groups';
import { useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { openMenu } from '../components/Menu';
import { Section } from '../components/Section';
import { Thumbnail } from '../components/Thumbnail';
import { openAdjust } from '../uiStore';

/** Inline rename on double-click, used by files and layers. */
function EditableName({
  value,
  onRename,
  className = 'item-name',
  startEditing = false,
  onEditingStarted,
}: {
  value: string;
  onRename: (v: string) => void;
  className?: string;
  /** Starts editing from outside (a menu's Rename); `onEditingStarted` then clears the request. */
  startEditing?: boolean;
  onEditingStarted?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  useEffect(() => {
    if (!startEditing) return;
    setEditing(true);
    onEditingStarted?.();
  }, [startEditing, onEditingStarted]);
  if (!editing)
    return (
      <span
        className={className}
        // The full name as a tooltip, only when it's cut with an ellipsis.
        data-tip=""
        onPointerEnter={(e) => {
          const el = e.currentTarget;
          el.dataset.tip = el.scrollWidth > el.clientWidth ? value : '';
        }}
        onDoubleClick={() => setEditing(true)}
      >
        {value}
      </span>
    );
  const done = (save: boolean) => {
    if (save && ref.current) onRename(ref.current.value);
    setEditing(false);
  };
  return (
    <span className={className}>
      <input
        ref={ref}
        defaultValue={value}
        autoFocus
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
        }}
      />
    </span>
  );
}

/** A row of the Layers panel: a layer or a group, at a depth (0: top level). */
type LayerRow =
  | { kind: 'layer'; layer: PixelDoc['layers'][number]; index: number; depth: number; parent?: string }
  | { kind: 'group'; group: LayerGroup; depth: number; parent?: string };

/** The rows, top first; a folded group hides its rows. */
function layerRows(doc: PixelDoc): LayerRow[] {
  const rows: LayerRow[] = [];
  const walk = (nodes: LayerNode[], depth: number, parent?: string) => {
    for (const node of [...nodes].reverse()) {
      if (node.kind === 'layer')
        rows.push({ kind: 'layer', layer: node.layer, index: node.index, depth, parent });
      else {
        rows.push({ kind: 'group', group: node.group, depth, parent });
        if (!node.group.collapsed) walk(node.children, depth + 1, node.group.id);
      }
    }
  };
  walk(layerTree(doc), 0);
  return rows;
}

/**
 * Where rows dropped in a gap go: right under an open group's row, at the top of that group;
 * otherwise right above the row under the gap, in its group; below the last row, at the bottom
 * of its group.
 */
function dropPlace(
  doc: PixelDoc,
  rows: LayerRow[],
  gap: number,
): { parent?: string; aboveLayer: string | null } {
  const top = (row: LayerRow) =>
    row.kind === 'layer' ? row.layer.id : groupLayers(doc, row.group.id).at(-1)!.id;
  const over = rows[gap - 1];
  if (over?.kind === 'group' && !over.group.collapsed)
    return { parent: over.group.id, aboveLayer: top(over) };
  const under = rows[gap];
  if (under) return { parent: under.parent, aboveLayer: top(under) };
  return { parent: over?.parent, aboveLayer: null };
}

function LayersSection() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const doc = useEditorState((s) => s.doc);
  const revision = useEditorState((s) => s.revision);
  const selected = useEditorState((s) => s.selectedLayers);
  const referenceSelected = useEditorState((s) => s.referenceSelected);
  const reference = doc.reference;
  const selectedGroup = useEditorState((s) => s.selectedGroup);
  const multi = !referenceSelected && selected.length > 1;
  const n = doc.layers.length;
  // The layers and groups as rows, top first, folded groups without their children.
  const rows = layerRows(doc);
  const listRef = useRef<HTMLDivElement>(null);
  // Drag to reorder: `gap` is where the dragged rows would land (0: above the first row).
  const [drag, setDrag] = useState<{ ids: string[]; gap: number } | null>(null);
  const dragged = useRef(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  // Right-click: on a selection of several layers, the menu acts on all of them. Otherwise the layer
  // becomes active and the menu acts on it.
  const openLayerMenu = (e: React.MouseEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    const layer = doc.layers[index];
    const flatten = {
      label: t('layer.flatten'),
      icon: 'layers' as const,
      onSelect: () => editor.flattenImage(),
    };
    if (multi && selected.includes(layer.id)) {
      const count = selected.length;
      const visible = doc.layers.filter((l) => selected.includes(l.id) && l.visible).length;
      openMenu(e.currentTarget, [
        {
          label: t('layer.mergeCount', { count }),
          icon: 'merge',
          disabled: visible < 2,
          onSelect: () => editor.mergeLayers(),
        },
        flatten,
        '-',
        {
          label: t('layer.deleteCount', { count }),
          icon: 'trash',
          disabled: count >= n,
          onSelect: () => actions.deleteLayers(),
        },
      ]);
      return;
    }
    editor.setActiveLayer(index);
    openMenu(e.currentTarget, [
      {
        label: t('layer.rename'),
        icon: 'pencil',
        onSelect: () => setRenaming(layer.id),
      },
      { label: t('layer.duplicate'), icon: 'duplicate', onSelect: () => editor.duplicateLayer() },
      {
        label: t('layer.mergeDown'),
        icon: 'merge',
        disabled: index === 0,
        onSelect: () => editor.mergeDown(),
      },
      {
        label: t('layer.mergeVisible'),
        icon: 'layers',
        disabled: doc.layers.filter((l) => l.visible).length < 2,
        onSelect: () => editor.mergeVisible(),
      },
      flatten,
      { label: t('adjust.open'), icon: 'panel', onSelect: () => openAdjust('layer') },
      '-',
      {
        label: layer.locked ? t('layer.unlock') : t('layer.lock'),
        icon: layer.locked ? 'unlock' : 'lock',
        onSelect: () => editor.setLayerLocked(index, !layer.locked),
      },
      { label: t('layer.soloMenu'), icon: 'eye', onSelect: () => editor.soloLayer(index) },
      '-',
      { label: t('layer.delete'), icon: 'trash', disabled: n < 2, onSelect: () => actions.deleteLayers() },
    ]);
  };

  /** Right-click on a group: the group's own menu. */
  const openGroupMenu = (e: React.MouseEvent<HTMLElement>, group: LayerGroup) => {
    e.preventDefault();
    editor.selectGroup(group.id);
    openMenu(e.currentTarget, [
      { label: t('layer.rename'), icon: 'pencil', onSelect: () => setRenaming(group.id) },
      { label: t('group.duplicate'), icon: 'duplicate', onSelect: () => editor.duplicateLayer() },
      { label: t('group.merge'), icon: 'merge', onSelect: () => editor.mergeGroup(group.id) },
      {
        label: t('group.ungroup'),
        icon: 'layers',
        shortcut: 'Ctrl+Shift+G',
        onSelect: () => editor.ungroup(group.id),
      },
      '-',
      {
        label: group.locked ? t('layer.unlock') : t('layer.lock'),
        icon: group.locked ? 'unlock' : 'lock',
        onSelect: () => editor.setGroupLocked(group.id, !group.locked),
      },
      '-',
      {
        label: t('group.delete'),
        icon: 'trash',
        disabled: groupLayers(doc, group.id).length >= n,
        onSelect: () => actions.deleteLayers(),
      },
    ]);
  };

  const startDrag = (e: React.PointerEvent, row: LayerRow) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    const y0 = e.clientY;
    let started = false;
    const gapAt = (y: number) => {
      const els = [...(listRef.current?.querySelectorAll('.item:not(.reference-item)') ?? [])];
      const k = els.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return y < r.top + r.height / 2;
      });
      return k < 0 ? els.length : k;
    };
    // A group moves whole; one of several selected layers moves the whole selection.
    const items: LayerItem[] =
      row.kind === 'group'
        ? [{ kind: 'group', id: row.group.id }]
        : multi && selected.includes(row.layer.id)
          ? editor.selectedItems()
          : [{ kind: 'layer', id: row.layer.id }];
    const ids = items.map((i) => i.id);
    const move = (ev: PointerEvent) => {
      if (!started && Math.abs(ev.clientY - y0) < 4) return;
      started = true;
      document.body.classList.add('is-dragging-layer');
      setDrag({ ids, gap: gapAt(ev.clientY) });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('is-dragging-layer');
      setDrag(null);
      if (!started) return;
      dragged.current = true; // swallow the click that follows the drag
      if (ev.type !== 'pointerup') return;
      const to = dropPlace(doc, rows, gapAt(ev.clientY));
      editor.moveItemsTo(items, to.parent, to.aboveLayer);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const rowId = (row: LayerRow) => (row.kind === 'group' ? row.group.id : row.layer.id);
  const dropClass = (k: number) => {
    if (!drag) return '';
    if (drag.gap === k) return ' drop-before';
    if (drag.gap === rows.length && k === rows.length - 1) return ' drop-after';
    return '';
  };
  // A dragged row, and the rows inside a dragged group.
  const isDragged = (row: LayerRow) =>
    !!drag &&
    (drag.ids.includes(rowId(row)) ||
      groupChain(doc, row.kind === 'group' ? row.group.parent : row.layer.group).some((g) =>
        drag.ids.includes(g.id),
      ));

  return (
    <Section
      title={t('section.layers')}
      className="grow"
      aside={
        <>
          {!reference && (
            <IconButton icon="image" label={t('reference.add')} onClick={() => void actions.addReference()} />
          )}
          <IconButton icon="plus" label={t('layer.new')} onClick={() => editor.addLayer()} />
        </>
      }
    >
      {/* Clicking a layer focuses the list: Delete then removes the layer (on the canvas, it clears pixels). */}
      <div
        className="item-list"
        ref={listRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== 'Delete' && e.key !== 'Backspace') return;
          if ((e.target as HTMLElement).closest('input')) return;
          e.preventDefault();
          e.stopPropagation();
          if (referenceSelected) actions.removeReference();
          else if (selected.length < doc.layers.length) actions.deleteLayers();
        }}
      >
        {rows.map((row, k) =>
          row.kind === 'group' ? (
            <div
              key={row.group.id}
              className={`item group-item${selectedGroup === row.group.id ? ' is-active' : ''}${
                row.group.visible ? '' : ' is-hidden'
              }${row.group.locked ? ' is-locked' : ''}${isDragged(row) ? ' is-dragging' : ''}${dropClass(k)}`}
              style={{ '--depth': row.depth } as CSSProperties}
              onPointerDown={(e) => startDrag(e, row)}
              onContextMenu={(e) => openGroupMenu(e, row.group)}
              onClick={() => {
                listRef.current?.focus({ preventScroll: true });
                if (dragged.current) dragged.current = false;
                else editor.selectGroup(row.group.id);
              }}
            >
              <IconButton
                icon={row.group.collapsed ? 'chevronRight' : 'caret'}
                className="icon-btn group-toggle"
                label={row.group.collapsed ? t('group.expand') : t('group.collapse')}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.setGroupCollapsed(row.group.id, !row.group.collapsed);
                }}
              />
              <span className="group-icon" aria-hidden="true">
                <Icon name="folder" size={16} />
              </span>
              <EditableName
                value={row.group.name}
                onRename={(v) => editor.renameGroup(row.group.id, v)}
                startEditing={renaming === row.group.id}
                onEditingStarted={() => setRenaming(null)}
              />
              {row.group.opacity < 1 && (
                <span className="muted">{Math.round(row.group.opacity * 100)} %</span>
              )}
              <span className="item-actions">
                <IconButton
                  icon={row.group.locked ? 'lock' : 'unlock'}
                  className="icon-btn item-action item-lock"
                  label={row.group.locked ? t('layer.unlock') : t('layer.lock')}
                  pressed={row.group.locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.setGroupLocked(row.group.id, !row.group.locked);
                  }}
                />
                <IconButton
                  icon={row.group.visible ? 'eye' : 'eyeOff'}
                  className="icon-btn item-action"
                  label={row.group.visible ? t('layer.hide') : t('layer.show')}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.setGroupVisible(row.group.id, !row.group.visible);
                  }}
                />
              </span>
            </div>
          ) : (
            <div
              key={row.layer.id}
              className={`item${
                row.index === doc.activeLayer && !referenceSelected && !selectedGroup ? ' is-active' : ''
              }${(multi || selectedGroup) && selected.includes(row.layer.id) ? ' is-selected' : ''}${
                isShown(doc, row.layer) ? '' : ' is-hidden'
              }${isLocked(doc, row.layer) ? ' is-locked' : ''}${isDragged(row) ? ' is-dragging' : ''}${dropClass(k)}`}
              style={{ '--depth': row.depth } as CSSProperties}
              onPointerDown={(e) => startDrag(e, row)}
              onContextMenu={(e) => openLayerMenu(e, row.index)}
              onClick={(e) => {
                listRef.current?.focus({ preventScroll: true });
                if (dragged.current) dragged.current = false;
                else
                  editor.selectLayer(
                    row.index,
                    e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single',
                  );
              }}
            >
              <Thumbnail
                pixels={() => row.layer.pixels}
                width={doc.width}
                height={doc.height}
                version={revision}
              />
              <EditableName
                value={row.layer.name}
                onRename={(v) => editor.renameLayer(row.index, v)}
                startEditing={renaming === row.layer.id}
                onEditingStarted={() => setRenaming(null)}
              />
              {row.layer.opacity < 1 && (
                <span className="muted">{Math.round(row.layer.opacity * 100)} %</span>
              )}
              <span className="item-actions">
                <IconButton
                  icon={row.layer.locked ? 'lock' : 'unlock'}
                  className="icon-btn item-action item-lock"
                  label={row.layer.locked ? t('layer.unlock') : t('layer.lock')}
                  pressed={row.layer.locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.setLayerLocked(row.index, !row.layer.locked);
                  }}
                />
                <IconButton
                  icon={row.layer.visible ? 'eye' : 'eyeOff'}
                  className="icon-btn item-action"
                  label={row.layer.visible ? t('layer.hide') : t('layer.show')}
                  shortcut={t('layer.solo')}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.altKey) editor.soloLayer(row.index);
                    else editor.setLayerVisible(row.index, !row.layer.visible);
                  }}
                />
              </span>
            </div>
          ),
        )}
        {reference && (
          // Always last: it sits under every layer and can't be reordered.
          <div
            className={`item reference-item${referenceSelected ? ' is-active' : ''}${
              reference.visible ? '' : ' is-hidden'
            }${reference.locked ? ' is-locked' : ''}`}
            onClick={() => {
              listRef.current?.focus({ preventScroll: true });
              editor.selectReference();
            }}
          >
            <img className="thumb reference-thumb" src={reference.src} alt="" />
            <span className="item-name">{t('reference.title')}</span>
            {reference.opacity < 1 && <span className="muted">{Math.round(reference.opacity * 100)} %</span>}
            <span className="item-actions">
              <IconButton
                icon={reference.locked ? 'lock' : 'unlock'}
                className="icon-btn item-action item-lock"
                label={reference.locked ? t('layer.unlock') : t('layer.lock')}
                pressed={reference.locked}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.updateReference({ locked: !reference.locked });
                }}
              />
              <IconButton
                icon={reference.visible ? 'eye' : 'eyeOff'}
                className="icon-btn item-action"
                label={reference.visible ? t('reference.hide') : t('reference.show')}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.updateReference({ visible: !reference.visible });
                }}
              />
            </span>
          </div>
        )}
      </div>
      <div className="layer-actions">
        <IconButton
          icon="duplicate"
          label={t('layer.duplicate')}
          disabled={referenceSelected}
          onClick={() => editor.duplicateLayer()}
        />
        <IconButton
          icon="up"
          label={t('layer.moveUp')}
          disabled={referenceSelected || !editor.canMoveLayer(1)}
          onClick={() => editor.moveLayer(1)}
        />
        <IconButton
          icon="down"
          label={t('layer.moveDown')}
          disabled={referenceSelected || !editor.canMoveLayer(-1)}
          onClick={() => editor.moveLayer(-1)}
        />
        <IconButton
          icon="merge"
          label={
            selectedGroup
              ? t('group.merge')
              : multi
                ? t('layer.mergeCount', { count: selected.length })
                : t('layer.mergeDown')
          }
          disabled={referenceSelected || (!selectedGroup && !multi && !editor.canMergeDown())}
          onClick={() =>
            selectedGroup
              ? editor.mergeGroup(selectedGroup)
              : multi
                ? editor.mergeLayers()
                : editor.mergeDown()
          }
        />
        <IconButton
          icon="folderPlus"
          label={t('group.create')}
          shortcut="Ctrl+G"
          disabled={referenceSelected}
          onClick={() => editor.groupSelection()}
        />
        <span className="spacer" />
        {referenceSelected ? (
          <IconButton icon="trash" label={t('reference.remove')} onClick={() => actions.removeReference()} />
        ) : (
          <IconButton
            icon="trash"
            label={
              selectedGroup
                ? t('group.delete')
                : multi
                  ? t('layer.deleteCount', { count: selected.length })
                  : t('layer.delete')
            }
            disabled={doc.layers.length < 2 || selected.length >= doc.layers.length}
            onClick={() => actions.deleteLayers()}
          />
        )}
      </div>
    </Section>
  );
}

export function LeftPanel() {
  const t = useT();
  return (
    <aside className="panel panel-left" aria-label={t('panel.left')}>
      <LayersSection />
    </aside>
  );
}
