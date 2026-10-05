import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
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

function LayersSection() {
  const t = useT();
  const editor = useEditor();
  const actions = useActions();
  const doc = useEditorState((s) => s.doc);
  const revision = useEditorState((s) => s.revision);
  const selected = useEditorState((s) => s.selectedLayers);
  const referenceSelected = useEditorState((s) => s.referenceSelected);
  const reference = doc.reference;
  const multi = !referenceSelected && selected.length > 1;
  const layers = doc.layers.map((layer, index) => ({ layer, index })).reverse();
  const n = layers.length;
  const listRef = useRef<HTMLDivElement>(null);
  // Drag to reorder: `slot` is the gap (in display order, top first) where the layer would land.
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null);
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

  const startDrag = (e: React.PointerEvent, displayPos: number, index: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    const y0 = e.clientY;
    let started = false;
    const slotAt = (y: number) => {
      const items = [...(listRef.current?.querySelectorAll('.item:not(.reference-item)') ?? [])];
      const k = items.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return y < r.top + r.height / 2;
      });
      return k < 0 ? items.length : k;
    };
    // Dragging one of several selected layers moves the whole selection.
    const group = multi && selected.includes(doc.layers[index].id);
    const move = (ev: PointerEvent) => {
      if (!started && Math.abs(ev.clientY - y0) < 4) return;
      started = true;
      document.body.classList.add('is-dragging-layer');
      setDrag({ from: index, slot: slotAt(ev.clientY) });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('is-dragging-layer');
      setDrag(null);
      if (!started) return;
      dragged.current = true; // swallow the click that follows the drag
      const slot = slotAt(ev.clientY);
      const pos = slot > displayPos ? slot - 1 : slot;
      if (ev.type !== 'pointerup') return;
      if (group) editor.moveLayersTo(n - slot);
      else editor.reorderLayer(index, n - 1 - pos);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  // No indicator when dropping would not move the layer.
  const dropClass = (displayPos: number) => {
    if (!drag) return '';
    const from = n - 1 - drag.from;
    if (!multi && (drag.slot === from || drag.slot === from + 1)) return '';
    if (drag.slot === displayPos) return ' drop-before';
    if (drag.slot === n && displayPos === n - 1) return ' drop-after';
    return '';
  };
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
        {layers.map(({ layer, index }, displayPos) => (
          <div
            key={layer.id}
            className={`item${index === doc.activeLayer && !referenceSelected ? ' is-active' : ''}${
              multi && selected.includes(layer.id) ? ' is-selected' : ''
            }${layer.visible ? '' : ' is-hidden'}${layer.locked ? ' is-locked' : ''}${
              drag &&
              (drag.from === index ||
                (multi && selected.includes(doc.layers[drag.from]?.id) && selected.includes(layer.id)))
                ? ' is-dragging'
                : ''
            }${dropClass(displayPos)}`}
            onPointerDown={(e) => startDrag(e, displayPos, index)}
            onContextMenu={(e) => openLayerMenu(e, index)}
            onClick={(e) => {
              listRef.current?.focus({ preventScroll: true });
              if (dragged.current) dragged.current = false;
              else
                editor.selectLayer(
                  index,
                  e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single',
                );
            }}
          >
            <Thumbnail pixels={() => layer.pixels} width={doc.width} height={doc.height} version={revision} />
            <EditableName
              value={layer.name}
              onRename={(v) => editor.renameLayer(index, v)}
              startEditing={renaming === layer.id}
              onEditingStarted={() => setRenaming(null)}
            />
            {layer.opacity < 1 && <span className="muted">{Math.round(layer.opacity * 100)} %</span>}
            <span className="item-actions">
              <IconButton
                icon={layer.locked ? 'lock' : 'unlock'}
                className="icon-btn item-action item-lock"
                label={layer.locked ? t('layer.unlock') : t('layer.lock')}
                pressed={layer.locked}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.setLayerLocked(index, !layer.locked);
                }}
              />
              <IconButton
                icon={layer.visible ? 'eye' : 'eyeOff'}
                className="icon-btn item-action"
                label={layer.visible ? t('layer.hide') : t('layer.show')}
                shortcut={t('layer.solo')}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.altKey) editor.soloLayer(index);
                  else editor.setLayerVisible(index, !layer.visible);
                }}
              />
            </span>
          </div>
        ))}
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
          disabled={referenceSelected || doc.activeLayer >= doc.layers.length - 1}
          onClick={() => editor.moveLayer(1)}
        />
        <IconButton
          icon="down"
          label={t('layer.moveDown')}
          disabled={referenceSelected || doc.activeLayer === 0}
          onClick={() => editor.moveLayer(-1)}
        />
        <IconButton
          icon="merge"
          label={multi ? t('layer.mergeCount', { count: selected.length }) : t('layer.mergeDown')}
          disabled={referenceSelected || (multi ? false : doc.activeLayer === 0)}
          onClick={() => (multi ? editor.mergeLayers() : editor.mergeDown())}
        />
        <span className="spacer" />
        {referenceSelected ? (
          <IconButton icon="trash" label={t('reference.remove')} onClick={() => actions.removeReference()} />
        ) : (
          <IconButton
            icon="trash"
            label={multi ? t('layer.deleteCount', { count: selected.length }) : t('layer.delete')}
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
