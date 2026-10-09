import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { findMaster, isLinkedInstance, masters, spritePixels } from '../../engine/components';
import type { LayerGroup, PixelDoc } from '../../engine/document';
import {
  groupChain,
  groupDepth,
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
import { COMPONENT_MIME } from '../dragTypes';
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

/** Where dragged rows would land: in a gap between rows (0: above the first) at a depth, or into a group's row. */
type DropTarget = { gap: number; depth: number } | { into: number };

/**
 * The depths a gap offers. Right under an open group's row, only inside it. Where groups end, from
 * the row above's depth (the bottom of its group) out to the row below's: the pointer picks.
 */
function gapDepths(rows: LayerRow[], gap: number): [number, number] {
  const over = rows[gap - 1];
  const under = rows[gap];
  if (over?.kind === 'group' && !over.group.collapsed) return [over.depth + 1, over.depth + 1];
  const min = under?.depth ?? 0;
  return [min, Math.max(min, over?.depth ?? 0)];
}

/**
 * Where rows dropped on a target go. Into a group: at its top. In a gap: right under an open
 * group's row, at the top of that group; deeper than the row below, at the bottom of the group
 * that ends there; otherwise right above the row below, in its group (or at the very bottom).
 */
function dropPlace(
  doc: PixelDoc,
  rows: LayerRow[],
  target: DropTarget,
): { parent?: string; aboveLayer: string | null } {
  const top = (row: LayerRow) =>
    row.kind === 'layer' ? row.layer.id : groupLayers(doc, row.group.id).at(-1)!.id;
  if ('into' in target) {
    const row = rows[target.into];
    return row.kind === 'group' ? { parent: row.group.id, aboveLayer: top(row) } : { aboveLayer: null };
  }
  const { gap, depth } = target;
  const over = rows[gap - 1];
  if (over?.kind === 'group' && !over.group.collapsed)
    return { parent: over.group.id, aboveLayer: top(over) };
  const under = rows[gap];
  if (over && depth > (under?.depth ?? 0)) {
    const parent = groupChain(doc, over.parent).find((g) => groupDepth(doc, g.id) === depth);
    if (parent) return { parent: parent.id, aboveLayer: null };
  }
  if (under) return { parent: under.parent, aboveLayer: top(under) };
  return { parent: undefined, aboveLayer: null };
}

/**
 * The document's components (their masters, top first): drag one onto the canvas to add an
 * instance, click one to select its master. Only shown once there's a component.
 */
function ComponentsSection() {
  const t = useT();
  const editor = useEditor();
  const doc = useEditorState((s) => s.doc);
  const revision = useEditorState((s) => s.revision);
  const list = masters(doc).reverse();
  if (!list.length) return null;
  return (
    <Section id="components" title={t('section.components')} info={t('component.dragHint')}>
      <div className="item-list">
        {list.map((m) => (
          <div
            key={m.id}
            className="item component-item"
            draggable
            title={t('component.dragHint')}
            onDragStart={(e) => {
              e.dataTransfer.setData(COMPONENT_MIME, m.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => editor.selectLayer(doc.layers.indexOf(m), 'single')}
          >
            <Thumbnail
              pixels={() => spritePixels(doc, m)}
              width={m.component!.w}
              height={m.component!.h}
              version={revision}
            />
            <span className="component-icon">
              <Icon name="component" size={12} />
            </span>
            <span className="item-name">{m.name}</span>
          </div>
        ))}
      </div>
    </Section>
  );
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
  // A component needs something drawn on a plain layer (not an instance, not one already).
  const active = doc.layers[doc.activeLayer];
  const canMakeComponent =
    !referenceSelected &&
    !multi &&
    !selectedGroup &&
    !!active &&
    !active.instance &&
    !active.component &&
    active.pixels.some((c) => c !== 0);
  // The layers and groups as rows, top first, folded groups without their children.
  const rows = layerRows(doc);
  const listRef = useRef<HTMLDivElement>(null);
  // Drag to reorder: `target` is where the dragged rows would land.
  const [drag, setDrag] = useState<{ ids: string[]; target: DropTarget } | null>(null);
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
          label: t('layer.duplicateCount', { count }),
          icon: 'duplicate',
          shortcut: 'Shift+D',
          onSelect: () => editor.duplicateLayer(),
        },
        {
          label: t('group.create'),
          icon: 'folderPlus',
          shortcut: 'Ctrl+G',
          onSelect: () => editor.groupSelection(),
        },
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
      { label: t('repeat.menu'), icon: 'repeat', onSelect: () => editor.beginRepeat() },
      {
        label: t('group.create'),
        icon: 'folderPlus',
        shortcut: 'Ctrl+G',
        onSelect: () => editor.groupSelection(),
      },
      // An instance offers its own two actions in place of making a component of it.
      ...(isLinkedInstance(doc, layer)
        ? [
            { label: t('component.goTo'), icon: 'component' as const, onSelect: () => editor.goToMaster() },
            {
              label: t('component.detach'),
              icon: 'detach' as const,
              shortcut: 'Ctrl+Alt+B',
              onSelect: () => editor.detachInstance(),
            },
          ]
        : [
            {
              label: t('component.create'),
              icon: 'component' as const,
              shortcut: 'Ctrl+Alt+K',
              disabled: !!layer.component || !layer.pixels.some((c) => c !== 0),
              onSelect: () => editor.createComponent(),
            },
          ]),
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
    // Rows indent 16px a level (see .item in app.css): the pointer's x picks the depth of a gap.
    const targetAt = (x: number, y: number): DropTarget => {
      const els = [...(listRef.current?.querySelectorAll('.item:not(.reference-item)') ?? [])];
      const left = els[0]?.getBoundingClientRect().left ?? 0;
      const gap = (k: number): DropTarget => {
        const [min, max] = gapDepths(rows, k);
        return { gap: k, depth: Math.max(min, Math.min(max, Math.floor((x - left - 8) / 16))) };
      };
      for (let k = 0; k < els.length; k++) {
        const r = els[k].getBoundingClientRect();
        if (y >= r.bottom) continue;
        // The middle of a group's row: into the group, folded or not.
        const row = rows[k];
        const dragged =
          row.kind === 'group' &&
          [row.group.id, ...groupChain(doc, row.group.parent).map((g) => g.id)].some((id) =>
            ids.includes(id),
          );
        if (row.kind === 'group' && !dragged && y > r.top + r.height / 4 && y < r.bottom - r.height / 4)
          return { into: k };
        return gap(y < r.top + r.height / 2 ? k : k + 1);
      }
      return gap(els.length);
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
      setDrag({ ids, target: targetAt(ev.clientX, ev.clientY) });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('is-dragging-layer');
      setDrag(null);
      if (!started) return;
      // Swallow the click that follows the drag, if one does (released on another row, none does).
      dragged.current = true;
      setTimeout(() => (dragged.current = false));
      if (ev.type !== 'pointerup') return;
      const to = dropPlace(doc, rows, targetAt(ev.clientX, ev.clientY));
      editor.moveItemsTo(items, to.parent, to.aboveLayer);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const rowId = (row: LayerRow) => (row.kind === 'group' ? row.group.id : row.layer.id);
  const dropClass = (k: number) => {
    const target = drag?.target;
    if (!target) return '';
    if ('into' in target) return target.into === k ? ' drop-into' : '';
    if (target.gap === k) return ' drop-before';
    if (target.gap === rows.length && k === rows.length - 1) return ' drop-after';
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
          <IconButton
            icon="component"
            label={t('component.create')}
            shortcut="Ctrl+Alt+K"
            disabled={!canMakeComponent}
            onClick={() => editor.createComponent()}
          />
          <IconButton icon="plus" label={t('layer.new')} onClick={() => editor.addLayer()} />
        </>
      }
    >
      {/* Delete in the list removes the layers even with pixels selected (on the canvas, it clears them). */}
      <div
        className="item-list"
        ref={listRef}
        tabIndex={-1}
        // The drop line sits at the depth the dragged rows would land at.
        style={
          drag && 'depth' in drag.target
            ? ({ '--drop-depth': drag.target.depth } as CSSProperties)
            : undefined
        }
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
              {row.layer.component && (
                <span className="component-icon" title={t('component.master')}>
                  <Icon name="component" size={12} />
                </span>
              )}
              {row.layer.instance && findMaster(doc, row.layer.instance.of) && (
                <span
                  className="component-icon is-instance"
                  title={t('component.instance', { name: findMaster(doc, row.layer.instance.of)!.name })}
                >
                  <Icon name="instance" size={12} />
                </span>
              )}
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
    </Section>
  );
}

export function LeftPanel() {
  const t = useT();
  return (
    <aside className="panel panel-left" aria-label={t('panel.left')}>
      <ComponentsSection />
      <LayersSection />
    </aside>
  );
}
