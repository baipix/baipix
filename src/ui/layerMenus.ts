import { isLinkedInstance } from '../engine/components';
import type { LayerGroup } from '../engine/document';
import type { Editor } from '../engine/editor';
import { groupLayers } from '../engine/groups';
import { t } from '../i18n';
import type { Actions } from './actions';
import type { MenuItem } from './components/Menu';
import { createStore } from './store';
import { openAdjust } from './uiStore';

/**
 * The right-click menus of a layer and of a group, the same in the Layers panel and on the canvas.
 */

/** The layer or group whose name the Layers panel edits, asked for from a menu. */
export const renameStore = createStore<{ id: string | null }>({ id: null });

/** Arrange: the selected layer or group to the front, forward, backward or to the back of its group. */
export function arrangeItem(editor: Editor): Exclude<MenuItem, '-'> {
  return {
    label: t('menu.arrange'),
    icon: 'layers',
    items: [
      {
        label: t('menu.bringToFront'),
        shortcut: 'Ctrl+Shift+]',
        disabled: !editor.canMoveLayer(1),
        onSelect: () => editor.moveLayerToEnd(1),
      },
      {
        label: t('menu.layerUp'),
        shortcut: 'Ctrl+]',
        disabled: !editor.canMoveLayer(1),
        onSelect: () => editor.moveLayer(1),
      },
      {
        label: t('menu.layerDown'),
        shortcut: 'Ctrl+[',
        disabled: !editor.canMoveLayer(-1),
        onSelect: () => editor.moveLayer(-1),
      },
      {
        label: t('menu.sendToBack'),
        shortcut: 'Ctrl+Shift+[',
        disabled: !editor.canMoveLayer(-1),
        onSelect: () => editor.moveLayerToEnd(-1),
      },
    ],
  };
}

// Right-click: on a selection of several layers, the menu acts on all of them. Otherwise the layer
// becomes active and the menu acts on it.
export function layerMenuItems(editor: Editor, actions: Actions, index: number): MenuItem[] {
  const { doc, selectedLayers: selected, referenceSelected } = editor.getState();
  const multi = !referenceSelected && selected.length > 1;
  const n = doc.layers.length;
  const layer = doc.layers[index];
  const flatten = {
    label: t('layer.flatten'),
    icon: 'layers' as const,
    onSelect: () => editor.flattenImage(),
  };
  if (multi && selected.includes(layer.id)) {
    const count = selected.length;
    const visible = doc.layers.filter((l) => selected.includes(l.id) && l.visible).length;
    return [
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
        onSelect: () => actions.deleteLayers(),
      },
    ];
  }
  editor.setActiveLayer(index);
  return [
    {
      label: t('layer.rename'),
      icon: 'pencil',
      onSelect: () => renameStore.set({ id: layer.id }),
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
    arrangeItem(editor),
    '-',
    {
      label: layer.locked ? t('layer.unlock') : t('layer.lock'),
      icon: layer.locked ? 'unlock' : 'lock',
      onSelect: () => editor.setLayerLocked(index, !layer.locked),
    },
    { label: t('layer.soloMenu'), icon: 'eye', onSelect: () => editor.soloLayer(index) },
    '-',
    { label: t('layer.delete'), icon: 'trash', disabled: n < 2, onSelect: () => actions.deleteLayers() },
  ];
}

/** Right-click on a group: the group's own menu. */
export function groupMenuItems(editor: Editor, actions: Actions, group: LayerGroup): MenuItem[] {
  const { doc } = editor.getState();
  const n = doc.layers.length;
  editor.selectGroup(group.id);
  return [
    { label: t('layer.rename'), icon: 'pencil', onSelect: () => renameStore.set({ id: group.id }) },
    { label: t('group.duplicate'), icon: 'duplicate', onSelect: () => editor.duplicateLayer() },
    { label: t('group.merge'), icon: 'merge', onSelect: () => editor.mergeGroup(group.id) },
    {
      label: t('group.ungroup'),
      icon: 'layers',
      shortcut: 'Ctrl+Shift+G',
      onSelect: () => editor.ungroup(group.id),
    },
    '-',
    arrangeItem(editor),
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
  ];
}
